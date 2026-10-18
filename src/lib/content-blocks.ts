// =====================================================================
// محلل كتل المحتوى الموحّد + محرك التنسيق الموسع — «كلام له لازمة»
// =====================================================================
// الطبقة الأولى (الإرث المستقر): الفقرات، العناوين، الاقتباسات، القوائم
//   + كتل مخصصة: [[آية|السورة|رقم الآية]] و [[حديث|الراوي/التخريج]]
// الطبقة الثانية (المحرك الموسع):
//   • وسوم توجيهية: :::quran :::hadith :::note :::question (بسمات اختيارية)
//   • تنسيقات قياسية: ### عناوين فرعية، قوائم مرتبة، فواصل أفقية،
//     جداول مقارنة GFM، وتنسيق مضمن: **تغميق** *ميلان* ~~شطب~~ `مصطلح`
// يستخدمه: قارئ المنصة العامة + الصفحات القانونية + معاينة محرر لوحة التحكم
// القاعدة الذهبية: كلمات العرض = كلمات الإلقاء الصوتي بترتيبها نفسها
// =====================================================================

export type Block =
  | { kind: "p"; id: string; text: string }
  | { kind: "h2"; id: string; text: string }
  | { kind: "h3"; id: string; text: string }
  | { kind: "quote"; id: string; text: string }
  | { kind: "list"; id: string; items: string[] }
  | { kind: "olist"; id: string; items: string[]; start: number }
  | { kind: "hr"; id: string }
  | {
      kind: "table";
      id: string;
      aligns: ("start" | "center" | "end")[];
      head: string[];
      rows: string[][];
    }
  | { kind: "quran"; id: string; text: string; sura: string; ayah: string }
  | { kind: "hadith"; id: string; text: string; narrator: string; via?: "directive" }
  | { kind: "note"; id: string; text: string }
  | { kind: "question"; id: string; text: string };

/** مقطع نص مضمن: نص عادي أو بتنسيق (تغميق/ميلان/شطب/مصطلح برمجي) */
export type InlineKind = "text" | "b" | "i" | "s" | "c";
export type InlineSeg = { t: InlineKind; x: string };

/** ترميز الكتل — يُستخدم في زر المحرر وللتوثيق */
export const QURAN_TEMPLATE = (sura: string, ayah: string, text: string) =>
  `[[آية|${sura}|${ayah}]]\n${text}\n[[/آية]]`;

export const HADITH_TEMPLATE = (narrator: string, text: string) =>
  `[[حديث|${narrator}]]\n${text}\n[[/حديث]]`;

/** قوالب الوسوم التوجيهية — لزر المحرر وللتوثيق */
export const QURAN_DIRECTIVE_TEMPLATE = (sura: string, ayah: string, text: string) =>
  `:::quran{sura="${sura}" ayah="${ayah}"}\n${text}\n:::`;

export const HADITH_DIRECTIVE_TEMPLATE = (narrator: string, text: string) =>
  `:::hadith{narrator="${narrator}"}\n${text}\n:::`;

export const NOTE_TEMPLATE = (text: string) => `:::note\n${text}\n:::`;

export const QUESTION_TEMPLATE = (text: string) => `:::question\n${text}\n:::`;

/** تحويل الأرقام إلى أرقام عربية مشرقية */
export function toArabicDigits(input: string | number): string {
  const digits = "٠١٢٣٤٥٦٧٨٩";
  return String(input).replace(/\d/g, (d) => digits[Number(d)]);
}

/* =====================================================================
   التنسيق المضمن — **تغميق** *ميلان* ~~شطب~~ `مصطلح`
   (الشيفرة البرمجية أولوية: ما داخل `..` لا يُحلَّل داخليًا)
   ===================================================================== */

