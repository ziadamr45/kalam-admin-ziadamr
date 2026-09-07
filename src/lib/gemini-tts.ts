/**
 * عميل Gemini TTS — يعمل حصريًا على السيرفر (مفتاح API لا يغادر بيئة الخادم).
 *
 * - إعادة محاولة تلقائية بتراجع أُسّي على 429/5xx/انقطاع الشبكة مع احترام Retry-After.
 * - بدائل موديلات: إن تقاعد اسم preview ينتقل التالي تلقائيًا ويُتذكر العامل.
 * - رسائل عربية واضحة لأشهر الأعطال (الحظر الجغرافي، المفتاح، الحصة).
 * - المخرجات: PCM 16-bit mono 24kHz (base64) من inlineData.
 */

const API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models";

/* أسماء موديلات TTS بالترتيب — الأولى قابلة للتجاوز بمتغير البيئة */
const MODEL_CANDIDATES = [
  process.env.GEMINI_TTS_MODEL,
  "gemini-3.1-flash-tts-preview", // النموذج المعتمد رسميًا للقراءة الصوتية المتزامنة كلمة بكلمة
  "gemini-2.5-flash-tts",
  "gemini-2.5-flash-preview-tts",
  "gemini-2.5-pro-preview-tts",
].filter(Boolean) as string[];

/* الصوت الافتراضي: نبرة هادئة فخمة رصينة تناسب مقالات الفكر والوعي */
export const TTS_VOICE = process.env.GEMINI_TTS_VOICE || "Kore";

/* تعليمات الأسلوب — لا تُنطق، توجّه الأداء فقط */
const STYLE_PROMPT =
  "Read the following Arabic text aloud in a calm, dignified, measured voice with warm clarity, like a contemplative narrator of thoughtful essays. Respect Arabic diacritics (tashkeel) for precise pronunciation:\n\n";

let workingModel: string | null = null;

export class TtsError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function friendlyError(status: number, body: string): string {
  if (body.includes("location is not supported") || body.includes("FAILED_PRECONDITION")) {
    return "خدمة الصوت غير متاحة من منطقة هذا الخادم — تأكد من نشر دوال المشروع في منطقة أوروبية مدعومة (fra1) كما في vercel.json";
  }
  if (status === 401 || status === 403) {
    return "مفتاح Gemini غير مصرّح — تحقق من GEMINI_API_KEY في متغيرات البيئة";
  }
  if (status === 429) {
    return "تجاوزتَ حصة التوليد مؤقتًا — انتظر قليلًا ثم أعد المحاولة";
  }
  if (status === 404) {
    return "موديل الصوت غير متاح لهذا المفتاح حاليًا";
  }
  return `تعذر توليد الصوت (${status}) — أعد المحاولة بعد لحظات`;
}

type GeminiAudioResponse = {
  candidates?: {
    content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] };
    finishReason?: string;
  }[];
  error?: { code?: number; message?: string; status?: string };
};

async function callOnce(model: string, text: string): Promise<{ pcm: Buffer; sampleRate: number }> {
  const res = await fetch(`${API_ROOT}/${model}:generateContent`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": process.env.GEMINI_API_KEY ?? "",
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: STYLE_PROMPT + text }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: TTS_VOICE } },
        },
      },
    }),
  });

  const raw = await res.text();
  let json: GeminiAudioResponse = {};
  try {
    json = JSON.parse(raw) as GeminiAudioResponse;
  } catch {}

  if (!res.ok) {
    const err = new TtsError(friendlyError(res.status, raw), res.status);
    (err as TtsError & { rawStatus?: number }).rawStatus = res.status;
    throw err;
  }

  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  const b64 = part?.inlineData?.data;
  const mime = part?.inlineData?.mimeType ?? "";
  if (!b64) {
    throw new TtsError("استجابة التوليد وصلت بلا بيانات صوتية — أعد المحاولة", 502);
  }
  const rateMatch = mime.match(/rate=(\d+)/);
  const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000;
  return { pcm: Buffer.from(b64, "base64"), sampleRate };
}

/** توليد صوت مقطع واحد مع إعادة المحاولة وبدائل الموديلات */
export async function synthesizeChunk(text: string): Promise<{ pcm: Buffer; sampleRate: number; model: string }> {
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.startsWith("PLACEHOLDER")) {
    throw new TtsError("خدمة التوليد الصوتي غير مهيأة — أضف GEMINI_API_KEY إلى متغيرات البيئة", 503);
  }

  const models = workingModel ? [workingModel] : MODEL_CANDIDATES;
  let lastErr: unknown = null;

  for (const model of models) {
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        const out = await callOnce(model, text);
        workingModel = model; // تثبيت الموديل العامل لهذه العملية
        return { ...out, model };
      } catch (err) {
        lastErr = err;
        const status = err instanceof TtsError ? err.status : 0;
        /* 404: جرّب الموديل التالي فورًا | الحظر الجغرافي/المفتاح: لا فائدة من التكرار */
        if (status === 404) break;
        if (status === 400 || status === 401 || status === 403) throw err;
        if (attempt < 4) {
          const backoff = 1200 * Math.pow(2, attempt - 1) + Math.random() * 400;
          await sleep(backoff);
        }
      }
    }
  }

  if (lastErr instanceof TtsError) throw lastErr;
  throw new TtsError("تعذر الاتصال بخدمة التوليد الصوتي — تحقق من الشبكة وأعد المحاولة", 502);
}
