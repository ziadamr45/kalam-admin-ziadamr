import {
  getOrigin,
  getMcpTokenVersion,
  oauthPasswordOk,
  OAUTH_SCOPE,
  signOAuthToken,
  AUTH_CODE_TTL_SEC,
  validRedirectUri,
  verifyClientId,
} from "@/lib/mcp/oauth";
import { MCP_SERVER_VERSION, MCP_TOOLS } from "@/lib/mcp/schemas";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { decideIpAccess } from "@/lib/iprules";
import { getClientIp, raiseAlert, writeAudit } from "@/lib/guard";
import { pushAdmins } from "@/lib/push";
import { resolveEmailConfig, OWNER_EMAIL } from "@/lib/notifications/dispatcher";
import { decryptSecret } from "@/lib/crypto";
import { verifyTotpToken } from "@/lib/totp";

/**
 * ============================================================
 * نقطة التفويض (RFC 6749 §3.1) — واجهة عربية سيادية بصرية لصاحب المنصة
 * ============================================================
 * تُفتح هذه الصفحة في نافذة عند ربط أي أداة ذكاء اصطناعي أو نظام خارجي
 * أو شخص مفوّض بالخادم أول مرة. البوابة تتحكم في المنصة والكود بالكامل،
 * لذا التفويض محصّن بخمس طبقات متكاملة:
 *   1. كلمة مرور التفويض (سرّ حصري لصاحب المنصة)
 *   2. التحقق الثنائي TOTP من سرّ الأدمن المفعّل في AdminUser — حتى لو
 *      سُربت كلمة المرور لا يمر اتصال بلا تطبيق المصادقة على الموبايل
 *   3. درع تخمين دائم في قاعدة البيانات (LoginAttempt + قواعد IpRule +
 *      درع اندفاع خالٍ من الاستعلامات) — لا يُصفَّر مع أي Cold Start
 *   4. جدار IP الصارم نفسه الذي يحمي دخول اللوحة
 *   5. عند النجاح: إشعار Web Push فوري + بريد أمني للمالك (اسم الجهة
 *      والـIP والوقت بتوقيت القاهرة) + رمز تفويض يحمل رقم الإلغاء tv —
 *      وأي زيادة لرقم الإلغاء (mcp revoke-tokens في التيرمينال السيادي)
 *      تنهي كل الرموز المفتوحة فورًا
 *
 * الهوية البصرية موحّدة مع صفحة دخول اللوحة السيادية (/login):
 * خط Readex Pro، خلفية الكحلي الفولاذي المتدرج، شعار الريشة الرسمي،
 * وزر النحاسي الفخم.
 */

export const runtime = "nodejs";

type AuthorizeParams = {
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
  method: string;
  scope: string;
  resource: string;
};

/** هوية الفاعل في درع قاعدة البيانات — كل محاولات التفويض تُحسب عليها */
const OAUTH_ACTOR = "mcp-authorize";
const MAX_FAILS_15MIN = 5;
const MAX_FAILS_HOUR = 12;
const BURST_PER_MIN = 10;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function extractParams(search: URLSearchParams): AuthorizeParams {
  return {
    clientId: search.get("client_id") ?? "",
    redirectUri: search.get("redirect_uri") ?? "",
    state: search.get("state") ?? "",
    challenge: search.get("code_challenge") ?? "",
    method: search.get("code_challenge_method") ?? "S256",
    scope: search.get("scope") ?? OAUTH_SCOPE,
    resource: search.get("resource") ?? "",
  };
}

/** تحقق شامل من صحة طلب التفويض قبل رسم الصفحة أو إصدار رمز */
function validate(params: AuthorizeParams):
  | { ok: true; client: { name: string; redirectUris: string[]; iat: number } }
  | { ok: false; errorCode: string; errorDesc: string } {
  const client = verifyClientId(params.clientId);
  if (!client) {
    return { ok: false, errorCode: "invalid_client", errorDesc: "client_id غير صالح أو غير موقّع" };
  }
  if (!validRedirectUri(params.redirectUri) || !client.redirectUris.includes(params.redirectUri)) {
    return {
      ok: false,
      errorCode: "invalid_request",
      errorDesc: "redirect_uri غير مسجلة لهذا العميل",
    };
  }
  if (!params.challenge) {
    return {
      ok: false,
      errorCode: "invalid_request",
      errorDesc: "PKCE إلزامي — code_challenge مفقود",
    };
  }
  if (!["S256", "plain"].includes(params.method)) {
    return {
      ok: false,
      errorCode: "invalid_request",
      errorDesc: "طريقة code_challenge_method غير مدعومة",
    };
  }
  return { ok: true, client };
}