const INLINE_RE =
  /(`([^`]+)`)|(\*\*(.+?)\*\*)|(~~(.+?)~~)|(\*([^*\n]+?)\*)/g;

export function parseInline(raw: string): InlineSeg[] {
  if (!raw) return [];
  const segs: InlineSeg[] = [];
  let last = 0;
  for (const m of raw.matchAll(INLINE_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) segs.push({ t: "text", x: raw.slice(last, idx) });
    if (m[1]) segs.push({ t: "c", x: m[2] });
    else if (m[3]) segs.push({ t: "b", x: m[4] });
    else if (m[5]) segs.push({ t: "s", x: m[6] });
    else if (m[7]) segs.push({ t: "i", x: m[8] });
    last = idx + m[0].length;
  }
  if (last < raw.length) segs.push({ t: "text", x: raw.slice(last) });
  return segs.length > 0 ? segs : [{ t: "text", x: raw }];
}

/**
 * كلمات نص مضمن كما ستُعرض فعليًا (بعد نزع علامات التنسيق) —
 * مطابقة حرفيًا لطريقة تقطيع المكونات العارضة، حفاظًا على تزامن الكاريوكي.
 */
export function inlineWords(raw: string): string[] {
  return parseInline(raw).flatMap((s) => s.x.split(/\s+/).filter(Boolean));
}

/* =====================================================================
   الوسوم التوجيهية :::name{attr="value"}
   ===================================================================== */

type DirectiveName = "quran" | "hadith" | "note" | "question";

const DIRECTIVE_NAMES: Record<string, DirectiveName> = {
  quran: "quran",
  "آية": "quran",
  hadith: "hadith",
  "حديث": "hadith",
  note: "note",
  "ملاحظة": "note",
  question: "question",
  "تساؤل": "question",
  "سؤال": "question",
};

const DIRECTIVE_OPEN = /^:::\s*([^\s{:]+)\s*(?:\{(.*)\})?\s*$/;

/** مطابقة اسم السمة مع مرادفاتها العربية واللاتينية */
function attrOf(attrs: Record<string, string>, keys: string[]): string {
  for (const k of keys) {
    const v = attrs[k];
    if (v && v.trim()) return v.trim();
  }
  return "";
}

function normalizeAttrs(raw: Record<string, string>): {
  sura: string;
  ayah: string;
  narrator: string;
} {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) out[k.toLowerCase()] = v;
  return {
    sura: attrOf(out, ["sura", "surah", "سورة", "سوره"]),
    ayah: attrOf(out, ["ayah", "verse", "آية", "ايه", "رقم"]),
    narrator: attrOf(out, ["narrator", "source", "راوي", "الراوي", "تخريج", "التخريج"]),
  };
}

function parseAttrs(input?: string): Record<string, string> {
  if (!input) return {};
  const attrs: Record<string, string> = {};
  const re = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s}]+))/g;
  for (const m of input.matchAll(re)) {
    attrs[m[1]] = m[2] ?? m[3] ?? m[4] ?? "";
  }
  return attrs;
}

/**
 * استخلاص الوسوم التوجيهية :::name ... ::: من النص الخام قبل التحليل العادي،
 * وترك علامة موضعة @@DIR-n@@ مكان كل وسم تحفظ ترتيبه في النص.
 */
function extractDirectives(raw: string): {
  body: string;
  dirBlocks: Block[];
} {
  const lines = raw.split("\n");
  const kept: string[] = [];
  const dirBlocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const t = lines[i].trim();
    const m = t.match(DIRECTIVE_OPEN);
    const name = m ? DIRECTIVE_NAMES[m[1].toLowerCase()] : undefined;

    if (m && name) {
      const attrs = normalizeAttrs(parseAttrs(m[2]));
      i++;
      const bodyLines: string[] = [];
      while (i < lines.length && lines[i].trim() !== ":::") {
        bodyLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // تجاوز سطر الإغلاق :::

      const text = bodyLines.join(" ").replace(/\s+/g, " ").trim();
      const id = `dir-${dirBlocks.length}`;

      if (name === "quran" && text) {
        dirBlocks.push({ kind: "quran", id, text, sura: attrs.sura, ayah: attrs.ayah });
      } else if (name === "hadith" && text) {
        dirBlocks.push({ kind: "hadith", id, text, narrator: attrs.narrator, via: "directive" });
      } else if (name === "note" && text) {
        dirBlocks.push({ kind: "note", id, text });
      } else if (name === "question" && text) {
        dirBlocks.push({ kind: "question", id, text });
      }
      /* علامة موضعة فقط عند وجود كتلة فعلية — الوسوم الفارغة تُزال بلا أثر */
      if (dirBlocks.length > 0 && kept[kept.length - 1] !== `@@dir-${dirBlocks.length - 1}@@`) {
        kept.push(`@@dir-${dirBlocks.length - 1}@@`);
      }
      continue;
    }

    kept.push(lines[i]);
    i++;
  }

  return { body: kept.join("\n"), dirBlocks };
}

/* أنماط رؤوس كتل الإرث — عربي أساسي + لاتيني بديل للتسامح */
const QURAN_HEAD =
  /^\[\[(?:آية|QURAN)\s*\|\s*([^\]|]+?)\s*\|\s*([^\]|]+?)\s*\]\]/;
const HADITH_HEAD = /^\[\[(?:حديث|HADITH)\s*\|\s*([^\]|]+?)\s*\]\]/;
const BLOCK_CLOSE = /^\[\[\/(?:آية|حديث|QURAN|HADITH)\s*\]\]/;

const H2_RE = /^#{1,2}\s+(.+)$/;
const OLIST_ITEM_RE = /^(\d{1,3})[.)]\s+(.*)$/;
const HR_RE = /^([-*_])\1{2,}$/;

/** هل السطر الثاني في المقطع فاصل جدول GFM؟ */
function isTableSeparator(line: string): boolean {
  const t = line.trim();
  if (!t.includes("-") || !t.includes("|")) return false;
  return /^\|?[\s:|-]+\|?$/.test(t);
}

function splitTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

function parseAligns(sepCells: string[]): ("start" | "center" | "end")[] {
  return sepCells.map((c) => {
    const t = c.trim();
    const left = t.startsWith(":");
    const right = t.endsWith(":");
    if (left && right) return "center" as const;
    if (right) return "end" as const;
    return "start" as const;
  });
}

/**
 * تحليل المحتوى الخام إلى كتل جاهزة للعرض.
 * الفواصل: سطر فارغ بين الفقرات. داخل كتل الآيات والأحاديث (والوسوم
 * التوجيهية) تُدمج الأسطر المتتالية في نص واحد حتى سطر الإغلاق.
 */
export function parseBlocks(raw: string): Block[] {
  const { body, dirBlocks } = extractDirectives(raw);
  const dirMap = new Map(dirBlocks.map((b) => [b.id, b]));

  const blocks: Block[] = [];
  const chunks = body.split(/\n\n+/);
  let idx = 0;

  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    const id = `blk-${idx++}`;

    /* ===== وسم توجيهي مُستخلَص مسبقًا ===== */
    if (/^@@dir-\d+@@$/.test(trimmed)) {
      const dir = dirMap.get(trimmed.replace(/@@/g, ""));
      if (dir) {
        blocks.push({ ...dir, id });
      }
      continue; /* علامة بلا كتلة (وسم فارغ) تُتجاهل بلا أي أثر */
    }

    /* ===== كتلة آية قرآنية (صيغة الإرث [[آية|..|..]]) ===== */
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

    /* ===== كتلة حديث نبوي (صيغة الإرث [[حديث|..]]) ===== */
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

    /* ===== الفاصل الأفقي --- أو *** أو ___ ===== */
    if (trimmed.split("\n").length === 1 && HR_RE.test(trimmed)) {
      blocks.push({ kind: "hr", id });
      continue;
    }

    /* ===== العناوين — بسلوك الإرث الدقيق (الكتلة كاملة حتى السطر الفارغ) ===== */
    if (trimmed.startsWith("### ")) {
      blocks.push({ kind: "h3", id, text: trimmed.replace(/^#{3,6}\s+/, "").trim() });
      continue;
    }
    if (trimmed.startsWith("## ")) {
      blocks.push({ kind: "h2", id, text: trimmed.slice(3).trim() });
      continue;
    }
    if (H2_RE.test(trimmed) && trimmed.split("\n").length === 1) {
      blocks.push({ kind: "h2", id, text: trimmed.replace(/^#\s+/, "").trim() });
      continue;
    }

    /* ===== جدول مقارنة GFM ===== */
    {
      const lines = trimmed.split("\n");
      if (
        lines.length >= 2 &&
        lines[0].includes("|") &&
        lines.slice(2).every((l) => l.includes("|")) &&
        isTableSeparator(lines[1])
      ) {
        const head = splitTableRow(lines[0]);
        const aligns = parseAligns(splitTableRow(lines[1]));
        const rows = lines.slice(2).map(splitTableRow);
        blocks.push({ kind: "table", id, aligns, head, rows });
        continue;
      }
    }

    /* ===== القوائم المرتبة 1. أو 1) ===== */
    {
      const lines = trimmed.split("\n").map((l) => l.trim());
      if (
        lines.length > 0 &&
        lines.every((l) => OLIST_ITEM_RE.test(l))
      ) {
        const first = lines[0].match(OLIST_ITEM_RE)!;
        blocks.push({
          kind: "olist",
          id,
          start: parseInt(first[1], 10) || 1,
          items: lines.map((l) => l.replace(OLIST_ITEM_RE, "$2").trim()),
        });
        continue;
      }
    }

    /* ===== الاقتباسات ===== */
    if (trimmed.startsWith("> ")) {
      blocks.push({
        kind: "quote",
        id,
        text: trimmed.replace(/^>\s?/gm, "").trim(),
      });
      continue;
    }

    /* ===== القوائم غير المرتبة ===== */
    if (
      /^-\s/m.test(trimmed) &&
      trimmed.split("\n").every((l) => /^-\s/.test(l.trim()))
    ) {
      blocks.push({
        kind: "list",
        id,
        items: trimmed.split("\n").map((l) => l.replace(/^-\s*/, "").trim()),
      });
      continue;
    }

    /* ===== الفقرة ===== */
    blocks.push({ kind: "p", id, text: trimmed.replace(/\n/g, " ") });
  }

  return blocks;
}

/**
 * الكلمات الظاهرة للكتلة الواحدة — المصدر الموحّد لعدّ الكلمات
 * (المشغل الصوتي + وقت القراءة + مخطط الإلقاء في لوحة التحكم).
 */
export function blockPlainWords(block: Block): string[] {
  switch (block.kind) {
    case "hr":
      return [];
    case "list":
    case "olist":
      return block.items.map((t) => inlineWords(t)).flat();
    case "table":
      return [...block.head, ...block.rows.flat()]
        .map((t) => inlineWords(t))
        .flat();
    case "quran":
    case "hadith":
      return block.text.split(/\s+/).filter(Boolean);
    default:
      return inlineWords(block.text);
  }
}

/** عدد كلمات كتلة (للمشغل الصوتي ووقت القراءة) */
export function blockWordCount(block: Block): number {
  return blockPlainWords(block).length;
}

/** سطر الإلقاء الصوتي للكتلة — نص نقي بلا أي علامات تنسيق */
export function blockSpokenLine(block: Block): string {
  switch (block.kind) {
    case "hr":
      return "";
    case "list":
    case "olist":
      return block.items.map((t) => inlineWords(t).join(" ")).join(". ");
    case "table":
      return [...block.head, ...block.rows.flat()]
        .map((t) => inlineWords(t).join(" "))
        .join(" ");
    case "quran":
    case "hadith":
      return block.text;
    default:
      return inlineWords(block.text).join(" ");
  }
}
