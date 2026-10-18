/**
 * قاعدة ضبط التنوين الصارمة:
 * يُوضع التنوين دائمًا على الحرف الذي يسبق ألف التنوين — لا على الألف نفسها.
 *   ✅ عالمًا  شكرًا  مرحبًا
 *   ❌ عالماً  شكراً  مرحباً
 *
 * المُصحِّح ينقل علامة التنوين (فتح ً / ضم ٌ / كسر ٍ) من فوق الألف
 * إلى الحرف السابق لها في كل موضع — أمانًا كاملًا للغة في كل كلمة تُنشر.
 */

const TANWEEN_CLASS = "\u064B\u064C\u064D"; // ً ٌ ٍ
const ALEF = "\u0627"; // ا

/** نمط «ألف + تنوين» الخاطئ في كل صوره */
const WRONG_NUNATION = new RegExp(`(${ALEF})([${TANWEEN_CLASS}])`, "g");

/** يصحح مواضع التنوين في أي نص عربي */
export function fixNunation(text: string): string {
  if (!text) return text;
  return text.replace(WRONG_NUNATION, (_m, alef: string, tanween: string) => tanween + alef);
}

/** كم موضعًا خاطئًا في النص؟ (لتقرير التصحيح في المحرر) */
export function countNunationIssues(text: string): number {
  if (!text) return 0;
  const matches = text.match(new RegExp(`${ALEF}[${TANWEEN_CLASS}]`, "g"));
  return matches ? matches.length : 0;
}