/** الأدمن المفعّل بالتحقق الثنائي — سرّ TOTP يُفك ويُدقق عند كل محاولة */
async function totpAdmin(): Promise<{ id: string; username: string; secretEnc: string } | null> {
  try {
    const admin = await prisma.adminUser.findFirst({
      where: { totpEnabled: true },
      select: { id: true, username: true, totpSecretEnc: true },
    });
    if (!admin?.totpSecretEnc) return null;
    return { id: admin.id, username: admin.username, secretEnc: admin.totpSecretEnc };
  } catch {
    return null;
  }
}

/** تسجيل محاولة فاشلة في الدرع الدائم — لا يُصفَّر مع أي تشغيل جديد */
async function recordFail(ip: string, reason: string): Promise<void> {
  await prisma.loginAttempt
    .create({ data: { username: OAUTH_ACTOR, ip, success: false, reason } })
    .catch(() => {});
}

/* الهوية السيادية المشتركة بين صفحتي التفويض والخطأ — موحّدة مع لوحة التحكم */
const IDENTITY_HEAD = `<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Readex+Pro:wght@300;400;600;700&display=swap" rel="stylesheet"/>`;

const IDENTITY_CSS = `
  :root { color-scheme: dark; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px;
    background:radial-gradient(1100px 720px at 50% -8%, #111c30 0%, #0d1626 48%, #070e19 100%);
    font-family:"Readex Pro","Segoe UI",Tahoma,sans-serif; color:#f4f6f9; }
  .card { width:100%; max-width:470px; background:#111c30; border:1px solid #1f3050; border-top:3px solid #b87333;
    border-radius:20px; padding:34px 30px; box-shadow:0 24px 60px rgba(7,14,25,.55), 0 0 0 1px rgba(184,115,51,.07); }
  .logo { display:block; width:64px; height:64px; border-radius:16px; margin:0 auto 16px;
    box-shadow:0 10px 26px rgba(7,14,25,.6), 0 0 0 1px rgba(184,115,51,.25); }
  .badge { display:block; width:max-content; margin:0 auto 14px; background:rgba(184,115,51,.12);
    border:1px solid rgba(184,115,51,.4); color:#e8c87e; font-size:10.5px; font-weight:700;
    border-radius:999px; padding:4px 12px; letter-spacing:.4px; }
  h1 { font-size:18.5px; text-align:center; line-height:1.8; margin-bottom:10px; color:#f5ebd3; }
  p { font-size:13px; color:#9daec8; line-height:2; }
  .code { margin-top:16px; display:inline-block; background:#3d0d0d; border:1px solid #b91c1c; color:#fecaca;
    font-size:12px; border-radius:10px; padding:8px 14px; }
`;

function errorHtml(title: string, detail: string): Response {
  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(title)} — كلام له لازمة</title>
${IDENTITY_HEAD}
<style>${IDENTITY_CSS}
  h1 { margin-bottom:8px; }
</style>
</head>
<body>
  <div class="card">
    <img class="logo" src="/icons/icon-192.png" alt="شعار كلام له لازمة"/>
    <span class="badge">خادم MCP — كلام له لازمة</span>
    <h1>${escapeHtml(title)}</h1>
    <p style="text-align:center">${escapeHtml(detail)}</p>
    <span class="code">خادم MCP — كلام له لازمة</span>
  </div>
