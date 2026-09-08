/**
 * منفذو أدوات MCP السيادية — تنفيذ كل عملية عبر Prisma داخل معاملات آمنة،
 * مع توثيق كامل في سجل التدقيق (AuditLog) وإعادة توليد صفحات المنصة العامة
 * فورًا عند أي تغيير يهم القارئ.
 */

import { Prisma, type ArticleStatus, type CommentStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { writeAudit, getClientIp } from "@/lib/guard";
import { slugify } from "@/lib/slugify";
import { readingSeconds } from "@/lib/readingTime";
import { fixNunation } from "@/lib/nunation";
import { getSystemSettings } from "@/lib/settings";
import {
  revalidatePublicPaths,
  articleRevalidatePaths,
} from "@/lib/revalidate";
import { destroyAudio } from "@/lib/cloudinary";
import { kickWorker } from "@/lib/audio-job";

/* ============================ الأنواع ============================ */

export type McpArgs = Record<string, unknown>;
export type McpRequestMeta = { ip: string };

export class McpToolError extends Error {
  details?: unknown;
  constructor(message: string, details?: unknown) {
    super(message);
    this.details = details;
  }
}

const ARTICLE_STATUSES: ArticleStatus[] = ["DRAFT", "SCHEDULED", "PUBLISHED", "ARCHIVED"];
const COMMENT_STATUSES: CommentStatus[] = ["PENDING", "APPROVED", "REJECTED"];

/* ============================ أدوات مساعدة ============================ */

function str(args: McpArgs, key: string): string | undefined {
  const v = args[key];
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s.length > 0 ? s : undefined;
}

function num(args: McpArgs, key: string): number | undefined {
  const v = args[key];
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function bool(args: McpArgs, key: string): boolean | undefined {
  const v = args[key];
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return undefined;
}

async function requireArticle(idOrSlug: string) {
  const article =
    (await prisma.article.findUnique({
      where: { id: idOrSlug },
      include: { section: { select: { id: true, name: true, slug: true } } },
    })) ??
    (await prisma.article.findUnique({
      where: { slug: idOrSlug },
      include: { section: { select: { id: true, name: true, slug: true } } },
    }));
  if (!article) {
    throw new McpToolError(`لا يوجد مقال بالمعرف «${idOrSlug}»`);
  }
  return article;
}

async function resolveSectionId(sectionSlug?: string): Promise<string | undefined | null> {
  if (sectionSlug === undefined) return undefined;
  const section = await prisma.section.findUnique({ where: { slug: sectionSlug }, select: { id: true } });
  if (!section) throw new McpToolError(`لا يوجد قسم بالمعرف «${sectionSlug}»`);
  return section.id;
}

async function revalidateArticlePaths(slug: string, sectionSlug?: string | null) {
  await revalidatePublicPaths(
    articleRevalidatePaths({ slug, sectionSlug: sectionSlug ?? null }),
    slug,
  );
}

/** اشتقاق ملخص آلي من أول المتن عند غيابه — تنظيف خفيف من ماركداون العناوين */
function deriveSummary(content: string): string {
  const plain = content
    .replace(/\[\[[^\]]+\]\]/g, " ")
    .replace(/^#+\s+/gm, "")
    .replace(/^>\s+/gm, "")
    .replace(/^-\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > 180 ? `${plain.slice(0, 177)}...` : plain;
}

/* ============================ أدوات المقالات ============================ */

async function listArticles(args: McpArgs) {
  const status = str(args, "status");
  const sectionSlug = str(args, "sectionSlug");
  const query = str(args, "query");
  const limit = Math.min(num(args, "limit") ?? 20, 50);
  const offset = Math.max(num(args, "offset") ?? 0, 0);
  const sort = str(args, "sort") ?? "recent";

  let sectionId: string | undefined;
  if (sectionSlug) {
    const section = await prisma.section.findUnique({ where: { slug: sectionSlug }, select: { id: true } });
    if (!section) throw new McpToolError(`لا يوجد قسم بالمعرف «${sectionSlug}»`);
    sectionId = section.id;
  }

  const where: Prisma.ArticleWhereInput = {
    ...(status && ARTICLE_STATUSES.includes(status as ArticleStatus)
      ? { status: status as ArticleStatus }
      : {}),
    ...(sectionId ? { sectionId } : {}),
    ...(query ? { OR: [{ title: { contains: query } }, { summary: { contains: query } }] } : {}),
  };

  const orderBy: Prisma.ArticleOrderByWithRelationInput =
    sort === "views" ? { views: "desc" } : sort === "published" ? { publishedAt: "desc" } : { updatedAt: "desc" };

  const [total, articles] = await prisma.$transaction([
    prisma.article.count({ where }),
    prisma.article.findMany({
      where,
      orderBy,
      take: limit,
      skip: offset,
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        views: true,
        completedReads: true,
        readingTimeSec: true,
        audioStatus: true,
        coverImage: true,
        publishedAt: true,
        updatedAt: true,
        section: { select: { name: true, slug: true } },
        _count: { select: { comments: true } },
      },
    }),
  ]);

  return {
    total,
    count: articles.length,
    articles: articles.map((a) => ({
      ...a,
      commentsCount: a._count.comments,
      _count: undefined,
    })),
  };
}

async function getArticleDetails(args: McpArgs) {
  const id = str(args, "id");
  const slug = str(args, "slug");
  const key = id || slug;
  if (!key) throw new McpToolError("مرّر id أو slug للمقال");

  const article = await requireArticle(key);
  const [comments, interactions, shares, pageViews] = await Promise.all([
    prisma.comment.groupBy({ by: ["status"], where: { articleId: article.id }, _count: true }),
    prisma.interaction.count({ where: { articleId: article.id } }),
    prisma.socialShare.count({ where: { articleId: article.id } }),
    prisma.pageView.count({ where: { articleId: article.id } }),
  ]);

  return {
    ...article,
    stats: {
      commentsByStatus: Object.fromEntries(comments.map((c) => [c.status, c._count])),
      reactions: interactions,
      shares,
      pageViews,
    },
  };
}

async function createArticle(args: McpArgs, meta: McpRequestMeta) {
  const title = str(args, "title");
  const content = str(args, "content");
  if (!title || !content) throw new McpToolError("العنوان والمحتوى حقول إلزامية");

  const summary = str(args, "summary") ?? deriveSummary(content);
  const status = (str(args, "status") ?? "DRAFT") as ArticleStatus;
  if (!ARTICLE_STATUSES.includes(status) || status === "ARCHIVED") {
    throw new McpToolError("حالة الإنشاء يجب أن تكون DRAFT أو SCHEDULED أو PUBLISHED");
  }
  const sectionId = await resolveSectionId(str(args, "sectionSlug"));

  /* حوكمة النشر: فرض قائمة الفحص الأخلاقي حسب إعدادات المنصة */
  let checklistPassed = false;
  if (status === "PUBLISHED") {
    const settings = await getSystemSettings();
    if (settings.REQUIRE_CHECKLIST && bool(args, "checklistConfirmation") !== true) {
      throw new McpToolError(
        "النشر المباشر يتطلب تأكيد قائمة الفحص الأخلاقي — مرّر checklistConfirmation=true بعد مراجعة المقال",
      );
    }
    checklistPassed = true;
  }
  if (status === "SCHEDULED") {
    if (!str(args, "scheduledAt")) throw new McpToolError("حدد scheduledAt لموعد النشر");
  }

  const created = await prisma.$transaction(async (tx) => {
    const baseSlug = slugify(str(args, "slug") || title);
    const exists = await tx.article.findUnique({ where: { slug: baseSlug }, select: { id: true } });
    const finalSlug = exists ? `${baseSlug}-${Date.now().toString(36)}` : baseSlug;

    return tx.article.create({
      data: {
        title: fixNunation(title),
        slug: finalSlug,
        summary: fixNunation(summary),
        content: fixNunation(content),
        contentWithTashkeel: fixNunation(content),
        sectionId: sectionId ?? null,
        coverImage: str(args, "coverImage") || null,
        authorIntent: str(args, "authorIntent") ? fixNunation(str(args, "authorIntent")!) : null,
        tashkeelEnabled: bool(args, "tashkeelEnabled") ?? true,
        readingTimeSec: Math.max(readingSeconds(content), 60),
        status,
        checklistPassed,
        publishedAt: status === "PUBLISHED" ? new Date() : null,
        scheduledAt: status === "SCHEDULED" ? new Date(str(args, "scheduledAt")!) : null,
      },
    });
  });

  await writeAudit({
    adminId: null,
    action: "mcp.article_created",
    entity: "Article",
    entityId: created.id,
    meta: { via: "gemini-spark-mcp", title: created.title, status },
    ip: meta.ip,
  });

  if (status === "PUBLISHED") {
    await revalidateArticlePaths(created.slug);
  }

  return { created: true, article: created };
}

async function updateArticle(args: McpArgs, meta: McpRequestMeta) {
  const id = str(args, "id");
  if (!id) throw new McpToolError("معرف المقال إلزامي");
  const existing = await requireArticle(id);

  const data: Record<string, unknown> = {};
  if (str(args, "title") !== undefined) data.title = fixNunation(str(args, "title")!);
  if (str(args, "summary") !== undefined) data.summary = fixNunation(str(args, "summary")!);
  if (str(args, "content") !== undefined) {
    const content = str(args, "content")!;
    data.content = fixNunation(content);
    data.contentWithTashkeel = fixNunation(content);
    data.readingTimeSec = Math.max(readingSeconds(content), 60);
  }
  const sectionId = await resolveSectionId(str(args, "sectionSlug"));
  if (sectionId !== undefined) data.sectionId = sectionId;
  /* الغلاف يقبل رابطًا نصيًا أو null صريحًا لمسحه */
  if (args["coverImage"] !== undefined) {
    const rawCover = args["coverImage"];
    data.coverImage = typeof rawCover === "string" && rawCover.trim().length > 0 ? rawCover.trim() : null;
  }
  if (bool(args, "tashkeelEnabled") !== undefined) data.tashkeelEnabled = bool(args, "tashkeelEnabled");
  if (str(args, "authorIntent") !== undefined) {
    data.authorIntent = str(args, "authorIntent") ? fixNunation(str(args, "authorIntent")!) : null;
  }

  if (str(args, "slug") !== undefined && str(args, "slug")!.trim()) {
    const newSlug = slugify(str(args, "slug")!);
    if (newSlug !== existing.slug) {
      const clash = await prisma.article.findUnique({ where: { slug: newSlug }, select: { id: true } });
      data.slug = clash ? `${newSlug}-${Date.now().toString(36)}` : newSlug;
    }
  }

  const status = str(args, "status") as ArticleStatus | undefined;
  let publishTransition = false;
  if (status) {
    if (!ARTICLE_STATUSES.includes(status)) throw new McpToolError("حالة غير صالحة");
    if (status === "PUBLISHED" && existing.status !== "PUBLISHED") {
      const settings = await getSystemSettings();
      if (settings.REQUIRE_CHECKLIST && bool(args, "checklistConfirmation") !== true) {
        throw new McpToolError(
          "النشر يتطلب تأكيد قائمة الفحص الأخلاقي — مرّر checklistConfirmation=true بعد المراجعة",
        );
      }
      data.publishedAt = existing.publishedAt ?? new Date();
      data.scheduledAt = null;
      data.checklistPassed = true;
      publishTransition = true;
    }
    if (status === "SCHEDULED") {
      const when = str(args, "scheduledAt");
      if (!when) throw new McpToolError("حدد scheduledAt لموعد النشر");
      data.scheduledAt = new Date(when);
      data.publishedAt = null;
    }
    if (status === "DRAFT" || status === "ARCHIVED") data.scheduledAt = null;
    data.status = status;
  }

  const article = await prisma.article.update({ where: { id: existing.id }, data: data as never });

  await writeAudit({
    adminId: null,
    action: publishTransition ? "mcp.article_published" : "mcp.article_updated",
    entity: "Article",
    entityId: article.id,
    meta: { via: "gemini-spark-mcp", title: article.title, status: article.status },
    ip: meta.ip,
  });

  if (publishTransition || (existing.status === "PUBLISHED" && status !== undefined)) {
    await revalidateArticlePaths(article.slug, article.sectionId ? undefined : null);
  }

  return { updated: true, article };
}

async function deleteOrArchiveArticle(args: McpArgs, meta: McpRequestMeta) {
  const id = str(args, "id");
  if (!id) throw new McpToolError("معرف المقال إلزامي");
  const mode = str(args, "mode") ?? "archive";
  const existing = await requireArticle(id);

  if (mode === "delete") {
    await prisma.$transaction(async (tx) => {
      await tx.article.delete({ where: { id: existing.id } });
    });
    /* تنظيف الأصل الصوتي السحابي — خارج المعامل لأنه نداء شبكي خارجي */
    if (existing.audioPublicId) {
      await destroyAudio(existing.audioPublicId).catch(() => undefined);
    }
    await writeAudit({
      adminId: null,
      action: "mcp.article_deleted",
      entity: "Article",
      entityId: existing.id,
      meta: { via: "gemini-spark-mcp", title: existing.title },
      ip: meta.ip,
    });
    /* إزالة المقال من القوائم العامة فورًا */
    await revalidatePublicPaths(["/"]);
    return { deleted: true, article: { id: existing.id, title: existing.title, slug: existing.slug } };
  }

  /* أرشفة آمنة */
  const wasPublished = existing.status === "PUBLISHED";
  const article = await prisma.article.update({
    where: { id: existing.id },
    data: { status: "ARCHIVED", scheduledAt: null },
  });
  await writeAudit({
    adminId: null,
    action: "mcp.article_archived",
    entity: "Article",
    entityId: existing.id,
    meta: { via: "gemini-spark-mcp", title: existing.title },
    ip: meta.ip,
  });
  if (wasPublished) await revalidateArticlePaths(article.slug);
  return { archived: true, article: { id: article.id, title: article.title, status: article.status } };
}

/* ============================ أدوات الأقسام ============================ */

async function listCategories() {
  const sections = await prisma.section.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { articles: true } } },
  });
  return {
    count: sections.length,
    categories: sections.map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      description: s.description,
      color: s.color,
      icon: s.icon,
      sortOrder: s.sortOrder,
      active: s.active,
      articlesCount: s._count.articles,
    })),
  };
}

