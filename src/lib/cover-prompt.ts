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
 * صياغة البرومت الفني الراقي — أسلوب فلسفي هادئ Minimalist/Concept Art
 * بهوية المنصة البصرية (نحاسي دافئ على ورقي كريمي، بلا أي نصوص مكتوبة)
 */
export function buildArtPrompt(title: string, summary: string, core: string): string {
  return [
    "Create a single minimalist philosophical concept-art editorial cover image for a thoughtful Arabic intellectual essay.",
    "Art direction: calm, contemplative, generous negative space, flat elegant shapes with subtle paper-grain texture,",
    "warm muted palette (deep copper #A16A1F, cream #F8F4EC, soft charcoal accents), soft ambient light.",
    "Abstract symbolism ONLY — visual metaphors that express the core idea. Absolutely NO text, NO letters, NO words, NO Arabic calligraphy, NO typography of any kind.",
    "Style reference: premium literary magazine cover, modern minimalism, timeless and dignified.",
    "",
    `Essay title: ${title}`,
    summary ? `Summary: ${summary}` : "",
    core ? `Core content (for meaning extraction): ${core}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