</body>
</html>`;
  return new Response(html, {
    status: 400,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function consentHtml(
  origin: string,
  params: AuthorizeParams,
  clientName: string,
  errorMessage: string,
  hasTotp: boolean,
): Response {
  const actionUrl = `${origin}/api/mcp/oauth/authorize`;
  const cancelUrl = `${params.redirectUri}?error=access_denied${
    params.state ? `&state=${encodeURIComponent(params.state)}` : ""
  }`;
  const errBlock = errorMessage
    ? `<div class="err">${escapeHtml(errorMessage)}</div>`
    : "";
  const totpBlock = hasTotp
    ? `<label for="totp">رمز التحقق الثنائي (TOTP) — من تطبيق المصادقة على موبايلك</label>
      <input id="totp" name="totp" type="text" class="authinput otp" inputmode="numeric" maxlength="6" autocomplete="one-time-code" required placeholder="٠٠٠٠٠٠"/>`
    : `<p class="warn2fa">⚠ التحقق الثنائي غير مفعّل للحساب بعد — فعّله من صفحة الأمان في اللوحة ليكتمل درع التفويض</p>`;
  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>تفويض الاتصال بالبوابة السيادية — كلام له لازمة</title>
${IDENTITY_HEAD}
<style>${IDENTITY_CSS}
  .sub { font-size:12.5px; text-align:center; margin-bottom:14px; }
  .client { font-weight:800; color:#e8c87e; }
  .redirect { background:rgba(13,22,38,.72); border:1px dashed rgba(184,115,51,.5); border-radius:12px;
    padding:10px 13px; font-size:11.5px; color:#e8c87e; margin-bottom:16px; line-height:1.95; }
  .redirect span { color:#f4f6f9; word-break:break-all; unicode-bidi:embed; }
  ul { list-style:none; margin:0 0 6px; display:grid; gap:9px; }
  li { background:rgba(13,22,38,.72); border:1px solid #1f3050; border-right:3px solid #b87333;
    border-radius:12px; padding:11px 14px; font-size:11.8px; color:#cbd4e2; line-height:1.95; }
  li b { color:#e8c87e; font-size:12.5px; display:block; margin-bottom:3px; }
  .hint { font-size:11px; color:#66809f; text-align:center; margin-bottom:18px; }
  label { display:block; font-size:12px; color:#9daec8; margin-bottom:7px; font-weight:700; }
  .authinput { width:100%; background:rgba(13,22,38,.72); border:1px solid #1f3050; border-radius:12px;
    padding:13px 15px; font-size:14px; font-family:inherit; color:#f4f6f9; outline:none; transition:border-color .2s; }
  .authinput:focus { border-color:#b87333; box-shadow:0 0 0 3px rgba(184,115,51,.15); }
  .authinput.otp { letter-spacing:10px; text-align:center; font-size:16px; font-weight:700; margin-bottom:14px; }
  .warn2fa { background:rgba(120,53,15,.28); border:1px solid rgba(184,115,51,.45); color:#e8c87e;
    font-size:11.5px; border-radius:10px; padding:9px 12px; line-height:1.9; }
  .err { background:#3d0d0d; border:1px solid #b91c1c; color:#fecaca; font-size:12px; border-radius:10px;
    padding:9px 12px; margin-bottom:14px; text-align:center; }
  button { width:100%; margin-top:16px; background:linear-gradient(135deg,#b87333,#a16a1f); border:0; border-radius:14px;
    padding:14px; font-size:15px; font-weight:700; font-family:inherit; color:#ffffff; cursor:pointer;
    box-shadow:0 10px 24px rgba(161,106,31,.28); transition:filter .2s, transform .2s; }
  button:hover { filter:brightness(1.08); }
  button:active { transform:translateY(1px); }
  button:disabled { cursor:wait; filter:brightness(.9); }
  .spin { display:inline-block; width:14px; height:14px; border:2px solid rgba(255,255,255,.35);
    border-top-color:#fff; border-radius:50%; animation:spin .7s linear infinite; vertical-align:-2px; margin-inline-end:8px; }
  @keyframes spin { to { transform:rotate(360deg); } }
  a.cancel { display:block; text-align:center; margin-top:13px; color:#66809f; font-size:12.5px; text-decoration:none; }
  a.cancel:hover { color:#9daec8; }
  .foot { margin-top:20px; padding-top:14px; border-top:1px solid #1f3050; font-size:10.8px; color:#66809f;
    text-align:center; line-height:2; }
  .foot b { color:#9daec8; }
</style>
</head>
<body>
  <div class="card">
    <img class="logo" src="/icons/icon-192.png" alt="شعار كلام له لازمة"/>
    <span class="badge">بوابة MCP السيادية — الإصدار ${MCP_SERVER_VERSION}</span>
    <h1>تفويض الاتصال بالبوابة السيادية — كلام له لازمة</h1>
    <p class="sub">الجهة <span class="client">${escapeHtml(clientName)}</span> يطلب اتصالًا سياديًا كاملًا ببوابة الإدارة والمنصة (MCP v${MCP_SERVER_VERSION}) — لا تمنح التفويض إلا لجهة أو أداة تثق بها تمامًا</p>
    <div class="redirect"><b>وجهة إعادة التوجيه (redirect_uri) — تأكد بعينيك قبل الموافقة:</b><br/><span>${escapeHtml(params.redirectUri)}</span></div>
    <ul>
      <li><b>المحتوى والذكاء الاصطناعي</b>إدارة كاملة للمقالات والأقسام، توليد الأغلفة بالذكاء الاصطناعي، التوليد الصوتي المتعدد الأصوات، ومحاور المقالات الذكي</li>
      <li><b>المجتمع والهوية والرقابة</b>إدارة القراء، التوثيق الرسمي والعضويات المميزة (VIP)، رصيد الأثر، التعليقات، البث الجماهيري والإشعارات</li>
      <li><b>السيادة والأمن والتكوين</b>تعديل إعدادات وهوية المنصة لحظيًا (Zero-Deploy)، مركز الأمن، التيرمينال السيادي، التقارير الرقابية (PDF) والمحو الشامل</li>
      <li><b>البنية التحتية الكاملة</b>قراءة وتعديل الكود والفروع (GitHub)، إدارة النشر ومتغيرات البيئة والنطاقات (Vercel)، قاعدة البيانات التنفيذية (Neon)، وخدمات البريد والوسائط (Resend &amp; Cloudinary)</li>
    </ul>
    <p class="hint">${MCP_TOOLS.length} أداة سيادية تغطي كل ذرة في المنصة — كل عملية تُوثَّق في سجل التدقيق</p>
    ${errBlock}
    <form method="post" action="${escapeHtml(actionUrl)}" id="authform">
      <input type="hidden" name="client_id" value="${escapeHtml(params.clientId)}"/>
      <input type="hidden" name="redirect_uri" value="${escapeHtml(params.redirectUri)}"/>
      <input type="hidden" name="state" value="${escapeHtml(params.state)}"/>
      <input type="hidden" name="code_challenge" value="${escapeHtml(params.challenge)}"/>
      <input type="hidden" name="code_challenge_method" value="${escapeHtml(params.method)}"/>
      <input type="hidden" name="scope" value="${escapeHtml(params.scope)}"/>
      <input type="hidden" name="resource" value="${escapeHtml(params.resource)}"/>
      <label for="pw">كلمة مرور التفويض — سرّ المنصة الحصري</label>
      <input id="pw" name="password" type="password" class="authinput" autocomplete="off" required placeholder="••••••••••••••"/>
      ${totpBlock}
      <button id="authbtn" type="submit">تفويض الاتصال الآمن</button>
    </form>
    <a class="cancel" href="${escapeHtml(cancelUrl)}">إلغاء ورفض الاتصال</a>
    <p class="foot">النطاق الممنوح: <b>${escapeHtml(params.scope)}</b> — التفويض محصّن بكلمة المرور والتحقق الثنائي ودرع تخمين دائم، وعند نجاحه يصل إشعار فوري وبريد أمني للمالك</p>
  </div>
  <script>
    document.getElementById("authform").addEventListener("submit", function () {
      var b = document.getElementById("authbtn");
      if (!b || b.disabled) return;
      b.disabled = true;
      b.innerHTML = '<span class="spin"></span>جارٍ التحقق والتحويل...';
    });
  </script>
</body>
</html>`;
  return new Response(html, {
    status: errorMessage ? 401 : 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** بريد أمني فوري للمالك لحظة إصدار رمز تفويض — طبقة تزيين لا تعطل المسار أبدًا */
async function sendSecurityEmail(clientName: string, ip: string): Promise<void> {
  try {
    const { key, from } = await resolveEmailConfig();
    if (!key) return;
    const when = new Date().toLocaleString("ar-EG", {
      timeZone: "Africa/Cairo",
      dateStyle: "long",
      timeStyle: "short",
    });
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [OWNER_EMAIL],
        subject: "تفويض MCP جديد — اتصال سيادي مُنح للتو",
        html: `<div style="font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;padding:24px;color:#1f2937">
          <h2 style="color:#a16a1f;margin:0 0 12px">تم تفويض اتصال جديد بالبوابة السيادية</h2>
          <p style="line-height:2;font-size:14px">الجهة المفوَّضة: <b>${escapeHtml(clientName)}</b><br/>
          عنوان IP: <b dir="ltr">${escapeHtml(ip)}</b><br/>
          الوقت (توقيت القاهرة): <b>${when}</b></p>
          <p style="line-height:2;font-size:13px;color:#6b7280">إن لم تكن أنت من منح هذا التفويض، نفّذ فورًا في التيرمينال السيادي الأمر
          <b dir="ltr">mcp revoke-tokens</b> لإنهاء كل الرموز المفتوحة، وراجع مركز الأمن.</p>
        </div>`,
      }),
    });
  } catch {
    /* صامت — البريد طبقة تزيين */
  }
}

