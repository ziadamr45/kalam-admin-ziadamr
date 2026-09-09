import "server-only";
import crypto from "node:crypto";

/**
 * التشفير المتماثل AES-256-GCM — يُستخدم لتشفير أسرار TOTP ساكنًا
 * المفتاح مشتق من ADMIN_SESSION_SECRET عبر scrypt
 */

const SECRET = process.env.ADMIN_SESSION_SECRET || "dev-only-insecure-secret";

function deriveKey(): Buffer {
  return crypto.scryptSync(SECRET, "kalam-admin-totp-v1", 32);
}

/** يشفّر نصًا ويعيد صيغة iv:tag:cipher بترميز base64 */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

/** يفك تشفير صيغة iv:tag:cipher */
export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("صيغة مشفرة غير صالحة");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    deriveKey(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

/** بصمة جهاز موقعة بـ HMAC — لا يمكن تزييفها دون معرفة السر */
export function hashDeviceFingerprint(fingerprint: string): string {
  return crypto.createHmac("sha256", SECRET).update(fingerprint).digest("hex");
}

/** hash لرمز الجلسة المخزن في قاعدة البيانات */
export function hashToken(jti: string): string {
  return crypto.createHash("sha256").update(`${jti}:${SECRET}`).digest("hex");
}
