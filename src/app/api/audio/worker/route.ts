import { NextResponse } from "next/server";
import { after } from "next/server";
import { runAudioJobStep, workerBase, type AudioJob } from "@/lib/audio-job";
import { writeAudit } from "@/lib/guard";

/*
 * العامل الخلفي الذاتي — قلب المعمارية غير المتزامنة.
 * لا جلسة ولا كوكيز هنا: الحماية برأس x-worker-secret (سرّ داخلي).
 *
 * دورة الاستدعاء الواحد:
 * 1) يرد فورًا «200 OK» بمجرد التحقق من الحمولة.
 * 2) تنفّذ الخطوة (مقطع واحد أو ختم) داخل after() — بذلك تحصل على كامل
 *    مهلة الدالة (maxDuration) بدل اقتناصها من زمن الاستجابة.
 * 3) عند العائد «اكمل السلسلة» يطلق نداء عامل جديد بتأكيد الإرسال فقط
 *    (لا انتظار للاكتمال) — فتعيش المهمة وتكمل ولو أغلق الأدمن المتصفح
 *    أو حفظ المقال أو نشره ومغادر الصفحة تمامًا.
 */

export const maxDuration = 300;

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

  after(async () => {
    let needsNext = false;
    try {
      needsNext = await runAudioJobStep(job);
    } catch (err) {
      /* المهمة تدير فشلها داخليًا — الاستثناء العابر هنا لا يقتل السلسلة
         إلا إذا فشلت الكتابة الأخيرة، ووكشف التعليق (stale) صمام أمان */
      console.error("[audio-worker] step error:", err);
      needsNext = false;
    }

    if (needsNext) {
      /* إطلاق الخطوة التالية — تأكيد الإرسال يكفي: العامل الجديد يرد فورًا
         ويعالج داخل after الخاص به بكامل المهلة */
      try {
        const kick = fetch(`${workerBase()}/api/audio/worker`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-worker-secret": process.env.REVALIDATE_SECRET ?? "",
          },
          body: JSON.stringify({
            articleId: job.articleId,
            jobId: job.jobId,
            adminId: job.adminId ?? null,
          }),
        });
        kick.catch(() => {});
        await Promise.race([kick, new Promise((r) => setTimeout(r, 2500))]);
      } catch {
        /* إن فشل الإرسال تبقى المهمة PROCESSING وكشف التعليق (stale)
           في مسار الحالة يسمح للأدمن بإعادة إطلاق السلسلة بضغطة */
      }
    }
  });

  return NextResponse.json({ ok: true });
}
