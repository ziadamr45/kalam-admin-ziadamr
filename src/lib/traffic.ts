/**
 * أدوات مرصد الحركة — تحليل نوع الجهاز من ترويسة User-Agent
 * بدون أي اعتماد خارجي (تعمل على الحافة وفي Node معًا).
 */

export function deviceFromUserAgent(ua: string): string {
  const s = ua.toLowerCase();
  if (!s) return "unknown";

  /* روبوتات الزحف والمجسات — تُعلَّم رقابيًا */
  if (/(bot|crawler|spider|crawling|facebookexternalhit|whatsapp|telegram|preview|monitor|uptime|pingdom|lighthouse|headless)/.test(s))
    return "bot";

  if (/(ipad|tablet|kindle|silk|playbook|sm-t)/.test(s)) return "tablet";
  if (/(mobi|iphone|ipod|android.*mobile|windows phone|blackberry|opera mini|iemobile)/.test(s)) return "mobile";
  if (/android/.test(s)) return "mobile";
  return "desktop";
}

/** جهاز بصيغة عربية مقتضبة للعرض */
export function deviceLabelAr(device: string | null | undefined): string {
  switch (device) {
    case "mobile":
      return "هاتف";
    case "tablet":
      return "لوحي";
    case "desktop":
      return "حاسوب";
    case "bot":
      return "روبوت";
    case "unknown":
      return "غير معروف";
    default:
      return device ?? "—";
  }
}
