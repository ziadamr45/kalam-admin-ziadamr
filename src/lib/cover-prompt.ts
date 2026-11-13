/**
 * مساعدات صياغة البرومت الفني لأغلفة المقالات — مستخرجة من مسار
 * /api/articles/[id]/cover لتشاركها لوحة التحكم وبوابة MCP السيادية
 * (generate_article_cover) دون تكرار منطق المدير الفني.
 */

/**
 * تنظيف نص المقال من كتل التنسيق الخاصة قبل صياغة البرومت الفني
 * ([[آية|سورة|رقم]] و [[حديث|راوي]] وعلامات الماركداون الخفيف)
 */
export function sanitizeForPrompt(raw: string): string {
  return raw
    .replace(/\[\[[^\]]+\]\]/g, " ")
    .replace(/^#+\s+/gm, "")
    .replace(/^>\s+/gm, "")
    .replace(/^-\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * صياغة البرومت الفني الراقي — مشهد تصويري واقعي هادئ (تحريري / Still Life)
 * بدل التجريد الحر الذي يرسمه Flux أشكالًا مشوهة: محركات الصور المجانية
 * تلتزم الواقعية الحرفية أفضل بمراحل — كتب ومكاتب وضوء دافئ وطبيعة هادئة
 * تعبر عن فكرة المقال مباشرة، بلا أي نصوص أو شفافية أو أجساد مشوهة.
 */
export function buildArtPrompt(title: string, summary: string, core: string): string {
  return [
    "Create a single realistic editorial cover photograph for a thoughtful Arabic intellectual essay.",
    "Art direction: calm minimalist editorial photography — a warm atmospheric still life or a quiet real scene that visually expresses the essay's core idea,",
    "such as a wooden desk with an open book and warm window light, a serene natural landscape tied to the theme, or a contemplative everyday setting.",
    "Clean legible composition with generous negative space, shallow depth of field, warm muted palette (deep copper #A16A1F, cream #F8F4EC, soft charcoal accents), soft natural light.",
    "Realistic photographic style — NO abstract surrealism, NO distorted shapes or figures, NO text, NO letters, NO words, NO typography of any kind.",
    "Style reference: premium literary magazine cover, modern editorial photography, timeless and dignified.",
    "",
    `Essay title: ${title}`,
    summary ? `Summary: ${summary}` : "",
    core ? `Core content (for meaning extraction): ${core}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * تذييل ثابت لبقية صاحب القرار عندما يصف الصورة بنفسه — يضبط الأسلوب
 * على واقعية المنصة ويمنع النصوص المكتوبة والأشكال المشوهة مهما كتب.
 */
export const COVER_CUSTOM_SUFFIX =
  "clean realistic editorial photography, warm natural lighting, shallow depth of field, warm copper and cream tones, premium literary magazine cover style, no text, no letters, no typography, no abstract surrealism, no distorted shapes";
