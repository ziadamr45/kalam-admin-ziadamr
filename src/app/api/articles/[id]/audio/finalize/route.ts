import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireSession, isRejected, writeAudit, getClientIp } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { uploadAudio, destroyAudio } from "@/lib/cloudinary";
import { TTS_VOICE } from "@/lib/gemini-tts";

/*
 * ختم التوليد: تجميع مقاطع الصوت المتجانسة في ملف واحد، رفعه إلى
 * Cloudinary، إزاحة طوابع الكلمات بمجاميع مدد المقاطع، وحفظ كل شيء
 * على المقال — ثم إعادة توليد صفحة المقال ليظهر الصوت فورًا للقراء.
 */

const MAX_SEGMENTS = 60;
const MAX_WORDS = 8000;

type IncomingSegment = { audio?: string; duration?: number; words?: { w: string; s: number; e: number }[] };

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;
  const { id } = await params;

  try {
    const body = (await request.json()) as { segments?: IncomingSegment[] };
    const segments = (body.segments ?? []).filter(
      (s) => typeof s.audio === "string" && s.audio.length > 0,
    );
    if (segments.length === 0 || segments.length > MAX_SEGMENTS) {
      return NextResponse.json({ error: "مقاطع غير صالحة" }, { status: 400 });
    }

    const article = await prisma.article.findUnique({
      where: { id },
      select: { slug: true, audioPublicId: true, audioCues: true },
    });
    if (!article) {
      return NextResponse.json({ error: "المقال غير موجود" }, { status: 404 });
    }

    /* تجميع البايتات + إزاحة الطوابع بمجاميع المدد */
    const buffers: Buffer[] = [];
    let offset = 0;
    const shiftedWords: { w: string; s: number; e: number }[] = [];
    for (const seg of segments) {
      const b64 = typeof seg.audio === "string" ? seg.audio : "";
      const buf = Buffer.from(b64, "base64");
      if (buf.length === 0) continue;
      buffers.push(buf);
      const dur = Math.max(0, Number(seg.duration ?? 0));
      for (const w of seg.words ?? []) {
        if (shiftedWords.length >= MAX_WORDS) break;
        shiftedWords.push({
          w: String(w.w ?? "").slice(0, 40),
          s: Math.round((offset + Number(w.s ?? 0)) * 100) / 100,
          e: Math.round((offset + Number(w.e ?? 0)) * 100) / 100,
        });
      }
      offset += dur;
    }
    const totalBytes = Buffer.concat(buffers);
    const durationSec = Math.round(offset * 100) / 100;
    if (totalBytes.length < 1024) {
      return NextResponse.json({ error: "الصوت المولّد فارغ أو تالف — أعد المحاولة" }, { status: 502 });
    }

    /* الرفع السحابي بمعرف فريد لكل توليد */
    const safeSlug = article.slug.replace(/[^a-z0-9-_]/gi, "-").slice(0, 60) || "article";
    const publicId = `kalam/audio/${safeSlug}-${Date.now().toString(36)}`;
    const uploaded = await uploadAudio(
      new Blob([new Uint8Array(totalBytes)], { type: "audio/mpeg" }),
      `${safeSlug}.mp3`,
      "kalam/audio",
      publicId,
    );

    /* حذف الصوت القديم إن وُجد (استبدال نظيف بلا مخلفات) */
    if (article.audioPublicId && article.audioPublicId !== uploaded.publicId) {
      await destroyAudio(article.audioPublicId);
    }

    await prisma.article.update({
      where: { id },
      data: {
        audioUrl: uploaded.url,
        audioPublicId: uploaded.publicId,
        audioDurationSec: durationSec,
        audioWords: shiftedWords as never,
        audioVoice: TTS_VOICE,
        audioGeneratedAt: new Date(),
      },
    });

    /* الصوت الجديد حي على صفحة المقال لحظةً */
    revalidatePath(`/article/${article.slug}`);

    await writeAudit({
      adminId: guard.adminId,
      action: "article.audio_generated",
      entity: "Article",
      entityId: id,
      meta: { slug: article.slug, durationSec, words: shiftedWords.length, bytes: uploaded.bytes },
      ip: getClientIp(request),
    });

    return NextResponse.json({
      ok: true,
      audioUrl: uploaded.url,
      durationSec,
      wordsCount: shiftedWords.length,
      bytes: uploaded.bytes,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "تعذر ختم التوليد الصوتي" },
      { status: 500 },
    );
  }
}
