/**
 * محرّك التوليد الصوتي الخلفي — مهمة غير متزامنة تعيش في الخادم لا في المتصفح.
 *
 * المعمارية (Self-chaining Worker):
 * 1) زر التوليد يستجيب فورًا «202 Accepted» ويحجز المهمة في Neon
 *    (audioStatus=PROCESSING + audioJobId) ثم يطلق أول خطوة عبر after().
 * 2) كل استدعاء لدالة السحابة يولّد «مقطعًا واحدًا» فقط: TTS → ترميز MP3
 *    → رفع مؤقت إلى Cloudinary → حفظ التقدم في Neon → جدولة الخطوة التالية
 *    بإطلاق نداء جديد للعامل الذاتي. لا شيء يعتمد على بقاء العميل.
 * 3) فاصل أمان إجباري 12ث بين مقطعين متتاليين، وتراجع أُسّي 20ث×المحاولة
 *    عند 429 — كلاهما مخزّن في سجل المقطع (notBefore) لا في ذاكرة العملية،
 *    فلا تنكسر السلسلة إذا استُبدلت الدالة بين الخطوات.
 * 4) عند اكتمال كل المقاطع: تنزيلها ودمجها في ملف واحد، رفعه النهائي إلى
 *    Cloudinary، تحديث audioUrl + audioStatus=READY، تنظيف المؤقتات،
 *    وإعادة توليد صفحة المقال في المنصة العامة فورًا.
 *
 * حارس التسابق: كل كتابة تمر عبر audioJobId في شرط الـ where — أي خطوة
 * يتيمة من مهمة قديمة (أُلغيت أو استُبدلت) تصطدم بـ P2025 وتنتهي بصمت.
 */

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { synthesizeChunk, TtsError, TTS_VOICE } from "@/lib/gemini-tts";
import { encodeNarration, pcmDurationSec } from "@/lib/audio-encode";
import {
  buildSegmentPlan,
  spokenSource,
  allocateWordTimings,
} from "@/lib/audio-narration";
import { uploadAudio, destroyAudio } from "@/lib/cloudinary";
import {
  revalidatePublicPaths,
  articleRevalidatePaths,
} from "@/lib/revalidate";
import { writeAudit } from "@/lib/guard";

/* ============================ الثوابت ============================ */

/** فاصل أمان إجباري بين مقطع ومقطع — يمنع الوصول لحد الطلبات بالدقيقة */
const GAP_MS = 12_000;
/** قاعدة التراجع الأُسّي عند 429: 20ث × رقم المحاولة (20/40/60) */
const BACKOFF_BASE_MS = 20_000;
/** أعلى عدد إعادات للمقطع الواحد قبل إعلان الفشل النهائي */
const MAX_CHUNK_RETRIES = 3;
/** أطول شريحة نوم داخل استدعاء واحد — تحمي مهلة الدالة السحابية (60ث) */
const MAX_SLEEP_MS = 15_000;
/** أعلى مقاطع للمهمة الواحدة (≈ 40 دقيقة صوت بالمقاطع الكبيرة) */
const MAX_SEGMENTS = 60;
/** أعلى كلمات مزامنة محفوظة */
const MAX_WORDS = 8000;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/* ============================ الأنواع ============================ */

export type AudioJob = { articleId: string; jobId: string; adminId?: string | null };

type ChunkTiming = { w: string; s: number; e: number };

type ChunkRec = {
  text: string;
  words: string[];
  url: string | null;
  publicId: string | null;
  durationSec: number;
  timings: ChunkTiming[];
  attempts: number;
  /** طابع زمني: لا تحاول قبل هذه اللحظة (فاصل الأمان/التراجع الأُسّي) */
  notBefore: number;
  mime: string;
};

function normalizeChunks(raw: unknown): ChunkRec[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  return raw.map((c: Partial<ChunkRec> | null) => ({
    text: String(c?.text ?? ""),
    words: Array.isArray(c?.words) ? c!.words!.map(String) : [],
    url: typeof c?.url === "string" ? c.url : null,
    publicId: typeof c?.publicId === "string" ? c.publicId : null,
    durationSec: Number(c?.durationSec ?? 0) || 0,
    timings: Array.isArray(c?.timings) ? (c!.timings as ChunkTiming[]) : [],
    attempts: Number(c?.attempts ?? 0) || 0,
    notBefore: Number(c?.notBefore ?? 0) || 0,
    mime: typeof c?.mime === "string" ? c.mime : "audio/mpeg",
  }));
}

/* حارس تنفيذ متوازٍ داخل نفس العملية (نداءان لنفس المقال في آن واحد) */
const inFlight = new Set<string>();

