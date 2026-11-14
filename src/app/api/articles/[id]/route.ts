import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession, isRejected, writeAudit, getClientIp } from "@/lib/guard";
import { slugify } from "@/lib/slugify";
import { readingSeconds } from "@/lib/readingTime";
import { getSystemSettings } from "@/lib/settings";
import { articleRevalidatePaths, revalidatePublicPaths } from "@/lib/revalidate";
import { fixNunation } from "@/lib/nunation";
import { notifyArticlePublished } from "@/lib/notify-publish";
import { destroyAudio } from "@/lib/cloudinary";

export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  const { id } = await params;
  const article = await prisma.article.findUnique({
    where: { id },
    include: { section: { select: { name: true, slug: true } } },
  });
  if (!article) return NextResponse.json({ error: "غير موجود" }, { status: 404 });
  return NextResponse.json({ article });
}

export async function PATCH(request: Request, { params }: Params) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  const { id } = await params;

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
      status?: "DRAFT" | "SCHEDULED" | "PUBLISHED" | "ARCHIVED";
      scheduledAt?: string | null;
      checklistData?: { items: { text: string; checked: boolean }[] };
      tashkeelEnabled?: boolean;
      authorIntent?: string | null;
    };

    const existing = await prisma.article.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "غير موجود" }, { status: 404 });

    if (body.status === "PUBLISHED" && existing.status !== "PUBLISHED") {
      const settings = await getSystemSettings();
      if (settings.REQUIRE_CHECKLIST) {
        const items = body.checklistData?.items ?? [];
        const allChecked = items.length > 0 && items.every((i) => i.checked);
        if (!allChecked) {
          return NextResponse.json(
            { error: "النشر يتطلب اجتياز قائمة الفحص الأخلاقي كاملة" },
            { status: 422 },
          );
        }
      }
    }

    const data: Record<string, unknown> = {};

    if (body.title !== undefined) data.title = fixNunation(body.title.trim());
    if (body.summary !== undefined) data.summary = fixNunation(body.summary.trim());
    if (body.content !== undefined) data.content = fixNunation(body.content);
    if (body.contentWithTashkeel !== undefined)
      data.contentWithTashkeel = fixNunation(body.contentWithTashkeel.trim() || body.content || existing.content);
    if (body.sectionId !== undefined) data.sectionId = body.sectionId || null;
    if (body.coverImage !== undefined) data.coverImage = body.coverImage || null;

    /* إزالة الصوت عند الحفظ الفعلي للمقال — مع تنظيف الأصل السحابي */
    const removingAudio = body.audioUrl !== undefined && !body.audioUrl && Boolean(existing.audioUrl);
    if (body.audioUrl !== undefined) {
      data.audioUrl = body.audioUrl || null;
      if (!body.audioUrl) {
        data.audioPublicId = null;
        data.audioDurationSec = null;
        data.audioWords = Prisma.DbNull;
        data.audioVoice = null;
        data.audioGeneratedAt = null;
        data.audioStatus = "NONE";
        data.audioProgress = 0;
        data.audioTotal = 0;
      }
    }
    if (body.audioDurationSec !== undefined && body.audioUrl !== "") {
      data.audioDurationSec = body.audioDurationSec;
    }
    if (body.audioCues !== undefined) data.audioCues = body.audioCues as never;
    if (typeof body.tashkeelEnabled === "boolean") data.tashkeelEnabled = body.tashkeelEnabled;
    if (body.authorIntent !== undefined)
      data.authorIntent = body.authorIntent?.trim() ? fixNunation(body.authorIntent.trim()) : null;

    if (body.slug !== undefined && body.slug.trim()) {
      const newSlug = slugify(body.slug);
      if (newSlug !== existing.slug) {
        const clash = await prisma.article.findUnique({ where: { slug: newSlug }, select: { id: true } });
        data.slug = clash ? `${newSlug}-${Date.now().toString(36)}` : newSlug;
      }
    }

    const contentForTime = (data.content as string) ?? existing.content;
    const tashkeelForTime = (data.contentWithTashkeel as string) ?? existing.contentWithTashkeel;
    data.readingTimeSec = Math.max(
      readingSeconds(contentForTime),
      readingSeconds(tashkeelForTime),
    );

    if (body.status) {
      data.status = body.status;
      if (body.status === "PUBLISHED" && existing.status !== "PUBLISHED") {
        data.publishedAt = existing.publishedAt ?? new Date();
        data.scheduledAt = null;
        data.checklistPassed = true;
        data.checklistData = (body.checklistData ?? undefined) as never;
      }
      if (body.status === "SCHEDULED") {
        if (!body.scheduledAt) {
          return NextResponse.json({ error: "حدد موعد النشر" }, { status: 400 });
        }
        const when = new Date(body.scheduledAt);
        if (when.getTime() < Date.now()) {
          return NextResponse.json({ error: "الموعد المحدد في الماضي" }, { status: 400 });
        }
        data.scheduledAt = when;
        data.publishedAt = null;
      }
      if (body.status === "DRAFT" || body.status === "ARCHIVED") {
        data.scheduledAt = null;
      }
    }

    const article = await prisma.article.update({ where: { id }, data: data as never });

    if (removingAudio && existing.audioPublicId) {
      await destroyAudio(existing.audioPublicId).catch(() => {});
    }

    const publishNotified =
      body.status === "PUBLISHED" && existing.status !== "PUBLISHED"
        ? await notifyArticlePublished({
            id: article.id,
            title: article.title,
            slug: article.slug,
            summary: article.summary,
          })
        : null;

    await writeAudit({
      adminId: guard.adminId,
      action: body.status === "PUBLISHED" ? "article.published" : "article.updated",
      entity: "Article",
      entityId: article.id,
      meta: {
        title: article.title,
        status: article.status,
        ...(publishNotified ? { notified: publishNotified } : {}),
      },
      ip: getClientIp(request),
    });

    if (body.status === "PUBLISHED" || existing.status === "PUBLISHED") {
      const section = body.sectionId
        ? await prisma.section.findUnique({ where: { id: body.sectionId }, select: { slug: true } })
        : await prisma.section.findUnique({ where: { id: existing.sectionId ?? "" }, select: { slug: true } });
      await revalidatePublicPaths(
        articleRevalidatePaths({ slug: article.slug, sectionSlug: section?.slug ?? null }),
        article.slug,
      );
    }

    return NextResponse.json({ article });
  } catch {
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  const { id } = await params;
  const existing = await prisma.article.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "غير موجود" }, { status: 404 });

  await prisma.article.delete({ where: { id } });

  await writeAudit({
    adminId: guard.adminId,
    action: "article.deleted",
    entity: "Article",
    entityId: id,
    meta: { title: existing.title },
    ip: getClientIp(request),
  });

  return NextResponse.json({ ok: true });
}