async function createCategory(args: McpArgs, meta: McpRequestMeta) {
  const name = str(args, "name");
  if (!name) throw new McpToolError("اسم القسم إلزامي");

  const section = await prisma.$transaction(async (tx) => {
    const baseSlug = slugify(str(args, "slug") || name);
    const exists = await tx.section.findUnique({ where: { slug: baseSlug }, select: { id: true } });
    const finalSlug = exists ? `${baseSlug}-${Date.now().toString(36)}` : baseSlug;
    return tx.section.create({
      data: {
        name,
        slug: finalSlug,
        description: str(args, "description") || null,
        color: str(args, "color") || null,
        icon: str(args, "icon") || null,
        sortOrder: num(args, "sortOrder") ?? 0,
      },
    });
  });

  await writeAudit({
    adminId: null,
    action: "mcp.category_created",
    entity: "Section",
    entityId: section.id,
    meta: { via: "gemini-spark-mcp", name: section.name },
    ip: meta.ip,
  });

  /* القسم الجديد يظهر في قوائم التنقل — تحديث التخطيط المشترك */
  await revalidatePublicPaths(["/"], undefined, true);
  return { created: true, category: section };
}

async function updateCategory(args: McpArgs, meta: McpRequestMeta) {
  const id = str(args, "id");
  if (!id) throw new McpToolError("معرف القسم إلزامي");
  const existing = await prisma.section.findUnique({ where: { id } });
  if (!existing) throw new McpToolError(`لا يوجد قسم بالمعرف «${id}»`);

  const data: Record<string, unknown> = {};
  if (str(args, "name") !== undefined) data.name = str(args, "name");
  if (str(args, "description") !== undefined) data.description = str(args, "description");
  if (str(args, "color") !== undefined) data.color = str(args, "color");
  if (str(args, "icon") !== undefined) data.icon = str(args, "icon");
  if (num(args, "sortOrder") !== undefined) data.sortOrder = num(args, "sortOrder");
  if (bool(args, "active") !== undefined) data.active = bool(args, "active");

  const section = await prisma.section.update({ where: { id }, data: data as never });

  await writeAudit({
    adminId: null,
    action: "mcp.category_updated",
    entity: "Section",
    entityId: id,
    meta: { via: "gemini-spark-mcp", name: section.name },
    ip: meta.ip,
  });

  await revalidatePublicPaths(["/", `/section/${existing.slug}`], undefined, true);
  return { updated: true, category: section };
}

