// =====================================================================
// محلل كتل المحتوى الموحّد — «كلام له لازمة»
// يدعم: الفقرات، العناوين، الاقتباسات، القوائم
// + كتل مخصصة: [[آية|السورة|رقم الآية]] و [[حديث|الراوي/التخريج]]
// يستخدمه: قارئ المنصة العامة + معاينة محرر لوحة التحكم
// =====================================================================

export type Block =
  | { kind: "p"; id: string; text: string }
  | { kind: "h2"; id: string; text: string }
  | { kind: "quote"; id: string; text: string }
  | { kind: "list"; id: string; items: string[] }
  | { kind: "quran"; id: string; text: string; sura: string; ayah: string }
  | { kind: "hadith"; id: string; text: string; narrator: string };

/** ترميز الكتل — يُستخدم في زر المحرر وللتوثيق */
export const QURAN_TEMPLATE = (sura: string, ayah: string, text: string) =>
  `[[آية|${sura}|${ayah}]]\n${text}\n[[/آية]]`;

export const HADITH_TEMPLATE = (narrator: string, text: string) =>
  `[[حديث|${narrator}]]\n${text}\n[[/حديث]]`;

/** تحويل الأرقام إلى أرقام عربية مشرقية */
export function toArabicDigits(input: string | number): string {
  const digits = "٠١٢٣٤٥٦٧٨٩";
  return String(input).replace(/\d/g, (d) => digits[Number(d)]);
}

/* أنماط رؤوس الكتل — عربي أساسي + لاتيني بديل للتسامح */
const QURAN_HEAD =
  /^\[\[(?:آية|QURAN)\s*\|\s*([^\]|]+?)\s*\|\s*([^\]|]+?)\s*\]\]/;
const HADITH_HEAD = /^\[\[(?:حديث|HADITH)\s*\|\s*([^\]|]+?)\s*\]\]/;
const BLOCK_CLOSE = /^\[\[\/(?:آية|حديث|QURAN|HADITH)\s*\]\]/;

/**
 * تحليل المحتوى الخام إلى كتل جاهزة للعرض.
 * الفواصل: سطر فارغ بين الفقرات. داخل كتل الآيات والأحاديث تُدمج
 * الأسطر المتتالية في نص واحد حتى سطر الإغلاق [[/آية]] أو [[/حديث]].
 */
export function parseBlocks(raw: string): Block[] {
  const blocks: Block[] = [];
  const chunks = raw.split(/\n\n+/);
  let idx = 0;

  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    const id = `blk-${idx++}`;

    /* ===== كتلة آية قرآنية ===== */
    const quranMatch = trimmed.match(QURAN_HEAD);
    if (quranMatch) {
      const lines = trimmed.split("\n");
      const bodyLines: string[] = [];
      for (let i = 1; i < lines.length; i++) {
        if (BLOCK_CLOSE.test(lines[i].trim())) break;
        bodyLines.push(lines[i].trim());
      }
      const text = bodyLines.join(" ").trim();
      if (text) {
        blocks.push({
          kind: "quran",
          id,
          text,
          sura: quranMatch[1].trim(),
          ayah: quranMatch[2].trim(),
        });
        continue;
      }
    }

    /* ===== كتلة حديث نبوي ===== */
    const hadithMatch = trimmed.match(HADITH_HEAD);
    if (hadithMatch) {
      const lines = trimmed.split("\n");
      const bodyLines: string[] = [];
      for (let i = 1; i < lines.length; i++) {
        if (BLOCK_CLOSE.test(lines[i].trim())) break;
        bodyLines.push(lines[i].trim());
      }
      const text = bodyLines.join(" ").trim();
      if (text) {
        blocks.push({
          kind: "hadith",
          id,
          text,
          narrator: hadithMatch[1].trim(),
        });
        continue;
      }
    }

    /* ===== الكتل النصية القياسية ===== */
    if (trimmed.startsWith("## ")) {
      blocks.push({ kind: "h2", id, text: trimmed.slice(3).trim() });
    } else if (trimmed.startsWith("> ")) {
      blocks.push({
        kind: "quote",
        id,
        text: trimmed.replace(/^>\s?/gm, "").trim(),
      });
    } else if (
      /^-\s/m.test(trimmed) &&
      trimmed.split("\n").every((l) => /^-\s/.test(l.trim()))
    ) {
      blocks.push({
        kind: "list",
        id,
        items: trimmed.split("\n").map((l) => l.replace(/^-\s*/, "").trim()),
      });
    } else {
      blocks.push({ kind: "p", id, text: trimmed.replace(/\n/g, " ") });
    }
  }

  return blocks;
}

/** عدد كلمات كتلة (للمشغل الصوتي ووقت القراءة) */
export function blockWordCount(block: Block): number {
  if (block.kind === "list") {
    return block.items.join(" ").split(/\s+/).filter(Boolean).length;
  }
  return block.text.split(/\s+/).filter(Boolean).length;
}
