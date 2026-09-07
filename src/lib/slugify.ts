/** توليد slug آمن — نسخة خادم من أداة المنصة */
export function slugify(input: string): string {
  return (
    input
      .trim()
      .toLowerCase()
      .replace(/[^\u0621-\u064Aa-z0-9\s-]/g, "")
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || `kalam-${Date.now().toString(36)}`
  );
}