/* ============================ أدوات الصوت والوسائط ============================ */

async function triggerAudioGeneration(args: McpArgs, meta: McpRequestMeta) {
  const id = str(args, "id");
  if (!id) throw new McpToolError("معرف المقال إلزامي");
  const resume = bool(args, "resume") === true;

  const article = await prisma.article.findUnique({
    where: { id },
    select: { id: true, slug: true, title: true, audioStatus: true, audioJobId: true },
  });
  if (!article) throw new McpToolError(`لا يوجد مقال بالمعرف «${id}»`);

  const resuming = resume && article.audioStatus === "PROCESSING" && Boolean(article.audioJobId);
  if (article.audioStatus === "PROCESSING" && !resuming) {
    return {
      accepted: false,
      reason: "هناك معالجة صوتية جارية بالفعل — مرّر resume=true إذا بدت معلقة",
      audioStatus: article.audioStatus,
      jobId: article.audioJobId,
    };
  }

  let jobId = article.audioJobId ?? "";
  if (!resuming) {
    jobId = `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    await prisma.article.update({
      where: { id },
      data: {
        audioStatus: "PROCESSING",
        audioJobId: jobId,
        audioError: null,
        audioChunks: Prisma.DbNull,
        audioProgress: 0,
        audioTotal: 0,
        audioUpdatedAt: new Date(),
      },
    });
  }

  /* الانفصال عن العميل: السلسلة تكمل في الخلفية بعد إرسال الرد */
  const { after } = await import("next/server");
  after(() => kickWorker({ articleId: id, jobId, adminId: null }));

  await writeAudit({
    adminId: null,
    action: resuming ? "mcp.audio_resumed" : "mcp.audio_started",
    entity: "Article",
    entityId: id,
    meta: { via: "gemini-spark-mcp", slug: article.slug, jobId },
    ip: meta.ip,
  });

  return {
    accepted: true,
    status: "PROCESSING",
    jobId,
    article: { id: article.id, title: article.title, slug: article.slug },
    message: resuming
      ? "أُعيد إطلاق سلسلة المعالجة الصوتية وستكمل من حيث توقفت"
      : "بدأت المعالجة الصوتية في الخلفية — سيصبح audioStatus جاهزًا READY عند الاكتمال",
  };
}

async function updateArticleCover(args: McpArgs, meta: McpRequestMeta) {
  const id = str(args, "id");
  if (!id) throw new McpToolError("معرف المقال إلزامي");
  const raw = args["coverImage"];
  if (typeof raw !== "string" && raw !== null) {
    throw new McpToolError("مرّر coverImage كرابط نصي أو null لمسحه");
  }
  const coverImage = typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;

  const existing = await requireArticle(id);
  const article = await prisma.article.update({
    where: { id: existing.id },
    data: { coverImage },
    select: { id: true, title: true, slug: true, coverImage: true },
  });

  await writeAudit({
    adminId: null,
    action: "mcp.cover_updated",
    entity: "Article",
    entityId: existing.id,
    meta: { via: "gemini-spark-mcp", coverImage },
    ip: meta.ip,
  });

  await revalidateArticlePaths(article.slug);
  return { updated: true, article };
}

/* ============================ التحليلات والرقابة ============================ */

async function getSystemAnalytics() {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [articlesByStatus, viewAgg, pageViewTotal, pageViewWeek, commentsByStatus, usersTotal, usersBanned, aiUsage, aiDistinctUsers, topArticles, sectionsCount, pendingComments] =
    await Promise.all([
      prisma.article.groupBy({ by: ["status"], _count: true }),
      prisma.article.aggregate({ _sum: { views: true, completedReads: true } }),
      prisma.pageView.count(),
      prisma.pageView.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.comment.groupBy({ by: ["status"], _count: true }),
      prisma.user.count(),
      prisma.user.count({ where: { banned: true } }),
      prisma.aiDiscussionUsage.aggregate({ _sum: { messageCount: true }, _count: true }),
      prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(DISTINCT "userId")::bigint AS count FROM "AiDiscussionUsage"`,
      prisma.article.findMany({
        where: { status: "PUBLISHED" },
        orderBy: { views: "desc" },
        take: 5,
        select: { id: true, title: true, slug: true, views: true, completedReads: true },
      }),
      prisma.section.count({ where: { active: true } }),
      prisma.comment.count({ where: { status: "PENDING" } }),
    ]);

  return {
    articles: {
      byStatus: Object.fromEntries(articlesByStatus.map((a) => [a.status, a._count])),
      total: articlesByStatus.reduce((s, a) => s + a._count, 0),
      totalViews: viewAgg._sum.views ?? 0,
      completedReads: viewAgg._sum.completedReads ?? 0,
    },
    traffic: {
      pageViewsTotal: pageViewTotal,
      pageViewsLast7Days: pageViewWeek,
    },
    comments: {
      byStatus: Object.fromEntries(commentsByStatus.map((c) => [c.status, c._count])),
      pending: pendingComments,
    },
    users: { total: usersTotal, banned: usersBanned },
    aiDiscussions: {
      totalMessages: aiUsage._sum.messageCount ?? 0,
      totalSessions: aiUsage._count,
      distinctUsers: Number(aiDistinctUsers[0]?.count ?? 0n),
    },
    activeSections: sectionsCount,
    topArticles,
  };
}

