import { NextResponse } from "next/server";
import { requireSession, isRejected, getClientIp } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { synthesizeChunk, TtsError, TTS_VOICE } from "@/lib/gemini-tts";
import { encodeNarration, pcmDurationSec } from "@/lib/audio-encode";
import { buildSegmentPlan, spokenSource, allocateWordTimings } from "@/lib/audio-narration";

/*
 * توليد مقطع واحد من القراءة الصوتية (خطوة من N) — تصميم مقطّع
 * لأن توليد مقال كامل في نداء واحد يتجاوز زمن الدوال السحابية.
 * العميل يستدعي هذا المسار مقطعًا مقطعًا مع إظهار التقدم، ثم يختم
 * بمسار finalize الذي يجمّع الأجزاء ويرفعها ويربط المزامنة بالمقال.
 */

export const maxDuration = 60;

const MAX_SEGMENTS = 60; // ≈ 40 دقيقة صوت كحد أقصى حمايةً للحصة

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;
  const { id } = await params;

  try {
    const body = (await request.json().catch(() => ({}))) as { index?: number };
    const index = Number(body.index ?? 0);

    const article = await prisma.article.findUnique({
      where: { id },
      select: { id: true, slug: true, content: true, contentWithTashkeel: true },
    });
    if (!article) {
      return NextResponse.json({ error: "المقال غير موجود" }, { status: 404 });
    }

    const source = spokenSource(article.content, article.contentWithTashkeel);
    const plan = buildSegmentPlan(source);
    if (plan.length === 0) {
      return NextResponse.json({ error: "لا يوجد نص صالح للقراءة الصوتية" }, { status: 422 });
    }
    if (plan.length > MAX_SEGMENTS) {
      return NextResponse.json(
        { error: `المقال أطول من حد التوليد الحالي (${MAX_SEGMENTS} مقطعًا) — قسّمه أو اختصره` },
        { status: 413 },
      );
    }
    if (!Number.isInteger(index) || index < 0 || index >= plan.length) {
      return NextResponse.json({ error: "رقم مقطع خارج النطاق", total: plan.length }, { status: 400 });
    }

    const seg = plan[index];
    const { pcm, sampleRate, model } = await synthesizeChunk(seg.text);
    const duration = Math.round(pcmDurationSec(pcm, sampleRate) * 100) / 100;
    const encoded = encodeNarration(pcm);
    const words = allocateWordTimings(seg.words, 0, duration);

    void getClientIp;
    return NextResponse.json({
      index,
      total: plan.length,
      audio: encoded.bytes.toString("base64"),
      mime: encoded.mime,
      duration,
      words,
      model,
      voice: TTS_VOICE,
      previewText: seg.text.slice(0, 60),
    });
  } catch (err) {
    if (err instanceof TtsError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: "تعذر توليد المقطع الصوتي — أعد المحاولة" },
      { status: 500 },
    );
  }
}
