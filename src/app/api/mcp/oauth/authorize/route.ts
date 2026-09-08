import {
  getOrigin,
  oauthRateLimited,
  oauthPasswordOk,
  OAUTH_SCOPE,
  signOAuthToken,
  AUTH_CODE_TTL_SEC,
  validRedirectUri,
  verifyClientId,
} from "@/lib/mcp/oauth";

/**
 * ============================================================
 * نقطة التفويض (RFC 6749 §3.1) — واجهة عربية بصرية لصاحب المنصة
 * ============================================================
 * يفتح Gemini هذه الصفحة في نافذة عند ربط الخادم أول مرة:
 *   1. تتحقق من client_id الموقّع و redirect_uri المسجلة
 *   2. تطلب كلمة مرور التفويض (سرّ حصري لصاحب المنصة)
 *   3. عند النجاح: ترجع رمز تفويض قصير العمر (10 دقائق) إلى redirect_uri
 *      مع state و iss — ثم يبادله Gemini (مع PKCE) برمز وصول عند /token
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

function errorHtml(title: string, detail: string): Response {
  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(title)} — كلام له لازمة</title>
<style>
  :root { color-scheme: dark; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { min-height:100vh; display:flex; align-items:center; justify-content:center; background:#09090b; font-family:system-ui,"Segoe UI",Tahoma,sans-serif; color:#fafafa; padding:24px; }
  .card { width:100%; max-width:420px; background:#18181b; border:1px solid #27272a; border-radius:20px; padding:32px 28px; text-align:center; }
  .logo { width:56px; height:56px; border-radius:16px; background:linear-gradient(135deg,#b9832f,#f5c46a); display:flex; align-items:center; justify-content:center; font-size:26px; font-weight:800; color:#18181b; margin:0 auto 18px; }
  h1 { font-size:18px; margin-bottom:10px; }
  p { font-size:13px; color:#a1a1aa; line-height:1.9; }
  .code { margin-top:14px; display:inline-block; background:#450a0a; border:1px solid #b91c1c; color:#fecaca; font-size:12px; border-radius:10px; padding:8px 14px; }
</style>
</head>
<body>
  <div class="card">
    <div class="logo">ك</div>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(detail)}</p>
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
): Response {
  const actionUrl = `${origin}/api/mcp/oauth/authorize`;
  const cancelUrl = `${params.redirectUri}?error=access_denied${
    params.state ? `&state=${encodeURIComponent(params.state)}` : ""
  }`;
  const errBlock = errorMessage
    ? `<div class="err">${escapeHtml(errorMessage)}</div>`
    : "";
  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>تفويض الاتصال — كلام له لازمة</title>
<style>
  :root { color-scheme: dark; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { min-height:100vh; display:flex; align-items:center; justify-content:center; background:#09090b; font-family:system-ui,"Segoe UI",Tahoma,sans-serif; color:#fafafa; padding:24px; }
  .card { width:100%; max-width:430px; background:#18181b; border:1px solid #27272a; border-radius:20px; padding:32px 28px; }
  .logo { width:56px; height:56px; border-radius:16px; background:linear-gradient(135deg,#b9832f,#f5c46a); display:flex; align-items:center; justify-content:center; font-size:26px; font-weight:800; color:#18181b; margin:0 auto 18px; }
  h1 { font-size:18px; text-align:center; margin-bottom:8px; line-height:1.7; }
  .sub { font-size:12.5px; color:#a1a1aa; text-align:center; line-height:1.9; margin-bottom:18px; }
  .client { font-weight:800; color:#f5c46a; }
  ul { list-style:none; margin:0 0 20px; display:grid; gap:8px; }
  li { background:#09090b; border:1px solid #27272a; border-radius:12px; padding:9px 13px; font-size:12px; color:#d4d4d8; line-height:1.8; }
  li b { color:#f5c46a; }
  label { display:block; font-size:12px; color:#a1a1aa; margin-bottom:7px; font-weight:700; }
  input[type=password] { width:100%; background:#09090b; border:1px solid #3f3f46; border-radius:12px; padding:12px 14px; font-size:14px; color:#fafafa; outline:none; }
  input[type=password]:focus { border-color:#b9832f; }
  .err { background:#450a0a; border:1px solid #b91c1c; color:#fecaca; font-size:12px; border-radius:10px; padding:9px 12px; margin-bottom:14px; text-align:center; }
  button { width:100%; margin-top:14px; background:linear-gradient(135deg,#b9832f,#d9a343); border:0; border-radius:12px; padding:13px; font-size:14.5px; font-weight:800; color:#18181b; cursor:pointer; }
  button:hover { filter:brightness(1.1); }
  a.cancel { display:block; text-align:center; margin-top:12px; color:#71717a; font-size:12.5px; text-decoration:none; }
  a.cancel:hover { color:#a1a1aa; }
  .foot { margin-top:20px; padding-top:14px; border-top:1px solid #27272a; font-size:11px; color:#52525b; text-align:center; line-height:1.9; }
</style>
</head>
<body>
  <div class="card">
    <div class="logo">ك</div>
    <h1>ربط مساعد Gemini بمنصة «كلام له لازمة»</h1>
    <p class="sub">التطبيق <span class="client">${escapeHtml(clientName)}</span> يطلب اتصالًا سياديًا بخادم الإدارة عبر بروتوكول OAuth 2.0 — لا تمنح التفويض إلا إذا أنت من طلب الربط</p>
    <ul>
      <li><b>إدارة المقالات:</b> إنشاء وتعديل ونشر وأرشفة بكل الحقول</li>
      <li><b>الأقسام والوسائط:</b> إنشاء الأقسام، إطلاق التوليد الصوتي، تحديث الأغلفة</li>
      <li><b>الرقابة والتحليلات:</b> قراءة الإحصاءات ومراقبة التعليقات واتخاذ قراراتها</li>
      <li><b>البنية التحتية:</b> إعادة توليد كاش الموقع العام فورًا</li>
    </ul>
    ${errBlock}
    <form method="post" action="${escapeHtml(actionUrl)}">
      <input type="hidden" name="client_id" value="${escapeHtml(params.clientId)}"/>
      <input type="hidden" name="redirect_uri" value="${escapeHtml(params.redirectUri)}"/>
      <input type="hidden" name="state" value="${escapeHtml(params.state)}"/>
      <input type="hidden" name="code_challenge" value="${escapeHtml(params.challenge)}"/>
      <input type="hidden" name="code_challenge_method" value="${escapeHtml(params.method)}"/>
      <input type="hidden" name="scope" value="${escapeHtml(params.scope)}"/>
      <input type="hidden" name="resource" value="${escapeHtml(params.resource)}"/>
      <label for="pw">كلمة مرور التفويض — سرّ المنصة الحصري</label>
      <input id="pw" name="password" type="password" autocomplete="off" required placeholder="••••••••••••••"/>
      <button type="submit">تفويض الاتصال الآمن</button>
    </form>
    <a class="cancel" href="${escapeHtml(cancelUrl)}">إلغاء ورفض الاتصال</a>
    <p class="foot">كل عملية تُنفَّذ عبر هذا الاتصال تُوثَّق في سجل التدقيق — النطاق الممنوح: ${escapeHtml(params.scope)}</p>
  </div>
</body>
</html>`;
  return new Response(html, {
    status: errorMessage ? 401 : 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
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
  return consentHtml(origin, params, verdict.client.name, "");
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

  const verdict = validate(params);
  if (!verdict.ok) {
    return errorHtml("طلب تفويض مرفوض", verdict.errorDesc);
  }

  /* الإلغاء — يُعاد العميل بخطأ access_denied وفق المعيار */
  if (get("action") === "cancel") {
    const cancelUrl = new URL(params.redirectUri);
    cancelUrl.searchParams.set("error", "access_denied");
    if (params.state) cancelUrl.searchParams.set("state", params.state);
    return Response.redirect(cancelUrl.toString(), 302);
  }

  /* خنق محاولات كلمة المرور — حماية من التخمين */
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  if (oauthRateLimited(ip)) {
    return errorHtml("محاولات كثيرة", "تجاوزت حد محاولات التفويض المسموح — انتظر خمس دقائق ثم أعد المحاولة");
  }

  if (!oauthPasswordOk(get("password"))) {
    return consentHtml(origin, params, verdict.client.name, "كلمة المرور غير صحيحة — أعد المحاولة");
  }

  /* رمز تفويض قصير العمر يحمل التحدي و redirect_uri و client_id داخله */
  const code = await signOAuthToken(
    {
      iss: origin,
      client_id: params.clientId,
      redirect_uri: params.redirectUri,
      challenge: params.challenge,
      method: params.method,
      scope: params.scope,
      ...(params.resource ? { resource: params.resource } : {}),
    },
    "code",
    AUTH_CODE_TTL_SEC,
  );

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
