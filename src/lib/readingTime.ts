/** نسخة خادم من محرك وقت القراءة (مطابقة لنسخة المنصة) */
const DIACRITICS = /[\u064B-\u0652\u0670\u0640]/g;

export function readingSeconds(text: string, wpm = 190): number {
  if (!text) return 60;
  const words = text
    .replace(DIACRITICS, "")
    .split(/\s+/)
    .filter(Boolean).length;
  const base = (words / wpm) * 60;
  const quotes = (text.match(/^\s*>/gm) || []).length;
  const headings = (text.match(/^\s*##/gm) || []).length;
  return Math.max(30, Math.round(base + quotes * 5 + headings * 2));
}