/* ============================ الكتابة الآمنة ============================ */

/**
 * كتابة مشروطة بمعرف المهمة — إن استُبدلت المهمة (إلغاء/توليد جديد)
 * يصطدم الشرط بـ P2025 وتعود false فتنتهي الخطوة اليتيمة بصمت فورًا.
 */
async function touchJob(
  articleId: string,
  jobId: string,
  data?: Prisma.ArticleUpdateInput,
): Promise<boolean> {
  try {
    await prisma.article.update({
      where: { id: articleId, audioJobId: jobId },
      data: { audioUpdatedAt: new Date(), ...(data ?? {}) },
    });
    return true;
  } catch {
    return false;
  }
}

/* ============================ إطلاق العامل ============================ */

/**
 * عنوان تطبيق اللوحة نفسه — نداء العامل الذاتي يجب أن يعود إلى هذا التطبيق
 * لا إلى المنصة العامة (PUBLIC_URL هناك يشير للمنصة القارئة).
 * ملاحظة حرجة: رابط النشر الداخلي VERCEL_URL محمي بـ SSO (Deployment
 * Protection) فيسقط كل نداء داخلي بـ 401 — لذا النطاق العام للوحة هو
 * القاعدة، مع باب ADMIN_URL لأي نطاق مخصص مستقبلًا.
 */
export function workerBase(): string {
  if (process.env.ADMIN_URL) return process.env.ADMIN_URL;
  return "https://kalam-admin-ziadamr.vercel.app";
}

/** نداء العامل الذاتي الأول (من مسار البدء) — العامل يرد فورًا ويعالج داخل after */
export async function kickWorker(job: AudioJob): Promise<void> {
  const base = workerBase();
  /* أثر تشخيصي مؤقت: رصد محاولة الإطلاق الذاتي ونتيجتها في سجل التدقيق */
  const breadcrumb = async (action: string, meta: Record<string, unknown>) => {
    await prisma.auditLog
      .create({
        data: {
          adminId: null,
          action,
          entity: "Article",
          entityId: job.articleId,
          meta: meta as never,
        },
      })
      .catch(() => {});
  };
  await breadcrumb("audio_kick", { base, jobId: job.jobId });
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 55_000);
    const res = await fetch(`${base}/api/audio/worker`, {
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
      signal: controller.signal,
    });
    clearTimeout(timer);
    await breadcrumb("audio_kick_done", { base, status: res.status, jobId: job.jobId });
  } catch (err) {
    await breadcrumb("audio_kick_error", {
      base,
      jobId: job.jobId,
      error: err instanceof Error ? err.message : "unknown",
    });
    /* شبكة عابرة؟ حماية ذاتية: نفّذ الخطوة داخل نفس السياق —
       حارس audioJobId يجعل الخطوة آمنة حتى مع تداخل المهمات */
    await runAudioJobStep(job).catch(() => {});
  }
}

/* ============================ خطوة العامل ============================ */

/**
 * خطوة واحدة من المهمة: مقطع واحد أو ختم نهائي.
 * العائد true يعني «السلسلة حيّة — أطلق الخطوة التالية».
 */
