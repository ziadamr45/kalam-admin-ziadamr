/** Limits for client-supplied base64 data URIs, not downloaded URLs or rendered output.
 * This guard runs only after the server receives the request. External MCP clients
 * must check their full serialized JSON-RPC body before sending it.
 */
export const MAX_INLINE_UPLOAD_BYTES = 3_000_000;
export const MAX_INLINE_ARGUMENT_BYTES = 4_250_000;

export const INLINE_UPLOAD_GUIDANCE =
  "base64 للملفات الصغيرة فقط: حتى 3,000,000 بايت قبل الترميز، وحتى 4,250,000 بايت لمعاملات JSON بعد الترميز (UTF-8). على العميل فحص حجم جسم JSON-RPC الكامل قبل الإرسال وإبقاؤه دون 4,250,000 بايت. للملفات الأكبر استخدم رابط HTTPS مباشرًا أو الرفع اليدوي ضمن حدوده. التحقق داخل الأداة بعد استلام الطلب لا يمنع خطأ 413 من الاستضافة قبل وصوله.";

export function inlineUploadSizeIssue(
  input: string,
  args: Record<string, unknown>,
): string | null {
  const value = input.trim();
  const comma = value.indexOf(",");
  if (comma < 0 || !/^data:/i.test(value) ||
      !/;base64(?:;|$)/i.test(value.slice(0, comma))) {
    return null;
  }

  // Count decoded bytes without allocating the decoded media. Strip whitespace
  // accepted by the existing decoder before counting padding/URL-safe base64.
  const payload = value.slice(comma + 1).replace(/\s/g, "");
  const decodedBytes = Buffer.byteLength(payload, "base64");
  const argumentBytes = Buffer.byteLength(JSON.stringify(args), "utf8");
  if (decodedBytes <= MAX_INLINE_UPLOAD_BYTES &&
      argumentBytes <= MAX_INLINE_ARGUMENT_BYTES) {
    return null;
  }
  return `حجم بيانات base64 يتجاوز حد الرفع المضمّن. ${INLINE_UPLOAD_GUIDANCE}`;
}
