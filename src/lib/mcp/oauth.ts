import { SignJWT, jwtVerify } from "jose";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "crypto";

/**
 * ============================================================
 * طبقة OAuth 2.0 القياسية لخادم MCP — توافق Gemini Connected Apps
 * ============================================================
 * Gemini يرفض أي مصادقة غير OAuth القياسي، لذا يوفر هذا المكوّن
 * السلسلة الكاملة وفق المعايير الرسمية:
 *   - اكتشاف المورد المحمي  (RFC 9728) /.well-known/oauth-protected-resource
 *   - اكتشاف خادم التفويض   (RFC 8414) /.well-known/oauth-authorization-server
 *   - التسجيل الديناميكي     (RFC 7591) /api/mcp/oauth/register
 *   - تدفق رمز التفويض + PKCE (RFC 7636) authorize + token
 *   - مؤشرات المورد          (RFC 8707) resource/aud
 *
 * كل شيء عديم الحالة (Stateless) — صالح تمامًا لبيئة Vercel Serverless:
 *   - client_id موقّع ذاتيًا بـ HMAC يحمل بيانات تسجيله داخله (لا حاجة لقاعدة بيانات)
 *   - رمز التفويض ورمز الوصول ورمز التحديث كلها JWT موقعة HS256
 *
 * سرّ التوقيع: GEMINI_SPARK_MCP_SECRET (يُشارك مع الوضع القديم Bearer الساكن)
 * كلمة مرور صفحة التفويض: MCP_OAUTH_PASSWORD (أو سرّ MCP كبديل)
 */

export const OAUTH_SCOPE = "mcp:admin";
export const AUTH_CODE_TTL_SEC = 600; // رمز التفويض: 10 دقائق
export const ACCESS_TOKEN_TTL_SEC = 3600; // رمز الوصول: ساعة
export const REFRESH_TOKEN_TTL_SEC = 60 * 60 * 24 * 30; // رمز التحديث: 30 يومًا

const SECRET =
  process.env.GEMINI_SPARK_MCP_SECRET || "kalam-mcp-dev-fallback-secret";
const KEY = new TextEncoder().encode(SECRET);

/* ============================ ترويسات CORS ============================ */

export const OAUTH_CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

/* ============================ أدوات عامة ============================ */

/** أصل الخادم من ترويسات Vercel — يُبنى ديناميكيًا ليعمل على أي نطاق */
export function getOrigin(request: Request): string {
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    "localhost:3000";
  const proto =
    request.headers.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1")
      ? "http"
      : "https");
  return `${proto}://${host}`;
}

/** مقارنة زمنية ثابتة لنصين (هشّم ثم قارن لإخفاء اختلاف الطول) */
export function safeEqualStr(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

/** التحقق من كلمة مرور صفحة التفويض — تقبل كلمة MCP المخصصة أو سرّ MCP */
export function oauthPasswordOk(password: string): boolean {
  const candidates = [
    process.env.MCP_OAUTH_PASSWORD,
    process.env.GEMINI_SPARK_MCP_SECRET,
  ].filter((c): c is string => Boolean(c && c.length >= 8));
  if (!candidates.length) return false;
  return candidates.some((c) => safeEqualStr(c, password ?? ""));
}

/* ============================ بيانات وصفية للاكتشاف ============================ */

export function protectedResourceMetadata(origin: string) {
  return {
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    scopes_supported: [OAUTH_SCOPE],
    bearer_methods_supported: ["header"],
    resource_documentation: `${origin}/api/mcp`,
  };
}

export function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/api/mcp/oauth/authorize`,
    token_endpoint: `${origin}/api/mcp/oauth/token`,
    registration_endpoint: `${origin}/api/mcp/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256", "plain"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [OAUTH_SCOPE],
    service_documentation: `${origin}/api/mcp`,
  };
}

/* ============================ client_id موقّع ذاتيًا (RFC 7591) ============================ */

export type OAuthClient = {
  name: string;
  redirectUris: string[];
  iat: number;
};

function clientSignature(payloadB64: string): string {
  return createHmac("sha256", SECRET).update(payloadB64).digest("base64url");
}

