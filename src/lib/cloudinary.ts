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

/* ==================== الصوت — نفس الحماية السيرفرية ==================== */

export type AudioUploadResult = {
  url: string;
  publicId: string;
  bytes: number;
  durationSec: number | null;
};

/** رفع ملف صوتي (MP3/WAV) — Cloudinary يصنّفه resource_type=video */
export async function uploadAudio(
  file: Blob,
  filename: string,
  folder = "kalam/audio",
  publicId?: string,
): Promise<AudioUploadResult> {
  if (!cloudinaryConfigured) {
    throw new Error("خدمة التخزين السحابي غير مهيأة — أضف مفاتيح Cloudinary في متغيرات البيئة");
  }

  const timestamp = Math.round(Date.now() / 1000);
  const params: Record<string, string> = { folder, timestamp: String(timestamp) };
  if (publicId) params.public_id = publicId;
  const signature = await makeSignature(params);

  const form = new FormData();
  form.append("file", file, filename);
  form.append("api_key", KEY!);
  form.append("timestamp", String(timestamp));
  form.append("folder", folder);
  if (publicId) form.append("public_id", publicId);
  form.append("signature", signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/video/upload`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`فشل رفع الصوت إلى التخزين السحابي (${res.status}) ${detail.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    secure_url: string;
    bytes: number;
    public_id: string;
    duration: number | null;
  };

  return {
    url: data.secure_url,
    publicId: data.public_id,
    bytes: data.bytes ?? 0,
    durationSec: typeof data.duration === "number" ? data.duration : null,
  };
}

/** حذف أصل صوتي من Cloudinary (عند الاستبدال أو الإزالة) — لا يفشل العملية أبدًا */
export async function destroyAudio(publicId: string): Promise<void> {
  try {
    if (!cloudinaryConfigured) return;
    const timestamp = Math.round(Date.now() / 1000);
    const params: Record<string, string> = { public_id: publicId, timestamp: String(timestamp) };
    const signature = await makeSignature(params);
    const form = new FormData();
    form.append("api_key", KEY!);
    form.append("timestamp", String(timestamp));
    form.append("public_id", publicId);
    form.append("signature", signature);
    await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/video/destroy`, {
      method: "POST",
      body: form,
    });
  } catch {}
}

/* ==================== إدارة الأصول — واجهة الـ Admin API ==================== */

function basicAuthHeader(): string {
  return "Basic " + Buffer.from(`${KEY}:${SECRET}`).toString("base64");
}

export type CloudinaryUsage = {
  plan: string;
  creditsUsed: number;
  creditsLimit: number;
  storageUsedBytes: number;
  storageLimitBytes: number;
  bandwidthUsedBytes: number;
  bandwidthLimitBytes: number;
  objectsCount: number;
  transformationsCount: number;
  raw?: unknown;
};

/** استهلاك حساب Cloudinary الإجمالي (Admin API usage) */
export async function cloudinaryUsage(): Promise<CloudinaryUsage | null> {
  if (!cloudinaryConfigured) return null;
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/usage`, {
    headers: { Authorization: basicAuthHeader() },
  });
  if (!res.ok) return null;
  const d = (await res.json()) as Record<string, unknown>;
  const plan = (d.plan as Record<string, unknown>) ?? {};
  const storage = (d.storage as Record<string, unknown>) ?? {};
  const bandwidth = (d.bandwidth as Record<string, unknown>) ?? {};
  const transformations = (d.transformations as Record<string, unknown>) ?? {};
  const objects = (d.objects as Record<string, unknown>) ?? {};
  return {
    plan: (plan.id as string) ?? "unknown",
    creditsUsed: (d.credits as Record<string, unknown>)?.usage as number | undefined ?? 0,
    creditsLimit: (d.credits as Record<string, unknown>)?.limit as number | undefined ?? 0,
    storageUsedBytes: (storage.usage as number) ?? 0,
    storageLimitBytes: (storage.limit as number) ?? 0,
    bandwidthUsedBytes: (bandwidth.usage as number) ?? 0,
    bandwidthLimitBytes: (bandwidth.limit as number) ?? 0,
    objectsCount: (objects.usage as number) ?? 0,
    transformationsCount: (transformations.usage as number) ?? 0,
    raw: { lastUpdated: d.last_updated ?? null },
  };
}

export type CloudinaryAsset = {
  publicId: string;
  resourceType: string;
  format: string | null;
  bytes: number;
  width: number | null;
  height: number | null;
  createdAt: string;
  url: string;
};

/** جرد أصول Cloudinary ببادئة مجلد (Admin API resources) */
export async function listCloudinaryAssets(
  prefix = "kalam",
  resourceType: "image" | "video" | "raw" = "image",
  maxResults = 30,
): Promise<{ assets: CloudinaryAsset[]; nextCursor: string | null; rateLimitAtLimit: boolean }> {
  if (!cloudinaryConfigured) throw new Error("خدمة الصور غير مهيأة");
  const cap = Math.min(Math.max(maxResults, 1), 100);
  const url = `https://api.cloudinary.com/v1_1/${CLOUD}/resources/${resourceType}/upload?prefix=${encodeURIComponent(prefix)}&max_results=${cap}`;
  const res = await fetch(url, { headers: { Authorization: basicAuthHeader() } });
  if (!res.ok) {
    throw new Error(`فشل جرد الأصول (${res.status}) ${(await res.text().catch(() => "")).slice(0, 150)}`);
  }
  const d = (await res.json()) as {
    resources: Array<Record<string, unknown>>;
    next_cursor?: string;
  };
  return {
    assets: (d.resources ?? []).map((r) => ({
      publicId: r.public_id as string,
      resourceType: r.resource_type as string,
      format: (r.format as string) ?? null,
      bytes: (r.bytes as number) ?? 0,
      width: (r.width as number) ?? null,
      height: (r.height as number) ?? null,
      createdAt: r.created_at as string,
      url: r.secure_url as string,
    })),
    nextCursor: d.next_cursor ?? null,
    rateLimitAtLimit: (d.resources?.length ?? 0) >= cap,
  };
}

/** حذف أي أصل من Cloudinary بنوعه (صورة image / صوت video) */
export async function destroyCloudinaryAsset(
  publicId: string,
  resourceType: "image" | "video" | "raw" = "image",
): Promise<{ deleted: boolean; result: string }> {
  if (!cloudinaryConfigured) throw new Error("خدمة الصور غير مهيأة");
  const timestamp = Math.round(Date.now() / 1000);
  const params: Record<string, string> = { public_id: publicId, timestamp: String(timestamp) };
  const signature = await makeSignature(params);
  const form = new FormData();
  form.append("api_key", KEY!);
  form.append("timestamp", String(timestamp));
  form.append("public_id", publicId);
  form.append("signature", signature);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/${resourceType}/destroy`, {
    method: "POST",
    body: form,
  });
  const d = (await res.json().catch(() => ({}))) as { result?: string };
  return { deleted: d.result === "ok", result: d.result ?? `http_${res.status}` };
}

/* ==================== الملفات الخام — تقارير التدقيق الرقابية ==================== */

/** رفع ملف خام (تقرير PDF الرقابي) إلى مجلد الأدلة المحمي — يعيد رابط التنزيل الدائم */
export async function uploadRaw(
  data: Uint8Array | Buffer,
  filename: string,
  folder = "kalam/evidence/audit-reports",
): Promise<{ url: string; publicId: string; bytes: number }> {
  if (!cloudinaryConfigured) {
    throw new Error("التخزين السحابي غير مهيأ — أضف مفاتيح Cloudinary في متغيرات البيئة");
  }
  const timestamp = Math.round(Date.now() / 1000);
  const params: Record<string, string> = { folder, timestamp: String(timestamp) };
  const signature = await makeSignature(params);
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(data)]), filename);
  form.append("api_key", KEY!);
  form.append("timestamp", String(timestamp));
  form.append("folder", folder);
  form.append("signature", signature);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/raw/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`فشل رفع التقرير إلى مجلد الأدلة (${res.status}) ${detail.slice(0, 200)}`);
  }
  const d = (await res.json()) as { secure_url: string; public_id: string; bytes: number };
  return { url: d.secure_url, publicId: d.public_id, bytes: d.bytes ?? 0 };
}