export async function runAudioJobStep(job: AudioJob): Promise<boolean> {
  const { articleId, jobId } = job;
  if (inFlight.has(articleId)) return true;
  inFlight.add(articleId);
  try {
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      select: {
        id: true,
        slug: true,
        audioStatus: true,
        audioJobId: true,
        audioChunks: true,
        content: true,
        contentWithTashkeel: true,
      },
    });
    if (!article || article.audioStatus !== "PROCESSING" || article.audioJobId !== jobId) {
      return false; // مهمة أُلغيت أو استُبدلت — لا شيء يفعلها
    }

    /* الخطوة الأولى: بناء خطة المقاطع الكبيرة (800–1200 حرف) وتثبيتها في Neon
       حتى يظل التقسيم مستقرًا ولو عدّل الأدمن النص أثناء المعالجة */
    let chunks = normalizeChunks(article.audioChunks);
    if (!chunks) {
      const source = spokenSource(article.content, article.contentWithTashkeel);
      const plan = buildSegmentPlan(source);
      if (plan.length === 0) {
        await failAudioJob(articleId, jobId, "لا يوجد نص صالح للقراءة الصوتية في هذا المقال");
        return false;
      }
      if (plan.length > MAX_SEGMENTS) {
        await failAudioJob(
          articleId,
          jobId,
          `المقال أطول من حد التوليد (${MAX_SEGMENTS} مقطعًا) — قسّمه أو اختصره`,
        );
        return false;
      }
      chunks = plan.map((p) => ({
        text: p.text,
        words: p.words,
        url: null,
        publicId: null,
        durationSec: 0,
        timings: [],
        attempts: 0,
        notBefore: 0,
        mime: "audio/mpeg",
      }));
      const ok = await touchJob(articleId, jobId, {
        audioChunks: chunks as never,
        audioTotal: chunks.length,
        audioProgress: 0,
      });
      return ok;
    }

    const idx = chunks.findIndex((c) => !c.url);
    if (idx === -1) {
      await finalizeAudioJob(job, chunks);
      return false;
    }

    const rec = chunks[idx];

    /* بوابة الانتظار — فاصل الأمان يعيش في سجل المقطع لا في الذاكرة:
       12ث بين المقاطع المتتالية، أو تراجع أُسّي 20ث×المحاولة بعد 429،
       مقسّمًا شرائح ≤15ث حتى لا تُقتل الدالة على مهلتها */
    const waitMs = rec.notBefore - Date.now();
    if (waitMs > 0) {
      await delay(Math.min(waitMs, MAX_SLEEP_MS));
      if (Date.now() < rec.notBefore) {
        const alive = await touchJob(articleId, jobId); // نبض حيوية
        return alive; // الدعوة القادمة تكمل شريحة الانتظار
      }
    }

    const offset = chunks.slice(0, idx).reduce((a, c) => a + c.durationSec, 0);

    try {
      /* attempts: 2 — ضغط داخلي مقتصد؛ التراجع الصبور على 429 يعيش فوق
         سجل المقطع عبر الاستدعاءات (20ث ثم 40ث ثم 60ث) لا داخل هذه الدالة */
      const { pcm, sampleRate } = await synthesizeChunk(rec.text, { attempts: 2 });
      const duration = Math.round(pcmDurationSec(pcm, sampleRate) * 100) / 100;
      const encoded = encodeNarration(pcm);
      const timings = allocateWordTimings(rec.words, offset, duration);

      const safeSlug =
        (article.slug || "article").replace(/[^a-z0-9-_]/gi, "-").slice(0, 60) || "article";
      const uploaded = await uploadAudio(
        new Blob([new Uint8Array(encoded.bytes)], { type: encoded.mime }),
        `${safeSlug}-s${idx}.${encoded.ext}`,
        "kalam/audio-tmp",
        `kalam/audio-tmp/${safeSlug}-${jobId}-s${idx}`,
      );

      rec.url = uploaded.url;
      rec.publicId = uploaded.publicId;
      rec.durationSec = duration;
      rec.timings = timings;
      rec.attempts = 0;
      rec.mime = encoded.mime;
      /* اكتمل المقطع — ضع فاصل الأمان 12ث على المقطع التالي */
      if (chunks[idx + 1]) chunks[idx + 1].notBefore = Date.now() + GAP_MS;

      const ok = await touchJob(articleId, jobId, {
        audioChunks: chunks as never,
        audioProgress: chunks.filter((c) => c.url).length,
        audioError: null,
      });
      return ok;
    } catch (err) {
      const status = err instanceof TtsError ? err.status : 0;
      /* 503/401/403/400: أعطال قاطعة لا فائدة من إعادتها */
      const fatal = status === 503 || status === 401 || status === 403 || status === 400;
      const retryable = !fatal && (status === 429 || status === 0 || status >= 500);
      if (retryable && rec.attempts < MAX_CHUNK_RETRIES) {
        rec.attempts += 1;
        rec.notBefore = Date.now() + BACKOFF_BASE_MS * rec.attempts;
        const ok = await touchJob(articleId, jobId, {
          audioChunks: chunks as never,
          audioError: `المقطع ${idx + 1}: ${
            status === 429 ? "تجاوز حد الطلبات (429)" : "ضغط مؤقت على الخدمة"
          } — إعادة تلقائية بعد ${Math.max(1, Math.round((rec.notBefore - Date.now()) / 1000))}ث (محاولة ${rec.attempts}/${MAX_CHUNK_RETRIES})`,
        });
        return ok;
      }
      const msg = err instanceof Error ? err.message : "تعذر توليد الصوت — أعد المحاولة";
      await failAudioJob(articleId, jobId, msg);
      return false;
    }
  } finally {
    inFlight.delete(articleId);
  }
}

/* ============================ الختم النهائي ============================ */

