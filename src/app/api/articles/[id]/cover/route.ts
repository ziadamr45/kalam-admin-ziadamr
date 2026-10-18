import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, isRejected, writeAudit, getClientIp } from "@/lib/guard";
import { generateCoverArt, geminiChat, geminiConfigured, GeminiError } from "@/lib/gemini-inference";
import { uploadImage, cloudinaryConfigured } from "@/lib/cloudinary";
import { articleRevalidatePaths, revalidatePublicPaths } from "@/lib/revalidate";

type Params = { params: Promise<{ id: string }> };

export const maxDuration = 60;

/**
 * تنظيف نص المقال من كتل التنسيق الخاصة قبل صياغة البرومت الفني
 * ([[آية|سورة|رقم]] و [[حديث|راوي]] وعلامات الماركداون الخفيف)
 */
function sanitizeForPrompt(raw: string): string {
  return raw
    .replace(/\[\[[^\]]+\]\]/g, " ")
    .replace(/^#+\s+/gm, "")
    .replace(/^>\s+/gm, "")
    .replace(/^-\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * صياغة البرومت الفني الراقي — أسلوب فلسفي هادئ Minimalist/Concept Art
 * بهوية المنصة البصرية (نحاسي دافئ على ورقي كريمي، بلا أي نصوص مكتوبة)
 */
function buildArtPrompt(title: string, summary: string, core: string): string {
  return [
    "Create a single minimalist philosophical concept-art editorial cover image for a thoughtful Arabic intellectual essay.",
    "Art direction: calm, contemplative, generous negative space, flat elegant shapes with subtle paper-grain texture,",
    "warm muted palette (deep copper #A16A1F, cream #F8F4EC, soft charcoal accents), soft ambient light.",
    "Abstract symbolism ONLY — visual metaphors that express the core idea. Absolutely NO text, NO letters, NO words, NO Arabic calligraphy, NO typography of any kind.",
    "Style reference: premium literary magazine cover, modern minimalism, timeless and dignified.",
    "",
    `Essay title: ${title}`,
    summary ? `Summary: ${summary}` : "",
    core ? `Core content (for meaning extraction): ${core}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** توليد غلاف تجريدي ذكي من مضمون المقال / اعتماده ورفعه وربطه بالمقال */
export async function POST(request: Request, { params }: Params) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  const { id } = await params;

  try {
    const body = (await request.json()) as {
      action?: "generate" | "adopt";
      image?: string; // dataURL عند الاعتماد
    };
    const action = body.action === "adopt" ? "adopt" : "generate";

    const article = await prisma.article.findUnique({
      where: { id },
      select: { id: true, title: true, summary: true, content: true, slug: true, sectionId: true },
    });
    if (!article) return NextResponse.json({ error: "المقال غير موجود" }, { status: 404 });

    /* ---------- الاعتماد: رفع سحابي + ربط + إعادة توليد ---------- */
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

      const updated = await prisma.article.update({
        where: { id },
        data: { coverImage: uploaded.url },
      });

      await writeAudit({
        adminId: guard.adminId,
        action: "article.cover.adopted",
        entity: "Article",
        entityId: id,
        meta: { title: updated.title, bytes: uploaded.bytes },
        ip: getClientIp(request),
      });

      const section = await prisma.section.findUnique({
        where: { id: updated.sectionId ?? "" },
        select: { slug: true },
      });
      await revalidatePublicPaths(
        articleRevalidatePaths({ slug: updated.slug, sectionSlug: section?.slug ?? null }),
        updated.slug,
      );

      return NextResponse.json({ ok: true, url: uploaded.url });
    }

    /* ---------- التوليد: خطوتان — مدير فني Gemini ثم سلسلة محركات الرسم ---------- */
    const core = sanitizeForPrompt(article.content).slice(0, 1600);

    /* الخطوة 1 — صياغة برومبت إنجليزي احترافي من جوهر المقال (موديل نصوص مجاني،
       وعند فشله يكفي القالب الإنجليزي الحتمي المدمج — لا يُفشل التوليد أبدًا هنا) */
    let artPrompt = buildArtPrompt(article.title, article.summary, core);
    let promptEngine = "template";
    if (geminiConfigured()) {
      try {
        const synthesized = await geminiChat({
          candidates: ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"],
          memoKind: "cover-prompt",
          timeoutMs: 12_000,
          temperature: 0.85,
          maxOutputTokens: 300,
          system:
            "أنت مدير فني لمنصة مقالات فكرية عربية. مهمتك استخراج الجوهر الفكري للمقال وترجمته إلى سطر توجيه فني إنجليزي واحد لتوليد صورة. أخرج السطر الإنجليزي فقط دون أي شرح أو علامات تنسيق أو اقتباسات.",
          turns: [
            {
              role: "user",
              text: [
                "حوّل جوهر المقال التالي إلى سطر توجيه فني إنجليزي واحد (image-generation prompt)",
                "بالقالب الحرفي التالي مع تعبئة [Theme] بخلاصة الفكرة بلغة إنجليزية بليغة:",
                "Generate a minimal, abstract, thought-provoking editorial artwork representing: [Theme], dark cinematic tones, elegant lighting, warm copper accent glow, modern minimalist style, ultra-high resolution, no text.",
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

    /* الخطوة 2 — الرسم عبر سلسلة المحركات: Imagen (إن مُفوتر) ثم Nano Banana ثم Pollinations المجاني */
    const { base64, mimeType, engine } = await generateCoverArt(artPrompt, Date.now() + 50_000);
    const dataUrl = `data:${mimeType};base64,${base64}`;

    /* رفع سحابي فوري + حفظ الرابط النهائي في coverImage (توليد = اعتماد تلقائي) */
    let url: string | undefined;
    let saved = false;
    if (cloudinaryConfigured) {
      try {
        const buf = Buffer.from(base64, "base64");
        const ext = mimeType.split("/")[1].replace("jpeg", "jpg");
        const uploaded = await uploadImage(
          new Blob([new Uint8Array(buf)], { type: mimeType }),
          `ai-cover-${Date.now()}.${ext}`,
          "kalam/covers",
        );
        const updated = await prisma.article.update({
          where: { id },
          data: { coverImage: uploaded.url },
        });
        url = uploaded.url;
        saved = true;
        const section = await prisma.section.findUnique({
          where: { id: updated.sectionId ?? "" },
          select: { slug: true },
        });
        await revalidatePublicPaths(
          articleRevalidatePaths({ slug: updated.slug, sectionSlug: section?.slug ?? null }),
          updated.slug,
        );
      } catch {
        /* فشل الرفع لا يُفشل التوليد — يعود قرار الاعتماد للأدمن عبر زر الاعتماد */
      }
    }

    await writeAudit({
      adminId: guard.adminId,
      action: "article.cover.generated",
      entity: "Article",
      entityId: id,
      meta: { title: article.title, engine, promptEngine, saved },
      ip: getClientIp(request),
    });

    return NextResponse.json({ image: dataUrl, url, saved, engine });
  } catch (err) {
    if (err instanceof GeminiError) {
      return NextResponse.json({ error: err.message }, { status: err.status >= 500 ? 502 : err.status });
    }
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}
