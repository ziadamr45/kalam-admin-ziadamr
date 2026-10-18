import { NextResponse } from "next/server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { requireSession, isRejected, writeAudit, getClientIp } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { destroyAudio } from "@/lib/cloudinary";
import { kickWorker, normalizeChunks } from "@/lib/audio-job";

/*
 * دورة حياة الصوت — البوابة الأمامية للمهمة الخلفية:
 *
 * POST   : بدء (أو استئناف) التوليد — يستجيب «202 Accepted» فورًا بعد حجز
 *          المهمة في Neon (audioStatus=PROCESSING + audioJobId) وينفصل عن
 *          العميل؛ المعالجة تكمل في الخلفية ولو أُغلق المتصفح أو نُشر
 *          المقال أو هُجرت الصفحة.
 * GET    : استعلام خفيف لحالة المهمة (يستخدمه Polling كل 5ث أثناء المعالجة).
 * DELETE : إزالة الصوت بالكامل — وإلغاء أي سلسلة معالجة حية فورًا
 *          (audioJobId يُمسح فتتحول كل الخطوات اليتيمة إلى لا عمليات).
 */

export const maxDuration = 60;

const STALE_MS = 4 * 60 * 1000; // لا نبض لأربع دقائق = سلسلة معلقة

/* ============================ بدء / استئناف ============================ */

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;
  const { id } = await params;

  try {
    const body = (await request.json().catch(() => ({}))) as { resume?: boolean };

    const article = await prisma.article.findUnique({
      where: { id },
      select: {
        slug: true,
        audioStatus: true,
        audioJobId: true,
        audioChunks: true,
        audioProgress: true,
        audioTotal: true,
      },
    });
    if (!article) {
      return NextResponse.json({ error: "المقال غير موجود" }, { status: 404 });
    }

    const resuming =
      body.resume === true &&
      article.audioStatus === "PROCESSING" &&
      Boolean(article.audioJobId);

    if (article.audioStatus === "PROCESSING" && !resuming) {
      return NextResponse.json(
        {
          error:
            "هناك معالجة صوتية جارية بالفعل في الخلفية — انتظر اكتمالها، أو استخدم الاستئناف إذا بدت معلقة",
        },
        { status: 409 },
      );
    }

    /* استئناف ذكي: بعد فشل سابق تبقى المقاطع المكتملة محفوظة (نصوصها
       وروابطها المؤقتة) — إعادة المحاولة تكمل من أول مقطع ناقص بدل
       حرق الحصة من الصفر؛ الوضع الجديد فقط (NONE/READY) يبدأ تخطيطًا نظيفًا */
    const savedChunks = normalizeChunks(article.audioChunks);
    const continueFromSaved =
      article.audioStatus === "FAILED" && Boolean(savedChunks);

    let jobId = article.audioJobId ?? "";
    if (!resuming && !continueFromSaved) {
      /* مهمة جديدة نظيفة — تنظيف أي أصول مؤقتة يتيمة من مهمة سابقة أولًا */
      if (savedChunks) {
        await Promise.all(
          savedChunks.filter((c) => c.publicId).map((c) => destroyAudio(c.publicId!)),
        ).catch(() => {});
      }
      jobId = `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      await prisma.article.update({
        where: { id },
        data: {
          audioStatus: "PROCESSING",
          audioJobId: jobId,
          audioError: null,
          audioChunks: Prisma.DbNull,
          audioProgress: 0,
          audioTotal: 0,
          audioUpdatedAt: new Date(),
        },
      });
    } else if (!resuming && continueFromSaved) {
      jobId = `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      await prisma.article.update({
        where: { id },
        data: {
          audioStatus: "PROCESSING",
          audioJobId: jobId,
          audioError: null,
          audioUpdatedAt: new Date(),
        },
      });
    }

    const job = { articleId: id, jobId, adminId: guard.adminId ?? null };

    /* الانفصال عن العميل: أول خطوة تُطلق بعد إرسال الرد مباشرة */
    after(() => kickWorker(job));

    await writeAudit({
      adminId: guard.adminId,
      action: resuming ? "article.audio_resumed" : "article.audio_started",
      entity: "Article",
      entityId: id,
      meta: {
        slug: article.slug,
        jobId,
        ...(continueFromSaved ? { resumedFromSaved: true, progress: article.audioProgress } : {}),
      },
      ip: getClientIp(request),
    });

    return NextResponse.json(
      {
        ok: true,
        status: "PROCESSING",
        jobId,
        message: resuming
          ? "أُعيد إطلاق سلسلة المعالجة الصوتية في الخلفية — ستُكمل من حيث توقفت"
          : continueFromSaved
            ? `أُعيد إطلاق المعالجة في الخلفية من حيث توقفت (اكتمل ${article.audioProgress} من ${article.audioTotal})`
            : "بدأت عملية المعالجة الصوتية في الخلفية، يمكنك حفظ المقال أو نشره أو مغادرة الصفحة بأمان",
      },
      { status: 202 },
    );
  } catch {
    return NextResponse.json({ error: "تعذر بدء التوليد الصوتي — أعد المحاولة" }, { status: 500 });
  }
}

