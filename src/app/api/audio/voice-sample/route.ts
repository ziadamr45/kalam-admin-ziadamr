import { NextResponse } from "next/server";
import { requireSession, isRejected } from "@/lib/guard";
import { encodeNarration } from "@/lib/audio-encode";

/*
 * مسار تشخيصي مؤقت لمقارنة أصوات التوليد — جلسة أدمن حصرًا.
 * يولّد جملة قصيرة بالصوت المطلوب ويرجعها مرمزة MP3/WAV في JSON.
 * لا يلمس أي مقال أو مهمة أو إعداد — ويُحذف فور أخذ العينات.
 */

export const maxDuration = 60;

/* الأصوات الجاهزة المعروفة في Gemini TTS — قائمة مغلقة أمانًا */
const ALLOWED = new Set([
  "Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede",
  "Callirrhoe", "Autonoe", "Enceladus", "Iapetus", "Umbriel", "Algieba",
  "Despina", "Erinome", "Algenib", "Rasalgethi", "Laomedeia", "Achernar",
  "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird", "Zubenelgenubi",
  "Vindemiatrix", "Sadachbia", "Sadaltager", "Sulafat",
]);

/* نفس تعليمات الأسلوب الحرفية في gemini-tts.ts حتى تكون المقارنة عادلة */
const STYLE_PROMPT =
  "Read the following Arabic text aloud in a calm, dignified, measured voice with warm clarity, like a contemplative narrator of thoughtful essays. Respect Arabic diacritics (tashkeel) for precise pronunciation:\n\n";

const SAMPLE_TEXT =
  "في زحمة الحديث، تبقى الكلمةُ الهادئةُ هي التي تُسمَع. نؤمن هنا أن لكل مقالٍ لازمة، فما لم يُضف شيئًا، لا يُنشر أصلًا.";

const MODELS = ["gemini-3.1-flash-tts-preview", "gemini-2.5-flash-tts"];

export async function GET(request: Request) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  const voice = new URL(request.url).searchParams.get("voice") || "";
  if (!ALLOWED.has(voice)) {
    return NextResponse.json({ ok: false, error: "صوت غير معروف" }, { status: 400 });
  }

  let lastDetail = "";
  for (const model of MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": process.env.GEMINI_API_KEY ?? "",
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: STYLE_PROMPT + SAMPLE_TEXT }] }],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
              },
            },
          }),
        },
      );
      const raw = await res.text();
      if (!res.ok) {
        lastDetail = `${model}: HTTP ${res.status}`;
        if (res.status === 429 || res.status === 401 || res.status === 403) break;
        continue; // 404 وغيره — جرب الموديل التالي
      }
      let json: {
        candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[];
      } = {};
      try {
        json = JSON.parse(raw);
      } catch {}
      const b64 = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)
        ?.inlineData?.data;
      if (!b64) {
        lastDetail = `${model}: استجابة بلا صوت`;
        continue;
      }
      const pcm = Buffer.from(b64, "base64");
      const enc = encodeNarration(pcm);
      return NextResponse.json({
        ok: true,
        voice,
        model,
        mime: enc.mime,
        seconds: Math.round((pcm.length / 2 / 24000) * 10) / 10,
        audio: enc.bytes.toString("base64"),
      });
    } catch {
      lastDetail = `${model}: فشل اتصال`;
    }
  }

  return NextResponse.json(
    { ok: false, error: "تعذر توليد العينة", detail: lastDetail },
    { status: 502 },
  );
}