async function listAndModerateComments(args: McpArgs, meta: McpRequestMeta) {
  const action = str(args, "action") ?? "list";

  if (action === "list") {
    const status = str(args, "status");
    const limit = Math.min(num(args, "limit") ?? 20, 50);
    const flaggedOnly = bool(args, "flaggedOnly") === true;
    const comments = await prisma.comment.findMany({
      where: {
        ...(status && COMMENT_STATUSES.includes(status as CommentStatus)
          ? { status: status as CommentStatus }
          : { status: "PENDING" }),
        ...(flaggedOnly ? { flagged: true } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        article: { select: { id: true, title: true, slug: true } },
        user: { select: { customName: true, name: true, email: true, intellectualRank: true } },
      },
    });
    return {
      count: comments.length,
      comments: comments.map((c) => ({
        id: c.id,
        content: c.content,
        status: c.status,
        flagged: c.flagged,
        flagReasons: c.flagReasons,
        riskScore: c.riskScore,
        reportCount: c.reportCount,
        isInspiring: c.isInspiring,
        createdAt: c.createdAt,
        author: c.user
          ? { name: c.user.customName ?? c.user.name, email: c.user.email, rank: c.user.intellectualRank }
          : { guestName: c.guestName },
        article: c.article,
      })),
    };
  }

  const commentId = str(args, "commentId");
  if (!commentId) throw new McpToolError(`معرف التعليق إلزامي للفعل «${action}»`);
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    include: { article: { select: { id: true, slug: true, title: true } } },
  });
  if (!comment) throw new McpToolError(`لا يوجد تعليق بالمعرف «${commentId}»`);

  if (action === "approve" || action === "reject") {
    const status: CommentStatus = action === "approve" ? "APPROVED" : "REJECTED";
    const updated = await prisma.comment.update({ where: { id: commentId }, data: { status } });
    await writeAudit({
      adminId: null,
      action: `mcp.comment_${action}ed`,
      entity: "Comment",
      entityId: commentId,
      meta: { via: "gemini-spark-mcp", articleSlug: comment.article.slug },
      ip: meta.ip,
    });
    await revalidateArticlePaths(comment.article.slug);
    return { moderated: true, comment: { id: updated.id, status: updated.status }, article: comment.article };
  }

  /* delete — حذف نهائي للتعليق المخالف */
  await prisma.comment.delete({ where: { id: commentId } });
  await writeAudit({
    adminId: null,
    action: "mcp.comment_deleted",
    entity: "Comment",
    entityId: commentId,
    meta: { via: "gemini-spark-mcp", articleSlug: comment.article.slug },
    ip: meta.ip,
  });
  await revalidateArticlePaths(comment.article.slug);
  return { deleted: true, commentId, article: comment.article };
}

