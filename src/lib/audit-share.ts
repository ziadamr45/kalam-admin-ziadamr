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

export function signAuditShare(range: string, exp: number, extra = ""): string {
  /* النطاق المخصص يوقع مع معاملاته (from/to) — بلا extra تبقى صيغة الروابط القديمة كما هي */
  const payload = extra ? `${range}:${extra}:${exp}` : `${range}:${exp}`;
  return crypto.createHmac("sha256", KEY).update(payload).digest("hex");
}

export function verifyAuditShare(range: string, exp: number, sig: string | null, extra = ""): boolean {
  if (!KEY || !sig || !Number.isFinite(exp)) return false;
  if (Date.now() / 1000 > exp) return false;
  const expected = signAuditShare(range, exp, extra);
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** رابط تنزيل دائم موقّع للتقرير — الصلاحية 30 يومًا؛ النطاق المخصص يوقع from/to */
export function buildAuditShareUrl(
  range: "weekly" | "monthly" | "custom",
  validityDays = 30,
  extra?: string,
): string {
  const exp = Math.floor(Date.now() / 1000) + validityDays * 86400;
  const sig = signAuditShare(range, exp, extra ?? "");
  const base =
    process.env.NEXT_PUBLIC_ADMIN_URL ?? "https://kalam-admin-ziadamr.vercel.app";
  const q = extra ? `&${extra}` : "";
  return `${base}/api/audit/pdf/shared?range=${range}&exp=${exp}&sig=${sig}${q}`;
}
