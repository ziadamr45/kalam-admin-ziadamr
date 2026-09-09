import "server-only";
import crypto from "crypto";

/**
 * روابط مشاركة التقرير الرقابي — توقيع HMAC + انتهاء صلاحية
 * بديل سيادي عن الرفع السحابي: الرابط يولَّد لحظيًا من الخادم نفسه،
 * لا يُخزَّن الملف في أي مزود خارجي، وصلاحيته مؤقتة (30 يومًا).
 */

const KEY =
  process.env.ADMIN_SESSION_SECRET ??
  process.env.GEMINI_SPARK_MCP_SECRET ??
  "";

export function signAuditShare(range: string, exp: number): string {
  return crypto.createHmac("sha256", KEY).update(`${range}:${exp}`).digest("hex");
}

export function verifyAuditShare(range: string, exp: number, sig: string | null): boolean {
  if (!KEY || !sig || !Number.isFinite(exp)) return false;
  if (Date.now() / 1000 > exp) return false;
  const expected = signAuditShare(range, exp);
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** رابط تنزيل دائم موقّع للتقرير — الصلاحية 30 يومًا */
export function buildAuditShareUrl(range: "weekly" | "monthly", validityDays = 30): string {
  const exp = Math.floor(Date.now() / 1000) + validityDays * 86400;
  const sig = signAuditShare(range, exp);
  const base =
    process.env.NEXT_PUBLIC_ADMIN_URL ?? "https://kalam-admin-ziadamr.vercel.app";
  return `${base}/api/audit/pdf/shared?range=${range}&exp=${exp}&sig=${sig}`;
}
