import { NextResponse } from "next/server";
import { after } from "next/server";
import { runAudioJobStep, kickWorker, type AudioJob } from "@/lib/audio-job";
import { writeAudit } from "@/lib/guard";

/*
 * العامل الخلفي الذاتي — قلب المعمارية غير المتزامنة.
 * لا جلسة ولا كوكيز هنا: الحماية برأس x-worker-secret (سرّ داخلي).
 * كل استدعاء ينفّذ «خطوة واحدة» (مقطع واحد أو ختم) ثم يعيد إطلاق
 * السلسلة عبر after() بإطلاق نداء عامل جديد — هكذا تعيش المهمة
 * وتكمل حتى لو أغلق الأدمن المتصفح أو حفظ المقال أو نشره ومغادر.
 */

export const maxDuration = 60;

export async function POST(request: Request) {
  const secret = request.headers.get("x-worker-secret");
  if (!process.env.REVALIDATE_SECRET || secret !== process.env.REVALIDATE_SECRET) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Partial<AudioJob>;
  if (!body.articleId || !body.jobId) {
    return NextResponse.json({ error: "حمولة ناقصة" }, { status: 400 });
  }
  const job: AudioJob = {
    articleId: String(body.articleId),
    jobId: String(body.jobId),
    adminId: body.adminId ?? null,
  };

  /* أثر تشخيصي: هل وصل النداء الذاتي إلى العامل أصلًا؟ */
  await writeAudit({ adminId: null, action: "audio_worker_entry", entity: "Article", entityId: job.articleId, meta: { jobId: job.jobId } });

  let needsNext = false;
  try {
    needsNext = await runAudioJobStep(job);
    /* أثر تشخيصي: نتيجة الخطوة داخل هذه الاستدعاء */
    await writeAudit({
      adminId: null,
      action: "audio_step_result",
      entity: "Article",
      entityId: job.articleId,
      meta: { jobId: job.jobId, needsNext },
    });
  } catch (err) {
    /* المهمة تدير فشلها داخليًا — أي استثناء عابر هنا لا يقتل السلسلة إلا
       إذا كانت الكتابة الأخيرة قد فشلت، ووكشف التعليق (stale) صمام أمان */
    console.error("[audio-worker] step error:", err);
    needsNext = false;
  }

  if (needsNext) {
    after(() => kickWorker(job));
  }

  return NextResponse.json({ ok: true, needsNext });
}
