import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, isRejected, writeAudit, getClientIp } from "@/lib/guard";
import { generateCoverArt, translateCoverPromptToEnglish, geminiChat, geminiConfigured, GeminiError, type CoverAspect } from "@/lib/gemini-inference";
import { uploadImage, cloudinaryConfigured } from "@/lib/cloudinary";
import { buildArtPrompt, sanitizeForPrompt, COVER_CUSTOM_SUFFIX } from "@/lib/cover-prompt";

type Params = { params: Promise<{ id: string }> };

export const maxDuration = 60;

/**
 * توليد غلاف من مضمون المقال — معاينة فقط لا تمس شيئًا، أو اعتماد يرفع
 * سحابيًا ويعيد الرابط لحقول المحرر (الربط بالمقال يتم عند حفظ المحرر
 * كأي حقل آخر — بلا كتابة مباشرة في قاعدة البيانات من هنا أبدًا).
 */
export async function POST(request: Request, { params }: Params) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  const { id } = await params;

  try {
    const body = (await request.json()) as {
      action?: "generate" | "adopt";
      image?: string; // dataURL عند الاعتماد
      prompt?: string; // وصف بصري من صاحب القرار (اختياري) — يغلب المدير الفني
      aspect?: CoverAspect; // نسبة الأبعاد — افتراضي landscape
    };
    const action = body.action === "adopt" ? "adopt" : "generate";

    const article = await prisma.article.findUnique({
      where: { id },
      select: { id: true, title: true, summary: true, content: true, slug: true, sectionId: true },
    });
    if (!article) return NextResponse.json({ error: "المقال غير موجود" }, { status: 404 });

    /* ---------- الاعتماد: رفع سحابي وإرجاع الرابط — بلا كتابة في المقال ---------- */
    if (action === "adopt") {
      const dataUrl = body.image ?? "";
      const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
      if (!match) {
        return NextResponse.json({ error: "صورة غير صالحة للاعتماد" }, { status: 400 });
      }
      if (!cloudinaryConfigured) {
        return NextResponse.json(
          { error: "خدمة الصور السحابية غير مهيأة — تحقق من مفاتيح Cloudinary" },
          { status: 503 },
        );
      }

      const buf = Buffer.from(match[2], "base64");
      const ext = match[1].split("/")[1].replace("jpeg", "jpg");
      const uploaded = await uploadImage(
        new Blob([new Uint8Array(buf)], { type: match[1] }),
        `ai-cover-${Date.now()}.${ext}`,
        "kalam/covers",
      );

      await writeAudit({
        adminId: guard.adminId,
        action: "article.cover.adopted",
        entity: "Article",
        entityId: id,
        meta: { title: article.title, bytes: uploaded.bytes, linkedOnSave: true },
        ip: getClientIp(request),
      });

      /* الرابط يذهب لحقل coverImage في المحرر — يثبت في المقال عند الحفظ فقط */
      return NextResponse.json({ ok: true, url: uploaded.url });
    }

    /* ---------- التوليد: معاينة فقط — لا رفع ولا قاعدة بيانات ولا إعادة توليد ---------- */
    const core = sanitizeForPrompt(article.content).slice(0, 1600);
    const customPrompt = (body.prompt ?? "").trim().slice(0, 500);
    const aspect: CoverAspect =
      body.aspect === "square" || body.aspect === "portrait" ? body.aspect : "landscape";

    /* الخطوة 1 — برومبت إنجليزي احترافي: وصف صاحب القرار يغلب المدير الفني،
       وإلا فصياغة Gemini أو القالب الإنجليزي الحتمي المدمج — لا يُفشل التوليد هنا أبدًا.
       الوصف العربي المخصص يُترجم عبر Gemini أولًا: محركات الصور لا تفهم العربية */
    let artPrompt: string;
    let promptEngine: string;
    if (customPrompt.length >= 3) {
      const translated = await translateCoverPromptToEnglish(customPrompt);
      if (translated) {
        artPrompt = `${translated}, ${COVER_CUSTOM_SUFFIX}`;
        promptEngine = translated === customPrompt ? "custom-en" : "custom-translated";
      } else {
        /* عربي بلا ترجمة ممكنة — القالب الإنجليزي الاحتياطي بدل عربي خام يفشل */
        artPrompt = buildArtPrompt(article.title, article.summary, core);
        promptEngine = "template-fallback";
      }
    } else {
      artPrompt = buildArtPrompt(article.title, article.summary, core);
      promptEngine = "template";
      if (geminiConfigured()) {
        try {
          const synthesized = await geminiChat({
            candidates: ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"],
            memoKind: "cover-prompt",
            timeoutMs: 12_000,
            temperature: 0.85,
            maxOutputTokens: 300,
            system:
              "أنت مدير فني لمنصة مقالات فكرية عربية. مهمتك استخراج الجوهر الفكري للمقال وترجمته إلى سطر توجيه فني إنجليزي واحد لتوليد صورة واقعية هادئة. أخرج السطر الإنجليزي فقط دون أي شرح أو علامات تنسيق أو اقتباسات.",
            turns: [
              {
                role: "user",
                text: [
                  "حوّل جوهر المقال التالي إلى سطر توجيه فني إنجليزي واحد (image-generation prompt)",
                  "بالقالب الحرفي التالي مع تعبئة [Theme] بخلاصة الفكرة بلغة إنجليزية بليغة:",
                  "Generate a calm realistic editorial photograph representing: [Theme], warm atmospheric still life, clean composition with generous negative space, soft natural light, warm copper and cream tones, premium literary magazine style, no text, no abstract surrealism, no distorted shapes.",
                  "",
                  `عنوان المقال: ${article.title}`,
                  article.summary ? `المختصر: ${article.summary}` : "",
                  `المتن: ${core}`,
                ]
                  .filter(Boolean)
                  .join("\n"),
              },
            ],
          });
          const cleaned = synthesized.replace(/["'`]+/g, "").replace(/\s+/g, " ").trim();
          if (cleaned.length >= 40 && /[a-zA-Z]/.test(cleaned)) {
            artPrompt = cleaned;
            promptEngine = "gemini-2.5-flash";
          }
        } catch {
          /* صمت تام — القالب الاحتياطي يكفي */
        }
      }
    }

    /* الخطوة 2 — الرسم عبر سلسلة المحركات: Imagen (إن مُفوتر) ثم Nano Banana ثم Pollinations المجاني */
    const { base64, mimeType, engine } = await generateCoverArt(artPrompt, Date.now() + 50_000, aspect);
    const dataUrl = `data:${mimeType};base64,${base64}`;

    await writeAudit({
      adminId: guard.adminId,
      action: "article.cover.generated",
      entity: "Article",
      entityId: id,
      meta: { title: article.title, engine, promptEngine, aspect, previewOnly: true },
      ip: getClientIp(request),
    });

    return NextResponse.json({ image: dataUrl, engine, prompt: artPrompt, aspect });
  } catch (err) {
    if (err instanceof GeminiError) {
      return NextResponse.json({ error: err.message }, { status: err.status >= 500 ? 502 : err.status });
    }
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}