/** يحفر بيانات العميل داخل client_id موقّع — يتحقق لاحقًا دون أي تخزين */
export function mintClientId(client: OAuthClient): string {
  const payloadB64 = Buffer.from(
    JSON.stringify({ n: client.name, u: client.redirectUris, iat: client.iat }),
    "utf8",
  ).toString("base64url");
  return `mcp.${payloadB64}.${clientSignature(payloadB64)}`;
}

export function verifyClientId(clientId: string): OAuthClient | null {
  if (typeof clientId !== "string") return null;
  const parts = clientId.split(".");
  if (parts.length !== 3 || parts[0] !== "mcp") return null;
  const [prefix, payloadB64, signature] = parts;
  if (prefix !== "mcp" || !payloadB64 || !signature) return null;
  if (!safeEqualStr(clientSignature(payloadB64), signature)) return null;
  try {
    const data = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    if (!Array.isArray(data.u) || !data.u.length) return null;
    if (!data.u.every((u: unknown) => typeof u === "string")) return null;
    return {
      name: typeof data.n === "string" && data.n ? data.n.slice(0, 80) : "تطبيق MCP خارجي",
      redirectUris: data.u as string[],
      iat: Number(data.iat) || 0,
    };
  } catch {
    return null;
  }
}

/** سياسة redirect_uri: https فقط (أو localhost للتطوير) */
export function validRedirectUri(uri: unknown): uri is string {
  if (typeof uri !== "string" || !uri) return false;
  try {
    const u = new URL(uri);
    if (u.protocol === "https:") return true;
    if (
      u.protocol === "http:" &&
      (u.hostname === "localhost" || u.hostname === "127.0.0.1")
    )
      return true;
    return false;
  } catch {
    return false;
  }
}

/* ============================ رموز JWT (التفويض/الوصول/التحديث) ============================ */

export type OAuthTokenTyp = "code" | "at" | "rt";

export async function signOAuthToken(
  claims: Record<string, unknown>,
  typ: OAuthTokenTyp,
  ttlSec: number,
): Promise<string> {
  return new SignJWT({ ...claims, typ })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${ttlSec}s`)
    .sign(KEY);
}

export async function verifyOAuthToken(
  token: string,
  typ: OAuthTokenTyp,
): Promise<Record<string, unknown> | null> {
  try {
    const { payload } = await jwtVerify(token, KEY);
    if (payload.typ !== typ) return null;
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

/* ============================ PKCE (RFC 7636) ============================ */

export function pkceS256(verifier: string): string {
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

export function pkceOk(
  verifier: string,
  challenge: string,
  method: string,
): boolean {
  if (!verifier || verifier.length < 43 || verifier.length > 128) return false;
  if (!challenge) return false;
  const computed =
    method === "plain" ? Buffer.from(verifier, "utf8").toString("base64url") : pkceS256(verifier);
  return safeEqualStr(computed, challenge);
}

/* ============================ أخطاء OAuth (RFC 6749 §5.2) ============================ */

export function oauthErrorResponse(
  error: string,
  description: string,
  status = 400,
): Response {
  return new Response(
    JSON.stringify({ error, error_description: description }),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        Pragma: "no-cache",
        ...OAUTH_CORS,
      },
    },
  );
}

/* ============================ خنق محاولات كلمة المرور ============================ */

const attempts = new Map<string, { n: number; ts: number }>();

export function oauthRateLimited(ip: string): boolean {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || now - rec.ts > 5 * 60_000) {
    attempts.set(ip, { n: 1, ts: now });
    return false;
  }
  rec.n += 1;
  return rec.n > 10;
}

/* ============================ تحليل جسم طلب Token ============================ */

/** يقبل application/x-www-form-urlencoded أو application/json */
export async function parseTokenRequestBody(
  request: Request,
): Promise<URLSearchParams> {
  const type = request.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) {
      const json = (await request.json()) as Record<string, unknown>;
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(json ?? {})) {
        if (typeof v === "string") params.set(k, v);
      }
      return params;
    }
    const text = await request.text();
    return new URLSearchParams(text);
  } catch {
    return new URLSearchParams();
  }
}
