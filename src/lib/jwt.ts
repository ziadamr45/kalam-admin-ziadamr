import "server-only";
import { SignJWT, jwtVerify } from "jose";

/**
 * JWT مُوقَّع HS256 — جلسات لوحة التحكم
 * ثلاث نطاقات (scopes):
 *  - session : جلسة كاملة الصلاحية (8 ساعات أو 30 يومًا للأجهزة الموثوقة)
 *  - preauth : ما بعد كلمة المرور وقبل الرمز المتغير (5 دقائق)
 *  - setup   : تفعيل 2FA لأول مرة (10 دقائق)
 */

/**
 * مفتاح الجلسات — Fail-Closed:
 * في الإنتاج لا سرّ افتراضي أبدًا؛ غياب ADMIN_SESSION_SECRET يعني
 * رفض التوقيع والتحقق نهائيًا (رمي خطأ في التوقيع، وفشل التحقق لكل
 * الكوكيز) بدل التوقيع بسرّ معلوم يفتح اللوحة للجميع. قيمة التطوير
 * الافتراضية تعمل في التطوير فقط ولا تصل الإنتاج أبدًا.
 */
let cachedKey: Uint8Array | null = null;

export function sessionSecretKey(): Uint8Array {
  if (cachedKey) return cachedKey;
  const secret = process.env.ADMIN_SESSION_SECRET?.trim();
  if (secret) {
    cachedKey = new TextEncoder().encode(secret);
    return cachedKey;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "ADMIN_SESSION_SECRET غير مضبوط في الإنتاج — رفض توقيع والتحقق من جلسات الإدارة (Fail-Closed)",
    );
  }
  /* تطوير فقط */
  return new TextEncoder().encode("dev-only-insecure-secret");
}

export const SESSION_COOKIE = "kalam_admin_session";
export const PREAUTH_COOKIE = "kalam_admin_preauth";
export const SETUP_COOKIE = "kalam_admin_setup";

export type Scope = "session" | "preauth" | "setup";

export type SessionPayload = {
  sub: string; // AdminUser.id
  username: string;
  scope: Scope;
  jti: string;
};

export async function signScopedToken(
  payload: { sub: string; username: string },
  scope: Scope,
  ttlSeconds: number,
): Promise<{ token: string; jti: string }> {
  const jti = crypto.randomUUID();
  const token = await new SignJWT({ username: payload.username, scope })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(sessionSecretKey());
  return { token, jti };
}

export async function verifyScopedToken(
  token: string,
  expectedScope: Scope,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, sessionSecretKey());
    if (payload.scope !== expectedScope) return null;
    return {
      sub: String(payload.sub),
      username: String(payload.username ?? ""),
      scope: payload.scope as Scope,
      jti: String(payload.jti ?? ""),
    };
  } catch {
    return null;
  }
}
