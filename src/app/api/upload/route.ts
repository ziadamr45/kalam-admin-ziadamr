import { NextResponse } from "next/server";
import { requireSession, isRejected, writeAudit, getClientIp } from "@/lib/guard";
import { uploadImage, uploadAudio, cloudinaryConfigured } from "@/lib/cloudinary";

/**
 * الرفع السحابي الموحد — سيرفر فقط، سرّ Cloudinary لا يظهر للعميل أبدًا.
 * - الصور: تُقدَّم بصيغ الويب الحديثة (WebP/AVIF) عبر f_auto,q_auto تلقائيًا.
 * - الصوت: مسار الرفع اليدوي الاستثنائي للقراءة الصوتية (MP3/WAV ≤ 20MB).
 */
export async function POST(request: Request) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  if (!cloudinaryConfigured) {
    return NextResponse.json(
      { error: "خدمة الصور غير مهيأة — أضف مفاتيح Cloudinary إلى متغيرات البيئة" },
      { status: 503 },
    );
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "لم يُرفق ملف" }, { status: 400 });
    }

    if (file.size > 8 * 1024 * 1024) {
      return NextResponse.json({ error: "الصورة أكبر من 8MB — اختر صورة أخف" }, { status: 413 });
    }
    const type = file.type || "";

    /* ===== مسار الصوت اليدوي الاستثنائي ===== */
    if (type.startsWith("audio/")) {
      if (file.size > 20 * 1024 * 1024) {
        return NextResponse.json({ error: "الملف الصوتي أكبر من 20MB" }, { status: 413 });
      }
      const okAudio = /^(audio\/(mpeg|mp3|wav|x-wav|ogg|mp4))$/.test(type);
      if (!okAudio) {
        return NextResponse.json({ error: "صيغ الصوت المدعومة: MP3 / WAV / OGG" }, { status: 415 });
      }
      const audioResult = await uploadAudio(
        file,
        (form.get("filename") as string) || "narration.mp3",
        "kalam/audio",
      );
      await writeAudit({
        adminId: guard.adminId,
        action: "media.audio_uploaded",
        entity: "Cloudinary",
        meta: { bytes: audioResult.bytes, manual: true },
        ip: getClientIp(request),
      });
      return NextResponse.json(audioResult);
    }

    if (!type.startsWith("image/")) {
      return NextResponse.json({ error: "تُقبل الصور (JPG / PNG / WebP) أو ملفات الصوت (MP3 / WAV)" }, { status: 415 });
    }

    const filename = (form.get("filename") as string) || "image";
    const folder = (form.get("folder") as string) === "section" ? "kalam/sections" : "kalam/articles";
    const result = await uploadImage(file, filename, folder);

    await writeAudit({
      adminId: guard.adminId,
      action: "media.uploaded",
      entity: "Cloudinary",
      meta: { bytes: result.bytes, folder },
      ip: getClientIp(request),
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "فشل الرفع السحابي" },
      { status: 500 },
    );
  }
}
