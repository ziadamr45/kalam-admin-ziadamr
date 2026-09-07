import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

/**
 * Middleware لوحة التحكم — الخط الدفاعي الأول على الحافة (Edge)
 * 1. تحقق توقيع JWT لكل الصفحات الإدارية (بدون DB)
 * 2. فحص CSRF (Origin) لكل طلبات API المتغيرة
 * 3. ترويسات أمان صارمة
 */

const SECRET = process.env.ADMIN_SESSION_SECRET || "dev-only-insecure-secret";
const key = new TextEncoder().encode(SECRET);

const SESSION_COOKIE = "kalam_admin_session";
const SETUP_COOKIE = "kalam_admin_setup";

/** المسارات العامة الوحيدة */
const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/logout", "/api/health", "/api/cron"];

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

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
