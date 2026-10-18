import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

/**
 * Middleware لوحة التحكم — الخط الدفاعي الأول على الحافة (Edge)
 * 1. تحقق توقيع JWT لكل الصفحات الإدارية (بدون DB)
 * 2. فحص CSRF (Origin) لكل طلبات API المتغيرة
 * 3. ترويسات أمان صارمة + CSP مضبوطة المصادر
 * 4. منع الكاش نهائيًا (no-store) — لا أثر للوحة في سجل/كاش المتصفح
 */

const SECRET = process.env.ADMIN_SESSION_SECRET || "dev-only-insecure-secret";
const key = new TextEncoder().encode(SECRET);

const SESSION_COOKIE = "kalam_admin_session";
const SETUP_COOKIE = "kalam_admin_setup";

/** المسارات العامة الوحيدة */
const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/health",
  "/api/cron",
  /* بوابة MCP + طبقة OAuth القياسية (ليجرب Gemini الاكتشاف والتسجيل والتفويض) */
  "/api/mcp",
  "/.well-known",
  /* البوابات الداخلية بين طبقات النظام (traffic/alerts/worker) —
     لا جلسة لها بطبيعتها، وحمايتها السر الداخلي x-traffic-secret
     وx-worker-secret على مستوى المسار نفسه (403 عند أي خلل) */
  "/api/internal",
  "/api/audio/worker",
  /* تنزيل التقرير الرقابي عبر رابط موقّع HMAC بصلاحية مؤقتة — بلا جلسة */
  "/api/audit/pdf/shared",
];

/**
 * سياسة أمان المحتوى الصارمة للوحة:
 * - كل المصادر محصورة بالأصل — لا سكربت ولا إطار خارجي إطلاقًا
 * - object-src 'none' + base-uri/form-action 'self' — سد حقن XSS
 * - frame-ancestors 'none' — اللوحة لا تُضمَّن في أي iframe خارجي
 * (الصور https: لأغلفة المقالات من مصادر التحرير، وblob: لمعاينات الرفع)
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' https: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

async function verifySessionToken(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, key);
    return payload.scope === "session";
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;

  /* حماية CSRF على مستوى الحافة لكل مسارات API المتغيرة */
  if (pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(method)) {
    const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
    const isCron = pathname.startsWith("/api/cron/");
    if (!isPublic || isCron) {
      // cron يُصادق بسر خاص وليس Origin
      if (!isCron) {
        const origin = request.headers.get("origin");
        if (origin) {
          try {
            const originHost = new URL(origin).host;
            const host = request.headers.get("host");
            if (!host || originHost !== host) {
              return NextResponse.json({ error: "طلب مرفوض (CSRF)" }, { status: 403 });
            }
          } catch {
            return NextResponse.json({ error: "طلب مرفوض (CSRF)" }, { status: 403 });
          }
        }
      }
    }
  }

  const isPublicPath = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
  const isSetupPage = pathname === "/setup/2fa" || pathname.startsWith("/api/auth/setup");

  /* صفحة التفعيل الأولي لـ 2FA: تتطلب كوكي setup صالح */
  if (isSetupPage) {
    const setupToken = request.cookies.get(SETUP_COOKIE)?.value;
    let ok = false;
    if (setupToken) {
      try {
        const { payload } = await jwtVerify(setupToken, key);
        ok = payload.scope === "setup";
      } catch {}
    }
    if (!ok) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  /* الصفحات الإدارية: تتطلب جلسة كاملة */
  if (!isPublicPath && !isSetupPage) {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    const valid = token ? await verifySessionToken(token) : false;

    if (!valid) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "جلسة غير صالحة" }, { status: 401 });
      }
      const loginUrl = new URL("/login", request.url);
      if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  const response = NextResponse.next();

  /* ترويسات أمان صارمة */
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");

  /**
   * CSP: صارمة على كل المسارات ما عدا صفحات تفويض MCP OAuth —
   * تلك يحتاج Gemini عرضها داخل إطار الربط (next.config يضبط لهم
   * frame-ancestors * وحدهم؛ لو ضفنا CSP ثانية هنا لتماس الاستثناء
   * لأن المتصفح يطبق تقاطع كل ترويسات CSP).
   */
  const isOauthConsent = pathname.startsWith("/api/mcp/oauth");
  if (!isOauthConsent) {
    response.headers.set("Content-Security-Policy", CSP);
  }

  /* لا كاش نهائي — لا صفحة ولا استجابة إدارية تُحفظ في سجل المتصفح */
  response.headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