/* ============================ إدارة الكاش ============================ */

async function purgeSiteCache(args: McpArgs, meta: McpRequestMeta) {
  const rawPaths = args["paths"];
  if (!Array.isArray(rawPaths) || rawPaths.length === 0) {
    throw new McpToolError("مرّر قائمة paths مثل ['/']");
  }
  const paths = rawPaths.map(String).filter((p) => p.startsWith("/")).slice(0, 50);
  if (paths.length === 0) throw new McpToolError("كل المسارات يجب أن تبدأ بـ /");

  const configured = Boolean(process.env.PUBLIC_URL && process.env.REVALIDATE_SECRET);
  await revalidatePublicPaths(paths, str(args, "slug"), bool(args, "layout") === true);

  await writeAudit({
    adminId: null,
    action: "mcp.cache_purged",
    entity: "Site",
    entityId: null,
    meta: { via: "gemini-spark-mcp", paths },
    ip: meta.ip,
  });

  return {
    revalidated: paths,
    slug: str(args, "slug") ?? null,
    layout: bool(args, "layout") === true,
    bridgeConfigured: configured,
    note: configured
      ? "أُطلقت إعادة التحقق الفوري في المنصة العامة"
      : "جسر إعادة التحقق غير مهيأ (PUBLIC_URL/REVALIDATE_SECRET) — سيغطي ISR الدوري",
  };
}

/* ============================ سجل التنفيذ ============================ */

export async function executeMcpTool(
  name: string,
  args: McpArgs,
  meta: McpRequestMeta,
): Promise<unknown> {
  switch (name) {
    case "list_articles":
      return listArticles(args);
    case "get_article_details":
      return getArticleDetails(args);
    case "create_article":
      return createArticle(args, meta);
    case "update_article":
      return updateArticle(args, meta);
    case "delete_or_archive_article":
      return deleteOrArchiveArticle(args, meta);
    case "list_categories":
      return listCategories();
    case "create_category":
      return createCategory(args, meta);
    case "update_category":
      return updateCategory(args, meta);
    case "trigger_audio_generation":
      return triggerAudioGeneration(args, meta);
    case "update_article_cover":
      return updateArticleCover(args, meta);
    case "get_system_analytics":
      return getSystemAnalytics();
    case "list_and_moderate_comments":
      return listAndModerateComments(args, meta);
    case "purge_site_cache":
      return purgeSiteCache(args, meta);
    default:
      throw new McpToolError(`أداة غير معروفة: «${name}»`);
  }
}
