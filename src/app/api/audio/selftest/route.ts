import { NextResponse } from "next/server";
import { requireSession, isRejected } from "@/lib/guard";
import { synthesizeChunk, TtsError, TTS_VOICE } from "@/lib/gemini-tts";
import { encodeNarration, pcmDurationSec } from "@/lib/audio-encode";

/*
 * تشخيص خدمة التوليد الصوتي — يُستدعى بسرّ CRON أو بجلسة أدمن.
 * يختبر: المفتاح، المنطقة الجغرافية، الموديل، الترميز — دون مساس
 * بأي مقال أو مخزن (يولّد جملة واحدة صغيرة ويرمي الناتج).
 */

export const maxDuration = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cronOk =
    process.env.CRON_SECRET &&
    url.searchParams.get("secret") === process.env.CRON_SECRET;

  if (!cronOk) {
    const guard = await requireSession(request);
    if (isRejected(guard)) return guard;
  }

  try {
    const { pcm, sampleRate, model } = await synthesizeChunk(
      "هذه تجربة سريعة لخدمة القراءة الصوتية الذكية في منصة كلام له لازمة.",
    );
    const encoded = encodeNarration(pcm);
    return NextResponse.json({
      ok: true,
      model,
      voice: TTS_VOICE,
      format: encoded.ext,
      mime: encoded.mime,
      bytes: encoded.bytes.length,
      durationSec: Math.round(pcmDurationSec(pcm, sampleRate) * 10) / 10,
      note: "الخدمة تعمل من هذه المنطقة — التوليد الفعلي جاهز",
    });
  } catch (err) {
    if (err instanceof TtsError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { ok: false, error: "فشل تشخيص غير متوقع — راجع سجلات الدالة" },
      { status: 500 },
    );
  }
}
