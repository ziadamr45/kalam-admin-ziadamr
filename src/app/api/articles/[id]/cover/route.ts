import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, isRejected, writeAudit, getClientIp } from "@/lib/guard";
import { geminiImage, geminiConfigured, GeminiError } from "@/lib/gemini-inference";
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
      );

      return NextResponse.json({ ok: true, url: uploaded.url });
    }

    /* ---------- التوليد: برومبت فني من مضمون المقال ---------- */
    if (!geminiConfigured()) {
      return NextResponse.json(
        { error: "خدمة الذكاء الاصطناعي غير مهيأة — تحقق من GEMINI_API_KEY" },
        { status: 503 },
      );
    }

    const core = sanitizeForPrompt(article.content).slice(0, 1600);
    const prompt = buildArtPrompt(article.title, article.summary, core);

    const { base64, mimeType } = await geminiImage(prompt);

    await writeAudit({
      adminId: guard.adminId,
      action: "article.cover.generated",
      entity: "Article",
      entityId: id,
      meta: { title: article.title },
      ip: getClientIp(request),
    });

    return NextResponse.json({ image: `data:${mimeType};base64,${base64}` });
  } catch (err) {
    if (err instanceof GeminiError) {
      return NextResponse.json({ error: err.message }, { status: err.status >= 500 ? 502 : err.status });
    }
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}