async function finalizeAudioJob(job: AudioJob, chunks: ChunkRec[]): Promise<void> {
  const { articleId, jobId } = job;
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    select: { slug: true, audioPublicId: true, audioStatus: true, audioJobId: true },
  });
  if (!article || article.audioStatus !== "PROCESSING" || article.audioJobId !== jobId) return;
  if (chunks.length === 0 || chunks.some((c) => !c.url)) {
    await failAudioJob(articleId, jobId, "أحد المقاطع الصوتية غير مكتمل — أعد المحاولة");
    return;
  }

  /* تنزيل المقاطع ودمجها في ملف واحد متجانس الصيغة */
  const buffers: Buffer[] = [];
  const words: ChunkTiming[] = [];
  let total = 0;
  for (const c of chunks) {
    const res = await fetch(c.url!);
    if (!res.ok) {
      await failAudioJob(articleId, jobId, "تعذر تنزيل مقطع مؤقت من التخزين السحابي — أعد المحاولة");
      return;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) {
      await failAudioJob(articleId, jobId, "وصل مقطع صوتي فارغ — أعد المحاولة");
      return;
    }
    buffers.push(buf);
    for (const t of c.timings) {
      if (words.length >= MAX_WORDS) break;
      words.push(t);
    }
    total += c.durationSec;
  }
  const merged = Buffer.concat(buffers);
  if (merged.length < 1024) {
    await failAudioJob(articleId, jobId, "الصوت المولّد فارغ أو تالف — أعد المحاولة");
    return;
  }

  const safeSlug =
    (article.slug || "article").replace(/[^a-z0-9-_]/gi, "-").slice(0, 60) || "article";
  const mime = chunks[0]?.mime === "audio/wav" ? "audio/wav" : "audio/mpeg";
  const ext = mime === "audio/wav" ? "wav" : "mp3";
  const uploaded = await uploadAudio(
    new Blob([new Uint8Array(merged)], { type: mime }),
    `${safeSlug}.${ext}`,
    "kalam/audio",
    `kalam/audio/${safeSlug}-${Date.now().toString(36)}`,
  );

  /* استبدال نظيف للصوت القديم إن وُجد */
  if (article.audioPublicId && article.audioPublicId !== uploaded.publicId) {
    await destroyAudio(article.audioPublicId);
  }
  /* تنظيف كل الأصول المؤقتة لهذه المهمة */
  await Promise.all(
    chunks.filter((c) => c.publicId).map((c) => destroyAudio(c.publicId!)),
  );

  const ok = await touchJob(articleId, jobId, {
    audioUrl: uploaded.url,
    audioPublicId: uploaded.publicId,
    audioDurationSec: Math.round(total * 100) / 100,
    audioWords: words as never,
    audioVoice: TTS_VOICE,
    audioGeneratedAt: new Date(),
    audioStatus: "READY",
    audioError: null,
    audioJobId: null,
    audioChunks: Prisma.DbNull,
    audioProgress: chunks.length,
    audioTotal: chunks.length,
  });
  if (!ok) return;

  /* الصوت حي لحظةً: كاش اللوحة + إعادة توليد صفحة المقال في المنصة العامة */
  revalidatePath(`/article/${article.slug}`);
  await revalidatePublicPaths(articleRevalidatePaths({ slug: article.slug }));

  await writeAudit({
    adminId: job.adminId ?? null,
    action: "article.audio_generated",
    entity: "Article",
    entityId: articleId,
    meta: {
      slug: article.slug,
      durationSec: Math.round(total * 100) / 100,
      words: words.length,
      bytes: uploaded.bytes,
      mode: "background",
    },
  });
}

/* ============================ إعلان الفشل ============================ */

async function failAudioJob(articleId: string, jobId: string, message: string): Promise<void> {
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    select: { audioJobId: true, audioChunks: true },
  });
  if (!article || article.audioJobId !== jobId) return; // مهمة أحدث سيطرت — لا مساس

  /* تنظيف الأصول المؤقتة لهذه المهمة تحديدًا */
  const chunks = normalizeChunks(article.audioChunks) ?? [];
  await Promise.all(
    chunks.filter((c) => c.publicId).map((c) => destroyAudio(c.publicId!)),
  );

  await prisma.article
    .update({
      where: { id: articleId },
      data: {
        audioStatus: "FAILED",
        audioError: message.slice(0, 300),
        audioJobId: null,
        audioChunks: Prisma.DbNull,
        audioProgress: 0,
        audioUpdatedAt: new Date(),
      },
    })
    .catch(() => {});

  await writeAudit({
    adminId: null,
    action: "article.audio_failed",
    entity: "Article",
    entityId: articleId,
    meta: { message: message.slice(0, 300) },
  });
}
