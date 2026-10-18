import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { articleRevalidatePaths, revalidatePublicPaths } from "@/lib/revalidate";
import { writeAudit } from "@/lib/guard";

/**
 * مهمة Vercel Cron — النشر المجدول التلقائي
 * تعمل كل 5 دقائق: تقلب المقالات المجدولة التي حان موعدها إلى منشورة
 * وتعيد توليد صفحات المنصة العامة فورًا
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const authHeader = request.headers.get("authorization");
  const secret = authHeader?.replace("Bearer ", "") || url.searchParams.get("secret");

  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  try {
    const due = await prisma.article.findMany({
      where: {
        status: "SCHEDULED",
        scheduledAt: { lte: new Date() },
      },
      select: { id: true, slug: true, sectionId: true },
    });

    for (const article of due) {
      await prisma.article.update({
        where: { id: article.id },
        data: {
          status: "PUBLISHED",
          publishedAt: new Date(),
          checklistPassed: true,
        },
      });

      const section = article.sectionId
        ? await prisma.section.findUnique({
            where: { id: article.sectionId },
            select: { slug: true },
          })
        : null;

      await revalidatePublicPaths(
        articleRevalidatePaths({ slug: article.slug, sectionSlug: section?.slug ?? null }),
        article.slug,
      );
    }

    if (due.length > 0) {
      await writeAudit({
        action: "cron.published",
        meta: { count: due.length, slugs: due.map((d) => d.slug) },
      });
    }

    return NextResponse.json({ ok: true, published: due.length });
  } catch {
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}
