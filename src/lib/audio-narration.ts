/**
 * بناء نص الإلقاء الصوتي — يوحد طريقة استخراج الكلمات بين لوحة الأدمن
 * والمشغل الكاريوكي في المنصة العامة حتى تتطابق الطوابع الزمنية مع
 * العرض حرفيًا (نفس المحلل + نفس مُجزّئ الكلمات).
 *
 * القاعدة الذهبية: كلمات الإلقاء = كلمات العرض بترتيبها نفسه.
 */

import {
  parseBlocks,
  blockPlainWords,
  blockSpokenLine,
  type Block,
} from "@/lib/content-blocks";

export type WordTiming = { w: string; s: number; e: number };

/** كلمات كتلة واحدة بنفس مُجزّئ العرض (عبر blockPlainWords الموحّد) */
export function blockWords(block: Block): string[] {
  return blockPlainWords(block);
}

/** النص الذي سيتلقّاه محرك الصوت: النسخة المشكولة أولوية لضمان النطق السليم */
export function spokenSource(content: string, contentWithTashkeel: string | null): string {
  const tashkeel = (contentWithTashkeel ?? "").trim();
  return tashkeel.length > 0 ? tashkeel : content;
}

/** فصل النص إلى جمل عربية/لاتينية مع الحفاظ على الترقيم */
function splitSentences(text: string): string[] {
  const parts = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!؟?…؛:»])\s+|(?<=\u061F)\s+/u)
    .map((s) => s.trim())
    .filter(Boolean);
  /* الجمل الطويلة جدًا بلا ترقيم تُكسر عند نصفها */
  const out: string[] = [];
  for (const s of parts) {
    if (s.length <= 400) {
      out.push(s);
      continue;
    }
    const words = s.split(" ");
    let acc = "";
    for (const w of words) {
      if ((acc + " " + w).trim().length > 300 && acc) {
        out.push(acc.trim());
        acc = w;
      } else {
        acc = (acc + " " + w).trim();
      }
    }
    if (acc.trim()) out.push(acc.trim());
  }
  return out;
}

export type SegmentPlan = {
  index: number;
  /** نص الإلقاء الجاهز للمحرك */
  text: string;
  /** الكلمات بترتيبها العام عبر المقال كله (لحساب الطوابع لاحقًا) */
  words: string[];
};

/**
 * تقسيم النص إلى مقاطع توليد (≤ ~600 حرف عند حدود الجمل).
 * حتمي 100%: نفس المدخل يعطي نفس التقسيم دائمًا —
 * وهو ما يسمح للعميل بطلب مقطع index معين بأمان وإعادة المحاولة.
 */
export function buildSegmentPlan(raw: string): SegmentPlan[] {
  const blocks = parseBlocks(raw);

  /* كتلة النص الصوتي: نصوص الكتل (بلا وسوم ولا فواصل بصرية) كسطور */
  const lines: string[] = [];
  for (const b of blocks) {
    const line = blockSpokenLine(b);
    if (line.trim()) lines.push(line);
  }
  const sentences = splitSentences(lines.join(" "));

  const plans: SegmentPlan[] = [];
  let buf = "";

  const flush = () => {
    const t = buf.trim();
    if (!t) return;
    plans.push({ index: plans.length, text: t, words: t.split(/\s+/).filter(Boolean) });
  };

  for (const s of sentences) {
    if (buf && (buf + " " + s).length > 600) {
      flush();
      buf = s;
    } else {
      buf = buf ? `${buf} ${s}` : s;
    }
  }
  flush();

  return plans;
}

/**
 * طوابع الكلمات داخل مقطع واحد — توزيع تناسبي بطول الكلمة
 * فوق المدة الحقيقية المقاسة من الصوت المولّد.
 */
export function allocateWordTimings(
  words: string[],
  startSec: number,
  durationSec: number,
): WordTiming[] {
  const n = words.length;
  if (n === 0 || durationSec <= 0) return [];
  const usable = Math.max(0.2, durationSec - 0.12); // هامش تنفّس بداية/نهاية
  const weights = words.map((w) => Math.max(1, w.replace(/[\u064B-\u065F\u0670]/g, "").length) + 1);
  const total = weights.reduce((a, b) => a + b, 0);
  const out: WordTiming[] = [];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const s = startSec + 0.06 + usable * (acc / total);
    acc += weights[i];
    const e = startSec + 0.06 + usable * (acc / total);
    out.push({
      w: words[i],
      s: Math.round(s * 100) / 100,
      e: Math.round(Math.max(e - 0.02, s + 0.08) * 100) / 100,
    });
  }
  return out;
}
