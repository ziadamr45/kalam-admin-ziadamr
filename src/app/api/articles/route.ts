import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, isRejected, writeAudit, getClientIp } from "@/lib/guard";
import { slugify } from "@/lib/slugify";
import { readingSeconds } from "@/lib/readingTime";
import { fixNunation } from "@/lib/nunation";

/** قائمة المقالات + إنشاء جديد */
export async function GET(request: Request) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const q = url.searchParams.get("q");
    const sectionId = url.searchParams.get("sectionId");

    const articles = await prisma.article.findMany({
      where: {
        ...(status && ["DRAFT", "SCHEDULED", "PUBLISHED", "ARCHIVED"].includes(status)
          ? { status: status as "DRAFT" | "SCHEDULED" | "PUBLISHED" | "ARCHIVED" }
          : {}),
        ...(sectionId ? { sectionId } : {}),
        ...(q ? { title: { contains: q } } : {}),
      },
      orderBy: { updatedAt: "desc" },
      include: { section: { select: { name: true, slug: true } } },
      take: 200,
    });

    return NextResponse.json({ articles });
  } catch {
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  try {
    const body = (await request.json()) as {
      title?: string;
      slug?: string;
      summary?: string;
      content?: string;
      contentWithTashkeel?: string;
      sectionId?: string | null;
      coverImage?: string | null;
      audioUrl?: string | null;
      audioDurationSec?: number | null;
      audioCues?: { t: number; id: string }[] | null;
      tashkeelEnabled?: boolean;
      authorIntent?: string | null;
    };

    if (!body.title?.trim() || !body.content?.trim() || !body.summary?.trim()) {
      return NextResponse.json(
        { error: "العنوان والملخص والمحتوى القياسي حقول إلزامية" },
        { status: 400 },
      );
    }

    const slug = slugify(body.slug?.trim() || body.title);

    /* تفرد الـ slug */
    const exists = await prisma.article.findUnique({ where: { slug }, select: { id: true } });
    const finalSlug = exists ? `${slug}-${Date.now().toString(36)}` : slug;

    const readingTimeSec = Math.max(
      readingSeconds(body.content),
      readingSeconds(body.contentWithTashkeel || ""),
    );

    const article = await prisma.article.create({
      data: {
        /* تصحيح التنوين الإلزامي على الخادم — لا كلمة تُنشر بتنوين خاطئ */
        title: fixNunation(body.title.trim()),
        slug: finalSlug,
        summary: fixNunation(body.summary.trim()),
        content: fixNunation(body.content),
        contentWithTashkeel: fixNunation(body.contentWithTashkeel?.trim() || body.content),
        sectionId: body.sectionId || null,
        coverImage: body.coverImage || null,
        audioUrl: body.audioUrl || null,
        audioDurationSec: body.audioDurationSec ?? null,
        audioCues: (body.audioCues ?? undefined) as never,
        authorIntent: body.authorIntent?.trim() ? fixNunation(body.authorIntent.trim()) : null,
        tashkeelEnabled: typeof body.tashkeelEnabled === "boolean" ? body.tashkeelEnabled : true,
        readingTimeSec,
        status: "DRAFT",
      },
    });

    await writeAudit({
      adminId: guard.adminId,
      action: "article.created",
      entity: "Article",
      entityId: article.id,
      meta: { title: article.title },
      ip: getClientIp(request),
    });

    return NextResponse.json({ article });
  } catch {
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}
