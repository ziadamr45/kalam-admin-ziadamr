/**
 * عميل الاستدلال العام Gemini — نصوص وصور (يعمل حصريًا على السيرفر).
 *
 * - النماذج المعتمدة رسميًا أولًا، تليها بدائل احتياطية إن تقاعد الاسم أو لم يتوفر للمفتاح.
 * - إعادة محاولة بتراجع أُسّي على 429/5xx، وتخطٍّ فوري للموديل التالي على 404.
 * - رسائل عربية واضحة لأشهر الأعطال (الحظر الجغرافي، المفتاح، الحصة).
 */

const API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models";

/* موديلات النص — المعتمد حصريًا gemini-3.5-flash-lite ثم البدائل الاحتياطية */
const CHAT_CANDIDATES = [
  process.env.GEMINI_CHAT_MODEL,
  "gemini-3.5-flash-lite",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
].filter(Boolean) as string[];

/* موديلات الصور — المعتمد حصريًا gemini-3.1-flash-lite-image (Nano Banana 2 Lite) */
const IMAGE_CANDIDATES = [
  process.env.GEMINI_IMAGE_MODEL,
  "gemini-3.1-flash-lite-image",
  "gemini-2.5-flash-image",
  "gemini-2.5-flash-image-preview",
].filter(Boolean) as string[];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class GeminiError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

function friendlyError(status: number, body: string): string {
  if (body.includes("location is not supported") || body.includes("FAILED_PRECONDITION")) {
    return "خدمة الذكاء الاصطناعي غير متاحة من منطقة هذا الخادم — تأكد من نشر الدوال في منطقة أوروبية مدعومة (fra1) كما في vercel.json";
  }
  if (status === 401 || status === 403) {
    return "مفتاح Gemini غير مصرّح — تحقق من GEMINI_API_KEY في متغيرات البيئة";
  }
  if (status === 429) {
    return "تجاوزتَ حصة الاستخدام مؤقتًا — انتظر قليلًا ثم أعد المحاولة";
  }
  if (status === 404) {
    return "النموذج المطلوب غير متاح لهذا المفتاح حاليًا";
  }
  return `تعذر الاتصال بخدمة الذكاء الاصطناعي (${status}) — أعد المحاولة بعد لحظات`;
}

type GeminiResponse = {
  candidates?: {
    content?: {
      parts?: { text?: string; inlineData?: { mimeType?: string; data?: string } }[];
    };
    finishReason?: string;
  }[];
  error?: { code?: number; message?: string; status?: string };
};

export function geminiConfigured(): boolean {
  return Boolean(
    process.env.GEMINI_API_KEY &&
      !process.env.GEMINI_API_KEY.startsWith("PLACEHOLDER"),
  );
}

async function callModel(
  model: string,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<GeminiResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_ROOT}/${model}:generateContent`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY ?? "",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const raw = await res.text();
    let json: GeminiResponse = {};
    try {
      json = JSON.parse(raw) as GeminiResponse;
    } catch {}

    if (!res.ok) {
      throw new GeminiError(friendlyError(res.status, raw), res.status);
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

/** استدعاء عام مع تراجع أُسّي وبدائل موديلات — يثبّت الموديل العامل لكل نوع */
async function withCandidates(
  candidates: string[],
  kind: "chat" | "image",
  buildBody: (model: string) => Record<string, unknown>,
  timeoutMs: number,
): Promise<GeminiResponse> {
  if (!geminiConfigured()) {
    throw new GeminiError(
      "خدمة الذكاء الاصطناعي غير مهيأة — أضف GEMINI_API_KEY إلى متغيرات البيئة",
      503,
    );
  }

  const memoKey = `__working_${kind}`;
  const memo = (globalThis as Record<string, unknown>)[memoKey] as string | undefined;
  const models = memo ? [memo, ...candidates.filter((m) => m !== memo)] : candidates;
  let lastErr: unknown = null;

  for (const model of models) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const json = await callModel(model, buildBody(model), timeoutMs);
        (globalThis as Record<string, unknown>)[memoKey] = model;
        return json;
      } catch (err) {
        lastErr = err;
        const status = err instanceof GeminiError ? err.status : 0;
        if (status === 404) break; // جرّب الموديل التالي فورًا
        if (status === 400 || status === 401 || status === 403) throw err;
        if (attempt < 3) await sleep(900 * Math.pow(2, attempt - 1) + Math.random() * 300);
      }
    }
  }

  if (lastErr instanceof GeminiError) throw lastErr;
  throw new GeminiError("تعذر الاتصال بخدمة الذكاء الاصطناعي — تحقق من الشبكة وأعد المحاولة", 502);
}

/* ==================== النصوص — النقاش والرقابة ==================== */

export type ChatTurn = { role: "user" | "model"; text: string };

export async function geminiChat(opts: {
  system?: string;
  turns: ChatTurn[];
  maxOutputTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
}): Promise<string> {
  const json = await withCandidates(
    CHAT_CANDIDATES,
    "chat",
    () => ({
      contents: opts.turns.map((t) => ({
        role: t.role,
        parts: [{ text: t.text }],
      })),
      ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
      generationConfig: {
        maxOutputTokens: opts.maxOutputTokens ?? 800,
        temperature: opts.temperature ?? 0.75,
        ...(opts.jsonMode ? { responseMimeType: "application/json" } : {}),
      },
    }),
    30_000,
  );

  const text = json.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? "")
    .join("")
    .trim();

  if (!text) {
    throw new GeminiError("وصلت استجابة فارغة من النموذج — أعد المحاولة", 502);
  }
  return text;
}

/* ==================== الصور — مولّد الأغلفة ==================== */

export async function geminiImage(prompt: string): Promise<{ base64: string; mimeType: string }> {
  /* بعض الإصدارات ترفض ["IMAGE"] وحدها — نبدأ بها ثم نتراجع إلى ["TEXT","IMAGE"] */
  const attempts: string[][] = [["IMAGE"], ["TEXT", "IMAGE"]];
  let lastErr: unknown = null;

  for (const modalities of attempts) {
    try {
      const json = await withCandidates(
        IMAGE_CANDIDATES,
        "image",
        () => ({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: modalities },
        }),
        55_000,
      );
      const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
      if (part?.inlineData?.data) {
        return { base64: part.inlineData.data, mimeType: part.inlineData.mimeType ?? "image/png" };
      }
      lastErr = new GeminiError("وصلت استجابة التوليد بلا بيانات صورية — أعد المحاولة", 502);
    } catch (err) {
      lastErr = err;
      const status = err instanceof GeminiError ? err.status : 0;
      if (status !== 400) throw err; // 400 قد يعني رفض صيغة المودالات — جرّب التالية
    }
  }

  if (lastErr instanceof GeminiError) throw lastErr;
  throw new GeminiError("تعذر توليد الصورة — أعد المحاولة بعد لحظات", 502);
}