/* ============================ استعلام الحالة ============================ */

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;
  const { id } = await params;

  try {
    const article = await prisma.article.findUnique({
      where: { id },
      select: {
        audioStatus: true,
        audioUrl: true,
        audioDurationSec: true,
        audioProgress: true,
        audioTotal: true,
        audioError: true,
        audioUpdatedAt: true,
        audioWords: true,
        audioJobId: true,
      },
    });
    if (!article) {
      return NextResponse.json({ error: "المقال غير موجود" }, { status: 404 });
    }

    const stale =
      article.audioStatus === "PROCESSING" &&
      Boolean(article.audioUpdatedAt) &&
      Date.now() - article.audioUpdatedAt!.getTime() > STALE_MS;

    /* شفاء ذاتي: سلسلة معلقة (لا نبض منذ دقائق) تُفيض من هنا مباشرة —
       الاستعلام الخفيف نفسه يعيد إطلاق العامل فلا انتظار تدخل بشري،
       وحارس audioJobId يجعل الإطلاق آمنًا حتى مع تكرار الاستعلام */
    if (stale && article.audioJobId) {
      const job = { articleId: id, jobId: article.audioJobId, adminId: null };
      after(() => {
        void kickWorker(job);
      });
    }

    return NextResponse.json({
      audioStatus: article.audioStatus,
      audioUrl: article.audioUrl,
      durationSec: article.audioDurationSec,
      done: article.audioProgress,
      total: article.audioTotal,
      error: article.audioError,
      wordsCount: Array.isArray(article.audioWords) ? article.audioWords.length : 0,
      stale: Boolean(stale),
    });
  } catch {
    return NextResponse.json({ error: "تعذر جلب حالة الصوت" }, { status: 500 });
  }
}

/* ============================ إزالة / إلغاء ============================ */

/** إزالة الصوت من المقال بالكامل — مع تنظيف الأصل السحابي وإقتال السلسلة */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;
  const { id } = await params;

  try {
    const article = await prisma.article.findUnique({
      where: { id },
      select: { slug: true, audioPublicId: true, audioStatus: true, audioChunks: true },
    });
    if (!article) {
      return NextResponse.json({ error: "المقال غير موجود" }, { status: 404 });
    }

    /* إن كانت معالجة حيّة فهذه النقرة «إيقاف وإزالة»: مسح audioJobId
       يقتل السلسلة فورًا — كل الخطوات اليتيمة تصطدم بحارس المهمة وتنتهي */
    const orphanTemps = normalizeChunks(article.audioChunks);
    if (orphanTemps) {
      await Promise.all(
        orphanTemps.filter((c) => c.publicId).map((c) => destroyAudio(c.publicId!)),
      ).catch(() => {});
    }

    await prisma.article.update({
      where: { id },
      data: {
        audioUrl: null,
        audioPublicId: null,
        audioDurationSec: null,
        audioWords: Prisma.DbNull,
        audioVoice: null,
        audioGeneratedAt: null,
        audioStatus: "NONE",
        audioProgress: 0,
        audioTotal: 0,
        audioChunks: Prisma.DbNull,
        audioError: null,
        audioJobId: null,
        audioUpdatedAt: null,
      },
    });

    if (article.audioPublicId) {
      await destroyAudio(article.audioPublicId);
    }

    revalidatePath(`/article/${article.slug}`);

    await writeAudit({
      adminId: guard.adminId,
      action: "article.audio_removed",
      entity: "Article",
      entityId: id,
      meta: { slug: article.slug, wasProcessing: article.audioStatus === "PROCESSING" },
      ip: getClientIp(request),
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "تعذر إزالة الصوت — أعد المحاولة" }, { status: 500 });
  }
}