/* ============================ GET — رسم صفحة التفويض ============================ */

export async function GET(request: Request) {
  const origin = getOrigin(request);
  const url = new URL(request.url);

  if (!(process.env.MCP_OAUTH_PASSWORD || process.env.GEMINI_SPARK_MCP_SECRET)) {
    return errorHtml(
      "الخادم غير مهيأ",
      "لم تُضبط كلمة مرور التفويض على الخادم بعد — أضف MCP_OAUTH_PASSWORD إلى متغيرات البيئة",
    );
  }

  const params = extractParams(url.searchParams);
  const verdict = validate(params);
  if (!verdict.ok) {
    return errorHtml("طلب تفويض مرفوض", verdict.errorDesc);
  }
  const hasTotp = Boolean(await totpAdmin());
  return consentHtml(origin, params, verdict.client.name, "", hasTotp);
}

/* ============================ POST — التحقق وإصدار رمز التفويض ============================ */

export async function POST(request: Request) {
  const origin = getOrigin(request);
  const form = await request.formData().catch(() => null);
  if (!form) {
    return errorHtml("طلب غير صالح", "تعذر قراءة نموذج التفويض");
  }

  const get = (k: string) => String(form.get(k) ?? "");
  const params: AuthorizeParams = {
    clientId: get("client_id"),
    redirectUri: get("redirect_uri"),
    state: get("state"),
    challenge: get("code_challenge"),
    method: get("code_challenge_method") || "S256",
    scope: get("scope") || OAUTH_SCOPE,
    resource: get("resource"),
  };
  const ip = getClientIp(request);

  const verdict = validate(params);
  if (!verdict.ok) {
    return errorHtml("طلب تفويض مرفوض", verdict.errorDesc);
  }

  /* الإلغاء — يُعاد العميل بخطأ access_denied وفق المعيار (مسار بريء لا يخضع للدروع) */
  if (get("action") === "cancel") {
    const cancelUrl = new URL(params.redirectUri);
    cancelUrl.searchParams.set("error", "access_denied");
    if (params.state) cancelUrl.searchParams.set("state", params.state);
    return Response.redirect(cancelUrl.toString(), 302);
  }

  const shieldPage = (title: string, detail: string) => errorHtml(title, detail);

  /* الدرع 0 — درع الاندفاع السريع: رفض فوري بلا أي استعلام قاعدة بيانات */
  if (!rateLimit(`mcp-oauth:${ip}`, BURST_PER_MIN, 60_000).ok) {
    await raiseAlert({
      type: "OAUTH_BURST",
      severity: "WARN",
      message: `اندفاع محاولات تفويض MCP من ${ip} — أكثر من ${BURST_PER_MIN} محاولات/دقيقة`,
      meta: { ip, client: verdict.client.name },
    });
    return shieldPage("محاولات كثيرة", "تجاوزت حد محاولات التفويض المسموح — انتظر دقيقة ثم أعد المحاولة");
  }

  /* الدرع 1 — جدار IP الصارم نفسه الذي يحمي دخول اللوحة */
  const ipDecision = await decideIpAccess(ip);
  if (!ipDecision.access) {
    await raiseAlert({
      type: "IP_BLOCKED",
      severity: "CRITICAL",
      message: `محاولة تفويض MCP من IP محظور: ${ip} (${ipDecision.reason})`,
      meta: { ip, client: verdict.client.name },
    });
    return shieldPage("وصول مرفوض", "هذا العنوان محظور بجدار قواعد IP — لا يمكن التفويض منه");
  }

  /* الدرع 2 — عداد التخمين الدائم في قاعدة البيانات (لا يُصفَّر مع Cold Start):
     نفس عتبات درع الدخول — 5 فشل/15 دقيقة أو 12 فشل/ساعة لكل IP أو للفاعل كله */
  const since15 = new Date(Date.now() - 15 * 60_000);
  const since1h = new Date(Date.now() - 60 * 60_000);
  const [fails15, fails1h] = await Promise.all([
    prisma.loginAttempt.count({
      where: { success: false, createdAt: { gte: since15 }, OR: [{ username: OAUTH_ACTOR }, { ip }] },
    }),
    prisma.loginAttempt.count({
      where: { success: false, createdAt: { gte: since1h }, OR: [{ username: OAUTH_ACTOR }, { ip }] },
    }),
  ]);
  if (fails15 >= MAX_FAILS_15MIN || fails1h >= MAX_FAILS_HOUR) {
    await recordFail(ip, "RATE_LIMITED");
    await raiseAlert({
      type: "BRUTE_FORCE",
      severity: "CRITICAL",
      message: `حظر مؤقت لمحاولات تفويض MCP: ${fails15} فشل خلال 15 دقيقة من ${ip}`,
      meta: { ip, client: verdict.client.name, fails15, fails1h },
    });
    return shieldPage("محاولات كثيرة", "تم حظر محاولات التفويض مؤقتًا لأسباب أمنية — أعد المحاولة بعد 15 دقيقة");
  }

  /* الطبقة 1 — كلمة مرور التفويض */
  if (!oauthPasswordOk(get("password"))) {
    await recordFail(ip, "OAUTH_WRONG_PASSWORD");
    if (fails15 >= MAX_FAILS_15MIN - 2) {
      await raiseAlert({
        type: "OAUTH_FAILED",
        severity: "WARN",
        message: `محاولات تفويض MCP فاشلة متكررة من ${ip} (كلمة مرور خاطئة)`,
        meta: { ip, client: verdict.client.name },
      });
    }
    const hasTotp = Boolean(await totpAdmin());
    return consentHtml(origin, params, verdict.client.name, "كلمة المرور غير صحيحة — أعد المحاولة", hasTotp);
  }

  /* الطبقة 2 — التحقق الثنائي TOTP من سرّ الأدمن المفعّل (إن كان مفعّلًا) */
  const admin = await totpAdmin();
  if (admin) {
    const totpOk = (() => {
      try {
        return verifyTotpToken(decryptSecret(admin.secretEnc), get("totp"));
      } catch {
        return false;
      }
    })();
    if (!totpOk) {
      await recordFail(ip, "OAUTH_WRONG_TOTP");
      await raiseAlert({
        type: "TOTP_FAILED",
        severity: "WARN",
        message: `رمز تحقق ثنائي خاطئ في تفويض MCP من ${ip}`,
        meta: { ip, client: verdict.client.name },
      });
      return consentHtml(
        origin,
        params,
        verdict.client.name,
        "رمز التحقق الثنائي غير صحيح — انظر تطبيق المصادقة وأعد المحاولة",
        true,
      );
    }
  }

  /* النجاح — توثيق كامل ثم إشعارات فورية ورمز يحمل رقم الإلغاء tv */
  await prisma.loginAttempt
    .create({ data: { username: OAUTH_ACTOR, ip, success: true, reason: "OAUTH_OK" } })
    .catch(() => {});

  const tv = await getMcpTokenVersion();
  const code = await signOAuthToken(
    {
      iss: origin,
      client_id: params.clientId,
      redirect_uri: params.redirectUri,
      challenge: params.challenge,
      method: params.method,
      scope: params.scope,
      tv,
      ...(params.resource ? { resource: params.resource } : {}),
    },
    "code",
    AUTH_CODE_TTL_SEC,
  );

  await writeAudit({
    adminId: admin?.id ?? null,
    action: "mcp.oauth.authorized",
    meta: { client: verdict.client.name, redirectUri: params.redirectUri, ip, tv },
    ip,
  });

  void pushAdmins({
    title: "🔓 اتصال سيادي جديد مفوَّض الآن",
    body: `${verdict.client.name} من ${ip} — ${new Date().toLocaleString("ar-EG", {
      timeZone: "Africa/Cairo",
      dateStyle: "short",
      timeStyle: "short",
    })} — إن لم تكن أنت، نفّذ mcp revoke-tokens فورًا`,
    url: "/security",
    tag: "oauth-authorized",
  });
  void sendSecurityEmail(verdict.client.name, ip);

  const target = new URL(params.redirectUri);
  target.searchParams.set("code", code);
  if (params.state) target.searchParams.set("state", params.state);
  target.searchParams.set("iss", origin);

  return Response.redirect(target.toString(), 302);
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
