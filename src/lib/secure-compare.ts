import { createHash, timingSafeEqual } from "crypto";

/**
 * مقارنة أسرار ثابتة الزمن — سد هجمات التوقيت (Timing Attacks):
 * المقارنة المباشرة (===) تتسرب بايتًا بايتًا مع زمن الرد؛ هنا يُهشَم
 * الطرفان بـSHA-256 فيتساوى الطول حتمًا وتُقارن البصمتان بثبات زمني
 * بغض النظر عن طول أو محتوى السر المقدم.
 */
export function secretMatches(
  provided: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (!provided || !expected) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
