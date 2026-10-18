/**
 * ============================================================
 * درع تحديد معدل الطلبات للوحة التحكم — Sliding-Window Limiter
 * ============================================================
 * خط سريع قبل قاعدة البيانات: يمتص الموجات العنيفة (Brute-force
 * الضوضائي) بلا أي استعلام، والحد الدائم الفعلي يبقى في LoginAttempt
 * (5/15د + 12/ساعة) — دفاع مزدوج بلا تكلفة زائدة.
 */

type Bucket = number[];

const buckets = new Map<string, Bucket>();

/** سقف الذاكرة الواقي من تسريبها — تُمسح عند التجاوز */
const MAX_BUCKETS = 10_000;

export type RateLimitResult = {
  ok: boolean;
  retryAfterSec: number;
  remaining: number;
};

/**
 * فحص السماح لطلب واحد ضمن نافذة زمنية.
 * @param key هوية فريدة (IP أو username أو مركبة)
 * @param limit أقصى عدد طلبات داخل النافذة
 * @param windowMs حجم النافذة بالمللي ثانية
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const fresh = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);

  if (fresh.length >= limit) {
    buckets.set(key, fresh);
    const oldest = fresh[0] ?? now;
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)),
      remaining: 0,
    };
  }

  fresh.push(now);
  buckets.set(key, fresh);
  if (buckets.size > MAX_BUCKETS) buckets.clear();
  return { ok: true, retryAfterSec: 0, remaining: limit - fresh.length };
}
