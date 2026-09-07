/**
 * تكامل Cloudinary — يعمل حصريًا على السيرفر، سرّ الـ API لا يقترب من المتصفح.
 * تُخزن الصور بصيغ الويب الحديثة (WebP/AVIF) تلقائيًا عبر f_auto,q_auto
 * فيكبف الرفع سرعة المنصة دون أي ضغط يدوي.
 */

const CLOUD = process.env.CLOUDINARY_CLOUD_NAME;
const KEY = process.env.CLOUDINARY_API_KEY;
const SECRET = process.env.CLOUDINARY_API_SECRET;

export const cloudinaryConfigured = Boolean(CLOUD && KEY && SECRET && !CLOUD.startsWith("PLACEHOLDER"));

/** توقيع الرفع (SHA-1 لمعاملات مرتبة أبجديًا + السر) وفق وثائق Cloudinary */
async function makeSignature(params: Record<string, string>): Promise<string> {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  const raw = `${sorted}${SECRET}`;
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(raw));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type UploadResult = {
  url: string; // رابط التسليم المحسّن (f_auto,q_auto → WebP/AVIF)
  rawUrl: string; // رابط الأصل
  width: number | null;
  height: number | null;
  bytes: number;
};

/** رفع صورة إلى Cloudinary وإرجاع روابطها المحسّنة */
export async function uploadImage(
  file: Blob,
  filename: string,
  folder = "kalam",
): Promise<UploadResult> {
  if (!cloudinaryConfigured) {
    throw new Error("خدمة الصور غير مهيأة — أضف مفاتيح Cloudinary في متغيرات البيئة");
  }

  const timestamp = Math.round(Date.now() / 1000);
  const params: Record<string, string> = { folder, timestamp: String(timestamp) };
  const signature = await makeSignature(params);

  const form = new FormData();
  form.append("file", file, filename);
  form.append("api_key", KEY!);
  form.append("timestamp", String(timestamp));
  form.append("folder", folder);
  form.append("signature", signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`فشل رفع الصورة إلى التخزين السحابي (${res.status}) ${detail.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    secure_url: string;
    width: number;
    height: number;
    bytes: number;
    public_id: string;
    version: number;
  };

  /* رابط التسليم المحسّن: إدراج f_auto,q_auto بعد upload/ ليعطي WebP/AVIF حسب المتصفح */
  const rawUrl = data.secure_url;
  const url = rawUrl.replace("/upload/", "/upload/f_auto,q_auto/");

  return {
    url,
    rawUrl,
    width: data.width ?? null,
    height: data.height ?? null,
    bytes: data.bytes ?? 0,
  };
}
