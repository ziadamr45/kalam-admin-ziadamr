/**
 * منفذو أدوات MCP السيادية — تنفيذ كل عملية عبر Prisma داخل معاملات آمنة،
 * مع توثيق كامل في سجل التدقيق (AuditLog) وإعادة توليد صفحات المنصة العامة
 * فورًا عند أي تغيير يهم القارئ.
 */

import { Prisma, type ArticleStatus, type CommentStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { writeAudit, getClientIp, raiseAlert } from "@/lib/guard";
import { slugify } from "@/lib/slugify";
import { readingSeconds } from "@/lib/readingTime";
import { fixNunation } from "@/lib/nunation";
import {
  getSystemSettings,
  saveSystemSettings,
  getChecklist,
  saveChecklist,
} from "@/lib/settings";
import { awardImpact, IMPACT_POINTS } from "@/lib/impact";
import { hashPassword, verifyPassword, validatePasswordStrength } from "@/lib/password";
import { pushUsers } from "@/lib/push";
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

  if (action === "list_reports") {
    const limit = Math.min(num(args, "limit") ?? 30, 100);
    const commentId = str(args, "commentId");
    const reports = await prisma.commentReport.findMany({
      where: commentId ? { commentId } : {},
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        comment: {
          select: {
            id: true,
            content: true,
            status: true,
            flagged: true,
            reportCount: true,
            article: { select: { id: true, title: true, slug: true } },
          },
        },
      },
    });
    return { count: reports.length, reports };
  }

  if (action === "clear_reports") {
    const commentId = str(args, "commentId");
    if (!commentId) throw new McpToolError("معرف التعليق إلزامي للفعل clear_reports");
    const removed = await prisma.commentReport.deleteMany({ where: { commentId } });
    const dismissFlag = bool(args, "dismissFlag") === true;
    await prisma.comment.update({
      where: { id: commentId },
      data: {
        reportCount: 0,
        ...(dismissFlag ? { flagged: false, flagReasons: [] } : {}),
      },
    });
    await writeAudit({
      adminId: null,
      action: "mcp.comment_reports_cleared",
      entity: "Comment",
      entityId: commentId,
      meta: { via: "gemini-spark-mcp", removed: removed.count, dismissFlag },
      ip: meta.ip,
    });
    return { cleared: true, removedReports: removed.count, dismissFlag };
  }

  if (action === "list_reports") {
    const limit = Math.min(num(args, "limit") ?? 30, 100);
    const filterCommentId = str(args, "commentId");
    const reports = await prisma.commentReport.findMany({
      where: filterCommentId ? { commentId: filterCommentId } : {},
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        comment: {
          select: {
            id: true,
            content: true,
            status: true,
            flagged: true,
            reportCount: true,
            article: { select: { id: true, title: true, slug: true } },
          },
        },
      },
    });
    return { count: reports.length, reports };
  }

  if (action === "clear_reports") {
    const commentId = str(args, "commentId");
    if (!commentId) throw new McpToolError("معرف التعليق إلزامي للفعل clear_reports");
    const removed = await prisma.commentReport.deleteMany({ where: { commentId } });
    const dismissFlag = bool(args, "dismissFlag") === true;
    await prisma.comment.update({
      where: { id: commentId },
      data: {
        reportCount: 0,
        ...(dismissFlag ? { flagged: false, flagReasons: [] } : {}),
      },
    });
    await writeAudit({
      adminId: null,
      action: "mcp.comment_reports_cleared",
      entity: "Comment",
      entityId: commentId,
      meta: { via: "gemini-spark-mcp", removed: removed.count, dismissFlag },
      ip: meta.ip,
    });
    return { cleared: true, removedReports: removed.count, dismissFlag };
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

/* ============================ المستخدمون والقراء ============================ */

async function listUsers(args: McpArgs) {
  const query = str(args, "query");
  const bannedOnly = bool(args, "bannedOnly") === true;
  const limit = Math.min(num(args, "limit") ?? 30, 100);
  const offset = Math.max(num(args, "offset") ?? 0, 0);

  const where: Prisma.UserWhereInput = {
    ...(bannedOnly ? { banned: true } : {}),
    ...(query
      ? {
          OR: [
            { name: { contains: query } },
            { customName: { contains: query } },
            { email: { contains: query } },
          ],
        }
      : {}),
  };

  const [total, users] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ impactScore: "desc" }, { createdAt: "desc" }],
      take: limit,
      skip: offset,
      select: {
        id: true,
        name: true,
        email: true,
        customName: true,
        bio: true,
        impactScore: true,
        intellectualRank: true,
        banned: true,
        banReason: true,
        createdAt: true,
        _count: { select: { comments: true, aiDiscussions: true, proposals: true } },
      },
    }),
  ]);

  return {
    total,
    count: users.length,
    users: users.map((u) => ({
      id: u.id,
      displayName: u.customName ?? u.name,
      googleName: u.name,
      email: u.email,
      rank: u.intellectualRank,
      impactScore: u.impactScore,
      banned: u.banned,
      banReason: u.banReason,
      commentsCount: u._count.comments,
      aiDiscussions: u._count.aiDiscussions,
      proposals: u._count.proposals,
      joinedAt: u.createdAt,
    })),
  };
}

async function manageUser(args: McpArgs, meta: McpRequestMeta) {
  const userId = str(args, "userId");
  const action = str(args, "action");
  if (!userId || !action) throw new McpToolError("معرف المستخدم والفعل إلزاميان");

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, customName: true, name: true, email: true, banned: true, customImage: true },
  });
  if (!target) throw new McpToolError(`لا يوجد مستخدم بالمعرف «${userId}»`);
  const label = target.customName ?? target.name ?? target.email ?? target.id;

  if (action === "ban" || action === "unban") {
    const banned = action === "ban";
    const reason = str(args, "reason");
    if (banned && !reason) throw new McpToolError("اذكر سبب الحظر الموثق");
    const user = await prisma.user.update({
      where: { id: target.id },
      data: { banned, banReason: banned ? reason || "مخالفة أدب الحوار" : null },
    });
    await writeAudit({
      adminId: null,
      action: banned ? "mcp.user_banned" : "mcp.user_unbanned",
      entity: "User",
      entityId: target.id,
      meta: { via: "gemini-spark-mcp", user: label, reason: banned ? user.banReason : null },
      ip: meta.ip,
    });
    return {
      updated: true,
      user: { id: user.id, displayName: label, banned: user.banned, banReason: user.banReason },
    };
  }

  if (action === "adjust_impact") {
    const delta = Math.floor(num(args, "delta") ?? 0);
    const reason = str(args, "reason") ?? "";
    if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 5000) {
      throw new McpToolError("قيمة النقاط غير صالحة — من ±1 إلى ±5000");
    }
    if (reason.length < 3) {
      throw new McpToolError("اذكر سبب التعديل — يُوثَّق في سجل الأثر");
    }
    const result = await awardImpact({
      userId: target.id,
      actionType: "ADMIN_ADJUST",
      points: delta,
      reason,
    });
    if (!result.awarded && result.reason === "INVALID") {
      throw new McpToolError("تعذر المنح — المستخدم غير موجود");
    }
    await writeAudit({
      adminId: null,
      action: delta > 0 ? "mcp.impact_granted" : "mcp.impact_deducted",
      entity: "User",
      entityId: target.id,
      meta: { via: "gemini-spark-mcp", user: label, delta, reason, newScore: result.impactScore, newRank: result.rank },
      ip: meta.ip,
    });
    return {
      adjusted: result.awarded,
      user: { id: target.id, displayName: label },
      delta,
      impactScore: result.impactScore,
      rank: result.rank,
      rankUp: result.rankUp,
    };
  }

  if (action === "reset_identity") {
    if (!target.customName && !target.customImage) {
      throw new McpToolError("لا هوية مخصصة لتصفيرها — الحساب على حالته الأصلية");
    }
    await prisma.user.update({
      where: { id: target.id },
      data: { customName: null, customImage: null, bio: null },
    });
    await writeAudit({
      adminId: null,
      action: "mcp.user_identity_reset",
      entity: "User",
      entityId: target.id,
      meta: { via: "gemini-spark-mcp", user: label },
      ip: meta.ip,
    });
    return { reset: true, user: { id: target.id, displayName: label } };
  }

  if (action === "list_logins") {
    const [accounts, sessionCount] = await Promise.all([
      prisma.account.findMany({
        where: { userId: target.id },
        select: {
          provider: true,
          providerAccountId: true,
          type: true,
          scope: true,
          expires_at: true,
        },
      }),
      prisma.session.count({
        where: { userId: target.id, expires: { gt: new Date() } },
      }),
    ]);
    return {
      user: { id: target.id, displayName: label },
      linkedAccounts: accounts.map((a) => ({
        provider: a.provider,
        providerAccountId: a.providerAccountId,
        type: a.type,
        scope: a.scope ?? null,
        tokenExpiresAt: a.expires_at ? new Date(a.expires_at * 1000) : null,
      })),
      activeSiteSessions: sessionCount,
    };
  }

  if (action === "revoke_logins") {
    const removed = await prisma.session.deleteMany({ where: { userId: target.id } });
    await writeAudit({
      adminId: null,
      action: "mcp.user_logins_revoked",
      entity: "User",
      entityId: target.id,
      meta: { via: "gemini-spark-mcp", user: label, removed: removed.count },
      ip: meta.ip,
    });
    return {
      revoked: true,
      removedSessions: removed.count,
      user: { id: target.id, displayName: label },
    };
  }

  throw new McpToolError(`فعل غير معروف: «${action}»`);
}

/* ============================ القنوات الخاصة والحوكمة ============================ */

async function listAndHandleProposals(args: McpArgs, meta: McpRequestMeta) {
  const action = str(args, "action") ?? "list";

  if (action === "list") {
    const limit = Math.min(num(args, "limit") ?? 30, 100);
    const proposals = await prisma.userProposal.findMany({
      orderBy: [{ handled: "asc" }, { createdAt: "desc" }],
      take: limit,
      include: {
        user: {
          select: { name: true, email: true, customName: true, impactScore: true, intellectualRank: true },
        },
      },
    });
    return {
      count: proposals.length,
      proposals: proposals.map((p) => ({
        id: p.id,
        title: p.title,
        content: p.content,
        handled: p.handled,
        createdAt: p.createdAt,
        author: p.user
          ? {
              name: p.user.customName ?? p.user.name,
              email: p.user.email,
              rank: p.user.intellectualRank,
              impactScore: p.user.impactScore,
            }
          : null,
      })),
    };
  }

  const id = str(args, "id");
  if (!id) throw new McpToolError(`معرف المقترح إلزامي للفعل «${action}»`);
  const handled = action === "handle";
  await prisma.userProposal.update({ where: { id }, data: { handled } });
  await writeAudit({
    adminId: null,
    action: handled ? "mcp.proposal_handled" : "mcp.proposal_reopened",
    entity: "UserProposal",
    entityId: id,
    meta: { via: "gemini-spark-mcp" },
    ip: meta.ip,
  });
  return { updated: true, id, handled };
}

async function manageContactMessages(args: McpArgs, meta: McpRequestMeta) {
  const action = str(args, "action") ?? "list";

  if (action === "list") {
    const limit = Math.min(num(args, "limit") ?? 30, 100);
    const archived = bool(args, "archived");
    const messages = await prisma.contactMessage.findMany({
      where: typeof archived === "boolean" ? { archived } : {},
      orderBy: [{ read: "asc" }, { createdAt: "desc" }],
      take: limit,
    });
    return { count: messages.length, messages };
  }

  const id = str(args, "id");
  if (!id) throw new McpToolError(`معرف الرسالة إلزامي للفعل «${action}»`);

  if (action === "delete") {
    await prisma.contactMessage.delete({ where: { id } });
    await writeAudit({
      adminId: null,
      action: "mcp.message_deleted",
      entity: "ContactMessage",
      entityId: id,
      meta: { via: "gemini-spark-mcp" },
      ip: meta.ip,
    });
    return { deleted: true, id };
  }

  const data: Record<string, unknown> = {};
  if (action === "mark_read") data.read = true;
  if (action === "mark_unread") data.read = false;
  if (action === "archive") data.archived = true;
  if (action === "unarchive") data.archived = false;
  if (Object.keys(data).length === 0) throw new McpToolError(`فعل غير معروف: «${action}»`);

  const message = await prisma.contactMessage.update({ where: { id }, data: data as never });
  return { updated: true, message: { id: message.id, read: message.read, archived: message.archived } };
}

const LEGAL_SLUGS = ["privacy", "terms", "dialogue-ethics"] as const;
const LEGAL_TITLES: Record<string, string> = {
  privacy: "سياسة الخصوصية",
  terms: "شروط الاستخدام",
  "dialogue-ethics": "أخلاقيات الحوار والتعليق",
};

async function manageLegalPages(args: McpArgs, meta: McpRequestMeta) {
  const action = str(args, "action") ?? "list";

  if (action === "list") {
    const pages = await prisma.legalPage.findMany({
      where: { slug: { in: [...LEGAL_SLUGS] } },
      orderBy: { slug: "asc" },
    });
    return { count: pages.length, pages };
  }

  const slug = str(args, "slug") ?? "";
  if (!LEGAL_SLUGS.includes(slug as (typeof LEGAL_SLUGS)[number])) {
    throw new McpToolError("صفحة غير معروفة — المسموح: privacy أو terms أو dialogue-ethics");
  }
  const content = str(args, "content");
  if (!content) throw new McpToolError("محتوى الصفحة إلزامي");

  const page = await prisma.legalPage.upsert({
    where: { slug },
    update: {
      title: str(args, "title") || LEGAL_TITLES[slug],
      content: content.slice(0, 60_000),
    },
    create: {
      slug,
      title: str(args, "title") || LEGAL_TITLES[slug],
      content: content.slice(0, 60_000),
    },
  });

  await writeAudit({
    adminId: null,
    action: "mcp.legal_page_updated",
    entity: "LegalPage",
    entityId: page.id,
    meta: { via: "gemini-spark-mcp", slug },
    ip: meta.ip,
  });

  await revalidatePublicPaths([
    slug === "privacy" ? "/privacy" : slug === "terms" ? "/terms" : "/dialogue-ethics",
  ]);
  return { updated: true, page: { id: page.id, slug: page.slug, title: page.title, updatedAt: page.updatedAt } };
}

async function manageCommentFeatures(args: McpArgs, meta: McpRequestMeta) {
  const action = str(args, "action");
  const commentId = str(args, "commentId");
  if (!action || !commentId) throw new McpToolError("الفعل ومعرف التعليق إلزاميان");

  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    include: {
      user: { select: { id: true, banned: true } },
      article: { select: { id: true, slug: true, title: true } },
    },
  });
  if (!comment) throw new McpToolError(`لا يوجد تعليق بالمعرف «${commentId}»`);

  if (action === "inspire" || action === "uninspire") {
    if (action === "inspire") {
      if (!comment.userId || comment.user?.banned) {
        throw new McpToolError("التمييز للتعليقات المسجلة بحساب نشط فقط");
      }
      await prisma.comment.update({ where: { id: commentId }, data: { isInspiring: true } });
      const award = await awardImpact({
        userId: comment.userId,
        actionType: "COMMENT_INSPIRING",
        points: IMPACT_POINTS.COMMENT_INSPIRING,
        articleId: comment.articleId,
        dedupKey: `INSPIRE:${comment.id}`,
        reason: `تمييز تعليقه عن «${comment.article.title}» (عبر Spark)`,
      });
      await prisma.userNotification
        .create({
          data: {
            userId: comment.userId,
            title: "تعليقك حاز تمييز «فكري ملهم» ✦",
            body: `ميّز فريق التحرير تعليقك عن «${comment.article.title}» ومنحك +${IMPACT_POINTS.COMMENT_INSPIRING} رصيد أثر، وثبّته أعلى حوار المقال.`,
            url: `/article/${comment.article.slug}`,
            kind: "TARGETED",
          },
        })
        .catch(() => {});
      void pushUsers(
        {
          title: "تعليقك حاز تمييز «فكري ملهم» ✦",
          body: `+${IMPACT_POINTS.COMMENT_INSPIRING} رصيد أثر — وتعليقك مثبَّت أعلى حوار المقال`,
          url: `/article/${comment.article.slug}`,
          tag: "inspiring-comment",
        },
        { userIds: [comment.userId] },
      );
      await writeAudit({
        adminId: null,
        action: "mcp.comment_inspiring",
        entity: "Comment",
        entityId: commentId,
        meta: { via: "gemini-spark-mcp", awarded: award.awarded, points: IMPACT_POINTS.COMMENT_INSPIRING },
        ip: meta.ip,
      });
      await revalidateArticlePaths(comment.article.slug);
      return {
        inspiring: true,
        awarded: award.awarded,
        impactScore: award.impactScore,
        rank: award.rank,
        article: comment.article,
      };
    }

    await prisma.comment.update({ where: { id: commentId }, data: { isInspiring: false } });
    await writeAudit({
      adminId: null,
      action: "mcp.comment_uninspiring",
      entity: "Comment",
      entityId: commentId,
      meta: { via: "gemini-spark-mcp" },
      ip: meta.ip,
    });
    await revalidateArticlePaths(comment.article.slug);
    return { inspiring: false, article: comment.article };
  }

  if (action === "edit") {
    const content = str(args, "content");
    if (!content) throw new McpToolError("النص الجديد للتعليق إلزامي");
    await prisma.comment.update({
      where: { id: commentId },
      data: { content: content.trim(), editedByAdmin: true },
    });
    await writeAudit({
      adminId: null,
      action: "mcp.comment_edited",
      entity: "Comment",
      entityId: commentId,
      meta: { via: "gemini-spark-mcp", articleSlug: comment.article.slug },
      ip: meta.ip,
    });
    await revalidateArticlePaths(comment.article.slug);
    return { edited: true, commentId, article: comment.article };
  }

  /* ban_author — حظر كاتب التعليق نهائيًا ورفض تعليقاته المعلقة */
  if (!comment.userId) {
    throw new McpToolError("التعليق من زائر غير مسجل — احذفه عبر list_and_moderate_comments");
  }
  const banReason = str(args, "banReason") || "مخالفة أدب الحوار والقيم";
  await prisma.user.update({
    where: { id: comment.userId },
    data: { banned: true, banReason },
  });
  await prisma.comment.updateMany({
    where: { userId: comment.userId, status: "PENDING" },
    data: { status: "REJECTED" },
  });
  await raiseAlert({
    type: "USER_BANNED",
    severity: "INFO",
    message: `حُظر مستخدم نهائيًا عبر Spark: ${comment.userId}`,
    meta: { commentId, via: "gemini-spark-mcp" },
  });
  await writeAudit({
    adminId: null,
    action: "mcp.user_banned",
    entity: "User",
    entityId: comment.userId,
    meta: { via: "gemini-spark-mcp", reason: banReason, commentId },
    ip: meta.ip,
  });
  await revalidateArticlePaths(comment.article.slug);
  return { banned: true, userId: comment.userId, reason: banReason, article: comment.article };
}

/* ============================ البث والإشعارات ============================ */

const BROADCAST_KINDS = ["FEATURE", "MAINTENANCE", "INTELLECTUAL", "ALERT"] as const;

type BroadcastKind = (typeof BROADCAST_KINDS)[number];

async function broadcastNotification(args: McpArgs, meta: McpRequestMeta) {
  const action = str(args, "action") ?? "send";

  if (action === "list_updates") {
    const limit = Math.min(num(args, "limit") ?? 12, 50);
    const updates = await prisma.platformUpdate.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return { count: updates.length, updates };
  }

  if (action === "delete_update") {
    const id = str(args, "id");
    if (!id) throw new McpToolError("معرف سجل التحديث إلزامي");
    await prisma.platformUpdate.delete({ where: { id } });
    await writeAudit({
      adminId: null,
      action: "mcp.platform_update_deleted",
      entity: "PlatformUpdate",
      entityId: id,
      meta: { via: "gemini-spark-mcp" },
      ip: meta.ip,
    });
    return { deleted: true, id };
  }

  /* send — البث الجماهيري أو الإشعار المخصص */
  const title = str(args, "title") ?? "";
  const details = str(args, "details") ?? "";
  const url = str(args, "url") || null;
  const kind: BroadcastKind = BROADCAST_KINDS.includes(str(args, "kind") as BroadcastKind)
    ? (str(args, "kind") as BroadcastKind)
    : "FEATURE";
  const asPlatformUpdate = bool(args, "asPlatformUpdate") === true;
  const sendInApp = bool(args, "sendInApp") !== false;
  const sendPush = bool(args, "sendPush") !== false;
  const targetUserId = str(args, "targetUserId") || null;

  if (title.length < 3 || details.length < 3) {
    throw new McpToolError("العنوان والتفاصيل حقلان إلزاميان (3 أحرف على الأقل لكل منهما)");
  }
  if (!sendInApp && !sendPush) {
    throw new McpToolError("اختر قناة إرسال واحدة على الأقل: sendInApp أو sendPush");
  }

  if (targetUserId) {
    const exists = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true } });
    if (!exists) throw new McpToolError(`المستخدم المستهدف غير موجود: «${targetUserId}»`);
  }

  /* 1) التوثيق في سجل تحديثات المنصة إن طُلب */
  let updateId: string | null = null;
  if (asPlatformUpdate) {
    const update = await prisma.platformUpdate.create({
      data: { title: title.slice(0, 200), details: details.slice(0, 5000), kind },
    });
    updateId = update.id;
  }

  /* 2) المستهدفون — الجميع غير المحظورين أو مستخدم بعينه */
  const targetIds = targetUserId
    ? [targetUserId]
    : (await prisma.user.findMany({ where: { banned: false }, select: { id: true } })).map((u) => u.id);

  const notificationKind = targetUserId ? "TARGETED" : asPlatformUpdate ? "UPDATE" : "BROADCAST";

  /* 3) الجرس الداخلي */
  let inAppSent = 0;
  if (sendInApp && targetIds.length > 0) {
    await prisma.userNotification.createMany({
      data: targetIds.map((userId) => ({
        userId,
        title: title.slice(0, 200),
        body: details.slice(0, 2000),
        url,
        kind: notificationKind,
        updateId,
      })),
    });
    inAppSent = targetIds.length;
  }

  /* 4) إشعار الويب الفوري — فشله لا يعطل البث أبدًا */
  let pushSent = 0;
  if (sendPush && targetIds.length > 0) {
    pushSent = await pushUsers(
      {
        title: title.slice(0, 120),
        body: details.slice(0, 180),
        url: url ?? "/",
        tag: `platform-${kind.toLowerCase()}`,
      },
      { userIds: targetIds },
    );
  }

  await writeAudit({
    adminId: null,
    action: "mcp.broadcast_sent",
    entity: updateId ? "PlatformUpdate" : "UserNotification",
    entityId: updateId,
    meta: {
      via: "gemini-spark-mcp",
      title: title.slice(0, 100),
      kind,
      target: targetUserId ? "user" : "all",
      recipients: targetIds.length,
      inApp: inAppSent,
      push: pushSent,
      asPlatformUpdate,
    },
    ip: meta.ip,
  });

  return {
    sent: true,
    recipients: targetIds.length,
    inApp: inAppSent,
    push: pushSent,
    updateId,
    kind,
  };
}

/* ============================ الإعدادات السيادية ============================ */

async function manageSystemSettings(args: McpArgs, meta: McpRequestMeta) {
  const action = str(args, "action") ?? "get";

  if (action === "get") {
    const settings = await getSystemSettings();
    return { settings, keys: ["AUTO_APPROVE_COMMENTS", "REQUIRE_CHECKLIST"] };
  }

  if (action === "get_checklist") {
    const items = await getChecklist();
    return { count: items.length, items };
  }

  if (action === "set_checklist") {
    const raw = args["items"];
    if (!Array.isArray(raw)) throw new McpToolError("مرّر items قائمة نصوص البنود الجديدة");
    const texts = raw.map(String).map((t) => t.trim()).filter((t) => t.length > 0);
    if (texts.length < 3 || texts.length > 12) {
      throw new McpToolError("عدد البنود يجب أن يكون من 3 إلى 12");
    }
    await saveChecklist(texts.map((text, i) => ({ id: `c${i + 1}`, text })));
    await writeAudit({
      adminId: null,
      action: "mcp.checklist_updated",
      entity: "SystemSetting",
      entityId: "quality_checklist",
      meta: { via: "gemini-spark-mcp", count: texts.length },
      ip: meta.ip,
    });
    return { saved: true, count: texts.length, items: texts.map((text, i) => ({ id: `c${i + 1}`, text })) };
  }

  /* set — تغيير مفاتيح الحوكمة */
  const autoApprove = bool(args, "autoApproveComments");
  const requireChecklist = bool(args, "requireChecklist");
  if (autoApprove === undefined && requireChecklist === undefined) {
    throw new McpToolError("مرّر autoApproveComments أو requireChecklist للتغيير");
  }
  const patch: Record<string, boolean> = {};
  if (autoApprove !== undefined) patch.AUTO_APPROVE_COMMENTS = autoApprove;
  if (requireChecklist !== undefined) patch.REQUIRE_CHECKLIST = requireChecklist;
  const saved = await saveSystemSettings(patch);
  await writeAudit({
    adminId: null,
    action: "mcp.settings_updated",
    entity: "SystemSetting",
    entityId: "system_settings",
    meta: { via: "gemini-spark-mcp", patch },
    ip: meta.ip,
  });
  return { saved: true, settings: saved };
}

/* ============================ الأمن والنبض الحي ============================ */

async function manageSecurity(args: McpArgs, meta: McpRequestMeta) {
  const action = str(args, "action") ?? "overview";

  if (action === "overview") {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [alerts, failedAttempts24h, recentAttempts, ipRules, auditLogs, trustedDevices, unresolved] =
      await Promise.all([
        prisma.securityAlert.findMany({ orderBy: [{ resolved: "asc" }, { createdAt: "desc" }], take: 30 }),
        prisma.loginAttempt.count({ where: { success: false, createdAt: { gte: dayAgo } } }),
        prisma.loginAttempt.findMany({ orderBy: { createdAt: "desc" }, take: 15 }),
        prisma.ipRule.findMany({ orderBy: { createdAt: "desc" } }),
        prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
        prisma.trustedDevice.count(),
        prisma.securityAlert.count({ where: { resolved: false } }),
      ]);
    return {
      summary: {
        unresolvedAlerts: unresolved,
        failedLogins24h: failedAttempts24h,
        ipRules: ipRules.length,
        trustedDevices,
      },
      alerts,
      recentLoginAttempts: recentAttempts,
      ipRules,
      recentAuditLogs: auditLogs.map((l) => ({
        id: l.id,
        action: l.action,
        entity: l.entity,
        entityId: l.entityId,
        meta: l.meta,
        ip: l.ip,
        createdAt: l.createdAt,
      })),
    };
  }

  if (action === "resolve_alert") {
    const alertId = str(args, "alertId");
    if (!alertId) throw new McpToolError("معرف التنبيه إلزامي");
    await prisma.securityAlert.update({ where: { id: alertId }, data: { resolved: true } });
    await writeAudit({
      adminId: null,
      action: "mcp.alert_resolved",
      entity: "SecurityAlert",
      entityId: alertId,
      meta: { via: "gemini-spark-mcp" },
      ip: meta.ip,
    });
    return { resolved: true, alertId };
  }

  if (action === "add_ip_rule") {
    const ip = str(args, "ip") ?? "";
    if (!ip || !/^[0-9a-fA-F.:]{3,45}$/.test(ip)) {
      throw new McpToolError("عنوان IP غير صالح");
    }
    const mode = str(args, "mode") === "ALLOW" ? "ALLOW" : "DENY";
    const rule = await prisma.ipRule.upsert({
      where: { ip },
      update: { mode, note: str(args, "note") || null },
      create: { ip, mode, note: str(args, "note") || null },
    });
    await writeAudit({
      adminId: null,
      action: `mcp.ip_${mode.toLowerCase()}`,
      entity: "IpRule",
      entityId: rule.id,
      meta: { via: "gemini-spark-mcp", ip },
      ip: meta.ip,
    });
    return { saved: true, rule };
  }

  if (action === "remove_ip_rule") {
    const ruleId = str(args, "ruleId");
    const ip = str(args, "ip");
    if (!ruleId && !ip) throw new McpToolError("مرّر ruleId أو ip للإزالة");
    const removed = await prisma.ipRule.deleteMany({ where: ruleId ? { id: ruleId } : { ip: ip! } });
    if (removed.count === 0) throw new McpToolError("لا توجد قاعدة مطابقة");
    await writeAudit({
      adminId: null,
      action: "mcp.ip_rule_removed",
      entity: "IpRule",
      entityId: ruleId ?? ip!,
      meta: { via: "gemini-spark-mcp", ip: ip ?? null },
      ip: meta.ip,
    });
    return { removed: true, count: removed.count };
  }

  if (action === "list_auth_tokens") {
    const tokens = await prisma.verificationToken.findMany();
    return {
      count: tokens.length,
      note: "رموز التحقق المؤقتة لتدفقات بريد Auth.js — المنصة تدخل عبر Google أو كلمة المرور فلا يُتوقع أن يحوي هذا الجدول شيئًا؛ وجود سجلات يعني محاولة تدفق غريب.",
      tokens: tokens.map((t) => ({ identifier: t.identifier, tokenHint: t.token.slice(0, 8) + "…", expiresAt: t.expires })),
    };
  }

  if (action === "purge_auth_tokens") {
    const expiredOnly = args["expiredOnly"] !== false;
    const removed = await prisma.verificationToken.deleteMany(
      expiredOnly ? { where: { expires: { lt: new Date() } } } : undefined
    );
    await writeAudit({
      adminId: null,
      action: "mcp.auth_tokens_purged",
      entity: "VerificationToken",
      entityId: "*",
      meta: { via: "gemini-spark-mcp", expiredOnly, count: removed.count },
      ip: meta.ip,
    });
    return { purged: true, count: removed.count, expiredOnly };
  }

  throw new McpToolError(`فعل غير معروف: «${action}»`);
}

async function getLiveActivity(args: McpArgs) {
  const type = str(args, "type");
  const hours = Math.max(num(args, "hours") ?? 24, 1);
  const limit = Math.min(num(args, "limit") ?? 30, 100);
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const where: Prisma.AuditEventWhereInput = {
    createdAt: { gte: since },
    ...(type ? { type } : {}),
  };

  const [total, events] = await prisma.$transaction([
    prisma.auditEvent.count({ where }),
    prisma.auditEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
  ]);

  return { total, count: events.length, windowHours: hours, events };
}

/* ============================ أتمتة التغطية الكاملة — كل ذرة في المنصة ============================ */

async function deleteCategory(args: McpArgs, meta: McpRequestMeta) {
  const id = str(args, "id");
  const slug = str(args, "slug");
  if (!id && !slug) throw new McpToolError("مرر id أو slug للقسم");
  const section = await prisma.section.findFirst({
    where: id ? { id } : { slug: slug! },
    include: { _count: { select: { articles: true } } },
  });
  if (!section) throw new McpToolError("لا يوجد قسم بهذا المعرف");

  const reassignToSlug = str(args, "reassignToSlug");
  let reassigned = 0;
  if (reassignToSlug) {
    if (reassignToSlug === section.slug) {
      throw new McpToolError("لا يمكن نقل المقالات إلى القسم ذاته المطلوب حذفه");
    }
    const target = await prisma.section.findUnique({ where: { slug: reassignToSlug }, select: { id: true } });
    if (!target) throw new McpToolError(`لا يوجد قسم وجهة بالمعرف «${reassignToSlug}»`);
    const moved = await prisma.article.updateMany({
      where: { sectionId: section.id },
      data: { sectionId: target.id },
    });
    reassigned = moved.count;
  }

  await prisma.section.delete({ where: { id: section.id } });
  await revalidatePublicPaths(["/"], undefined, true);
  await writeAudit({
    adminId: null,
    action: "mcp.section_deleted",
    entity: "Section",
    entityId: section.id,
    meta: { via: "gemini-spark-mcp", slug: section.slug, reassigned },
    ip: meta.ip,
  });
  return {
    deleted: true,
    section: { id: section.id, slug: section.slug, name: section.name },
    reassignedArticles: reassigned,
  };
}

async function managePlatformErrors(args: McpArgs, meta: McpRequestMeta) {
  const action = str(args, "action") ?? "list";

  if (action === "list") {
    const path = str(args, "path");
    const limit = Math.min(num(args, "limit") ?? 30, 100);
    const where: Prisma.ErrorReportWhereInput = { ...(path ? { path } : {}) };
    const [total, reports] = await Promise.all([
      prisma.errorReport.count({ where }),
      prisma.errorReport.findMany({ where, orderBy: { lastSeenAt: "desc" }, take: limit }),
    ]);
    return {
      total,
      count: reports.length,
      totalOccurrences: reports.reduce((s, r) => s + r.count, 0),
      reports,
    };
  }

  if (action === "delete") {
    const digest = str(args, "digest");
    if (!digest) throw new McpToolError("بصمة الخطأ digest إلزامية للفعل delete");
    const removed = await prisma.errorReport.deleteMany({ where: { digest } });
    if (removed.count === 0) throw new McpToolError("لا يوجد سجل خطأ بهذه البصمة");
    await writeAudit({
      adminId: null,
      action: "mcp.error_report_deleted",
      entity: "ErrorReport",
      entityId: digest,
      meta: { via: "gemini-spark-mcp" },
      ip: meta.ip,
    });
    return { deleted: true, digest };
  }

  if (action === "clear_all") {
    const removed = await prisma.errorReport.deleteMany({});
    await writeAudit({
      adminId: null,
      action: "mcp.error_reports_cleared",
      entity: "ErrorReport",
      entityId: null,
      meta: { via: "gemini-spark-mcp", removed: removed.count },
      ip: meta.ip,
    });
    return { cleared: true, removed: removed.count };
  }

  throw new McpToolError(`فعل غير معروف: «${action}»`);
}

async function listImpactLedger(args: McpArgs) {
  const userId = str(args, "userId");
  const actionType = str(args, "actionType");
  const limit = Math.min(num(args, "limit") ?? 40, 100);
  const offset = Math.max(num(args, "offset") ?? 0, 0);
  const where: Prisma.ImpactLogWhereInput = {
    ...(userId ? { userId } : {}),
    ...(actionType ? { actionType } : {}),
  };
  const [total, entries] = await prisma.$transaction([
    prisma.impactLog.count({ where }),
    prisma.impactLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        user: { select: { customName: true, name: true, intellectualRank: true } },
        article: { select: { slug: true, title: true } },
      },
    }),
  ]);
  return {
    total,
    count: entries.length,
    entries: entries.map((e) => ({
      id: e.id,
      actionType: e.actionType,
      points: e.points,
      reason: e.reason,
      dedupKey: e.dedupKey,
      createdAt: e.createdAt,
      user: e.user
        ? { name: e.user.customName ?? e.user.name, rank: e.user.intellectualRank }
        : null,
      article: e.article,
    })),
  };
}

async function manageSocialGraph(args: McpArgs, meta: McpRequestMeta) {
  const action = str(args, "action") ?? "list";
  const articleId = str(args, "articleId");
  const userId = str(args, "userId");
  const limit = Math.min(num(args, "limit") ?? 40, 100);

  if (action === "list") {
    const [votes, shares, saved] = await Promise.all([
      prisma.interaction.findMany({
        where: { ...(articleId ? { articleId } : {}), ...(userId ? { userId } : {}) },
        orderBy: { createdAt: "desc" },
        take: limit,
        include: {
          article: { select: { slug: true, title: true } },
          user: { select: { customName: true, name: true } },
        },
      }),
      prisma.socialShare.findMany({
        where: articleId ? { articleId } : {},
        orderBy: { createdAt: "desc" },
        take: limit,
        include: { article: { select: { slug: true, title: true } } },
      }),
      prisma.savedArticle.findMany({
        where: { ...(articleId ? { articleId } : {}), ...(userId ? { userId } : {}) },
        orderBy: { createdAt: "desc" },
        take: limit,
        include: {
          article: { select: { slug: true, title: true } },
          user: { select: { customName: true, name: true } },
        },
      }),
    ]);
    return {
      votes: votes.map((v) => ({
        id: v.id,
        value: v.value,
        createdAt: v.createdAt,
        actor: v.user ? { name: v.user.customName ?? v.user.name } : { visitorFp: v.visitorFp },
        article: v.article,
      })),
      shares: shares.map((s) => ({
        id: s.id,
        platform: s.platform,
        quoteLen: s.quoteLen,
        createdAt: s.createdAt,
        article: s.article,
      })),
      saved: saved.map((s) => ({
        id: s.id,
        createdAt: s.createdAt,
        user: s.user ? { name: s.user.customName ?? s.user.name } : null,
        article: s.article,
      })),
    };
  }

  if (action === "remove") {
    const kind = str(args, "kind");
    const recordId = str(args, "recordId");
    if (!kind || !recordId) throw new McpToolError("kind وrecordId إلزاميان للفعل remove");
    if (kind === "votes") {
      const removed = await prisma.interaction.delete({ where: { id: recordId } });
      await writeAudit({
        adminId: null,
        action: "mcp.interaction_removed",
        entity: "Interaction",
        entityId: recordId,
        meta: { via: "gemini-spark-mcp", article: removed.articleId, value: removed.value },
        ip: meta.ip,
      });
      return { removed: true, kind, recordId };
    }
    if (kind === "shares") {
      await prisma.socialShare.delete({ where: { id: recordId } });
      await writeAudit({
        adminId: null,
        action: "mcp.share_removed",
        entity: "SocialShare",
        entityId: recordId,
        meta: { via: "gemini-spark-mcp" },
        ip: meta.ip,
      });
      return { removed: true, kind, recordId };
    }
    if (kind === "saved") {
      await prisma.savedArticle.delete({ where: { id: recordId } });
      await writeAudit({
        adminId: null,
        action: "mcp.saved_removed",
        entity: "SavedArticle",
        entityId: recordId,
        meta: { via: "gemini-spark-mcp" },
        ip: meta.ip,
      });
      return { removed: true, kind, recordId };
    }
    throw new McpToolError(`نوع غير معروف: «${kind}»`);
  }

  throw new McpToolError(`فعل غير معروف: «${action}»`);
}

async function manageReadingData(args: McpArgs, meta: McpRequestMeta) {
  const action = str(args, "action") ?? "list";

  if (action === "list") {
    const articleId = str(args, "articleId");
    const path = str(args, "path");
    const visitorFp = str(args, "visitorFp");
    const completedOnly = bool(args, "completedOnly") === true;
    const limit = Math.min(num(args, "limit") ?? 40, 100);
    const offset = Math.max(num(args, "offset") ?? 0, 0);
    const where: Prisma.PageViewWhereInput = {
      ...(articleId ? { articleId } : {}),
      ...(path ? { path } : {}),
      ...(visitorFp ? { visitorFp } : {}),
      ...(completedOnly ? { completed: true } : {}),
    };
    const [total, views] = await prisma.$transaction([
      prisma.pageView.count({ where }),
      prisma.pageView.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: { article: { select: { slug: true, title: true } } },
      }),
    ]);
    return { total, count: views.length, views };
  }

  if (action === "delete") {
    const id = str(args, "id");
    const visitorFp = str(args, "visitorFp");
    const articleId = str(args, "articleId");
    if (!id && !visitorFp && !articleId) {
      throw new McpToolError("مرر id أو visitorFp (حق النسيان) أو articleId للفعل delete");
    }
    const removed = await prisma.pageView.deleteMany({
      where: id ? { id } : visitorFp ? { visitorFp } : { articleId: articleId! },
    });
    if (removed.count === 0) throw new McpToolError("لا توجد سجلات مطابقة للحذف");
    await writeAudit({
      adminId: null,
      action: "mcp.pageviews_deleted",
      entity: "PageView",
      entityId: id ?? visitorFp ?? articleId,
      meta: { via: "gemini-spark-mcp", removed: removed.count },
      ip: meta.ip,
    });
    return { deleted: true, removed: removed.count };
  }

  throw new McpToolError(`فعل غير معروف: «${action}»`);
}

async function manageNotificationsInbox(args: McpArgs, meta: McpRequestMeta) {
  const action = str(args, "action") ?? "list";

  if (action === "list") {
    const userId = str(args, "userId");
    const unreadOnly = bool(args, "unreadOnly") === true;
    const limit = Math.min(num(args, "limit") ?? 40, 100);
    const where: Prisma.UserNotificationWhereInput = {
      ...(userId ? { userId } : {}),
      ...(unreadOnly ? { readAt: null } : {}),
    };
    const [total, notifications] = await prisma.$transaction([
      prisma.userNotification.count({ where }),
      prisma.userNotification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        include: { user: { select: { customName: true, name: true, email: true } } },
      }),
    ]);
    return {
      total,
      count: notifications.length,
      notifications: notifications.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        url: n.url,
        kind: n.kind,
        readAt: n.readAt,
        createdAt: n.createdAt,
        user: n.user
          ? { name: n.user.customName ?? n.user.name, email: n.user.email }
          : null,
      })),
    };
  }

  const id = str(args, "id");
  if (!id) throw new McpToolError(`معرف الإشعار إلزامي للفعل «${action}»`);
  if (action === "mark_read" || action === "mark_unread") {
    await prisma.userNotification.update({
      where: { id },
      data: { readAt: action === "mark_read" ? new Date() : null },
    });
    await writeAudit({
      adminId: null,
      action: `mcp.notification_${action}`,
      entity: "UserNotification",
      entityId: id,
      meta: { via: "gemini-spark-mcp" },
      ip: meta.ip,
    });
    return { updated: true, id, read: action === "mark_read" };
  }
  if (action === "delete") {
    await prisma.userNotification.delete({ where: { id } });
    await writeAudit({
      adminId: null,
      action: "mcp.notification_deleted",
      entity: "UserNotification",
      entityId: id,
      meta: { via: "gemini-spark-mcp" },
      ip: meta.ip,
    });
    return { deleted: true, id };
  }
  throw new McpToolError(`فعل غير معروف: «${action}»`);
}

async function managePushSubscriptions(args: McpArgs, meta: McpRequestMeta) {
  const action = str(args, "action") ?? "list";
  const kind = str(args, "kind") === "admin" ? "admin" : "user";

  if (action === "list") {
    const userId = str(args, "userId");
    const limit = Math.min(num(args, "limit") ?? 50, 100);
    if (kind === "admin") {
      const subs = await prisma.adminPushSubscription.findMany({
        orderBy: { lastSeenAt: "desc" },
        take: limit,
      });
      return {
        kind,
        count: subs.length,
        subscriptions: subs.map((s) => ({
          id: s.id,
          endpoint: s.endpoint,
          deviceLabel: s.deviceLabel,
          userAgent: s.userAgent,
          lastSeenAt: s.lastSeenAt,
          createdAt: s.createdAt,
        })),
      };
    }
    const subs = await prisma.userPushSubscription.findMany({
      where: userId ? { userId } : {},
      orderBy: { lastSeenAt: "desc" },
      take: limit,
      include: { user: { select: { customName: true, name: true, email: true } } },
    });
    return {
      kind,
      count: subs.length,
      subscriptions: subs.map((s) => ({
        id: s.id,
        endpoint: s.endpoint,
        userAgent: s.userAgent,
        lastSeenAt: s.lastSeenAt,
        createdAt: s.createdAt,
        user: s.user
          ? { id: s.userId, name: s.user.customName ?? s.user.name, email: s.user.email }
          : null,
      })),
    };
  }

  if (action === "remove") {
    const id = str(args, "id");
    if (!id) throw new McpToolError("معرف الاشتراك id إلزامي للفعل remove");
    if (kind === "admin") {
      await prisma.adminPushSubscription.delete({ where: { id } });
    } else {
      await prisma.userPushSubscription.delete({ where: { id } });
    }
    await writeAudit({
      adminId: null,
      action: "mcp.push_subscription_removed",
      entity: kind === "admin" ? "AdminPushSubscription" : "UserPushSubscription",
      entityId: id,
      meta: { via: "gemini-spark-mcp", kind },
      ip: meta.ip,
    });
    return { removed: true, kind, id };
  }

  throw new McpToolError(`فعل غير معروف: «${action}»`);
}

async function manageAdminAccount(args: McpArgs, meta: McpRequestMeta) {
  const action = str(args, "action") ?? "overview";

  if (action === "overview") {
    const [admins, sessions, devices] = await Promise.all([
      prisma.adminUser.findMany({
        select: {
          id: true,
          username: true,
          totpEnabled: true,
          lastLoginAt: true,
          createdAt: true,
          _count: { select: { sessions: true, devices: true } },
        },
      }),
      prisma.adminSession.findMany({
        where: { expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
        include: { admin: { select: { username: true } } },
      }),
      prisma.trustedDevice.findMany({
        orderBy: { lastSeenAt: "desc" },
        include: { admin: { select: { username: true } } },
      }),
    ]);
    return {
      admins: admins.map((a) => ({
        id: a.id,
        username: a.username,
        totpEnabled: a.totpEnabled,
        lastLoginAt: a.lastLoginAt,
        activeSessions: a._count.sessions,
        trustedDevices: a._count.devices,
      })),
      sessions: sessions.map((s) => ({
        id: s.id,
        admin: s.admin.username,
        ip: s.ip,
        userAgent: s.userAgent,
        trusted: s.trusted,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
      })),
      trustedDevices: devices.map((d) => ({
        id: d.id,
        admin: d.admin.username,
        label: d.label,
        lastIp: d.lastIp,
        lastSeenAt: d.lastSeenAt,
      })),
    };
  }

  if (action === "revoke_session") {
    const sessionId = str(args, "sessionId");
    if (!sessionId) throw new McpToolError("معرف الجلسة sessionId إلزامي");
    const removed = await prisma.adminSession.deleteMany({ where: { id: sessionId } });
    if (removed.count === 0) throw new McpToolError("لا توجد جلسة بهذا المعرف (ربما انتهت أصلًا)");
    await writeAudit({
      adminId: null,
      action: "mcp.admin_session_revoked",
      entity: "AdminSession",
      entityId: sessionId,
      meta: { via: "gemini-spark-mcp" },
      ip: meta.ip,
    });
    return { revoked: true, sessionId };
  }

  if (action === "remove_device") {
    const deviceId = str(args, "deviceId");
    if (!deviceId) throw new McpToolError("معرف الجهاز deviceId إلزامي");
    const removed = await prisma.trustedDevice.deleteMany({ where: { id: deviceId } });
    if (removed.count === 0) throw new McpToolError("لا يوجد جهاز موثوق بهذا المعرف");
    await writeAudit({
      adminId: null,
      action: "mcp.trusted_device_removed",
      entity: "TrustedDevice",
      entityId: deviceId,
      meta: { via: "gemini-spark-mcp" },
      ip: meta.ip,
    });
    return { removed: true, deviceId };
  }

  if (action === "change_password") {
    const currentPassword = str(args, "currentPassword") ?? "";
    const newPassword = str(args, "newPassword") ?? "";
    const admin = await prisma.adminUser.findFirst({
      select: { id: true, username: true, passwordHash: true },
    });
    if (!admin) throw new McpToolError("لا يوجد حساب أدمن في المنصة");
    const ok = await verifyPassword(admin.passwordHash, currentPassword);
    if (!ok) throw new McpToolError("كلمة المرور الحالية غير صحيحة — رُفض التغيير");
    const strength = validatePasswordStrength(newPassword);
    if (!strength.ok) throw new McpToolError(strength.message ?? "كلمة المرور الجديدة ضعيفة");
    const newHash = await hashPassword(newPassword);
    await prisma.$transaction([
      prisma.adminUser.update({ where: { id: admin.id }, data: { passwordHash: newHash } }),
      prisma.adminSession.deleteMany({ where: { adminId: admin.id } }),
    ]);
    await writeAudit({
      adminId: admin.id,
      action: "mcp.admin_password_changed",
      entity: "AdminUser",
      entityId: admin.id,
      meta: { via: "gemini-spark-mcp" },
      ip: meta.ip,
    });
    return {
      changed: true,
      note: "تم تغيير كلمة المرور وإبطال كل جلسات اللوحة — سجّل الدخول من جديد",
    };
  }

  throw new McpToolError(`فعل غير معروف: «${action}»`);
}

async function manageDiscussionQuota(args: McpArgs, meta: McpRequestMeta) {
  const action = str(args, "action") ?? "list";

  if (action === "list") {
    const userId = str(args, "userId");
    const articleId = str(args, "articleId");
    const limit = Math.min(num(args, "limit") ?? 40, 100);
    const where: Prisma.AiDiscussionUsageWhereInput = {
      ...(userId ? { userId } : {}),
      ...(articleId ? { articleId } : {}),
    };
    const [total, rows] = await prisma.$transaction([
      prisma.aiDiscussionUsage.count({ where }),
      prisma.aiDiscussionUsage.findMany({
        where,
        orderBy: { lastMessageAt: "desc" },
        take: limit,
        include: {
          user: { select: { customName: true, name: true, email: true } },
          article: { select: { slug: true, title: true } },
        },
      }),
    ]);
    return {
      total,
      count: rows.length,
      totalMessages: rows.reduce((s, r) => s + r.messageCount, 0),
      rows: rows.map((r) => ({
        id: r.id,
        messageCount: r.messageCount,
        lastMessageAt: r.lastMessageAt,
        user: r.user
          ? { id: r.userId, name: r.user.customName ?? r.user.name, email: r.user.email }
          : null,
        article: r.article,
      })),
    };
  }

  if (action === "reset") {
    const id = str(args, "id");
    const userId = str(args, "userId");
    const articleId = str(args, "articleId");
    if (!id && !(userId && articleId)) {
      throw new McpToolError("مرر id أو (userId وarticleId معًا) للفعل reset");
    }
    const removed = await prisma.aiDiscussionUsage.deleteMany({
      where: id ? { id } : { userId: userId!, articleId: articleId! },
    });
    if (removed.count === 0) throw new McpToolError("لا يوجد سجل حصة مطابق");
    await writeAudit({
      adminId: null,
      action: "mcp.discussion_quota_reset",
      entity: "AiDiscussionUsage",
      entityId: id ?? `${userId}:${articleId}`,
      meta: { via: "gemini-spark-mcp", removed: removed.count },
      ip: meta.ip,
    });
    return { reset: true, removed: removed.count };
  }

  throw new McpToolError(`فعل غير معروف: «${action}»`);
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
    case "list_users":
      return listUsers(args);
    case "manage_user":
      return manageUser(args, meta);
    case "list_and_handle_proposals":
      return listAndHandleProposals(args, meta);
    case "manage_contact_messages":
      return manageContactMessages(args, meta);
    case "manage_legal_pages":
      return manageLegalPages(args, meta);
    case "manage_comment_features":
      return manageCommentFeatures(args, meta);
    case "broadcast_notification":
      return broadcastNotification(args, meta);
    case "manage_system_settings":
      return manageSystemSettings(args, meta);
    case "manage_security":
      return manageSecurity(args, meta);
    case "get_live_activity":
      return getLiveActivity(args);
    case "delete_category":
      return deleteCategory(args, meta);
    case "manage_platform_errors":
      return managePlatformErrors(args, meta);
    case "list_impact_ledger":
      return listImpactLedger(args);
    case "manage_social_graph":
      return manageSocialGraph(args, meta);
    case "manage_reading_data":
      return manageReadingData(args, meta);
    case "manage_notifications_inbox":
      return manageNotificationsInbox(args, meta);
    case "manage_push_subscriptions":
      return managePushSubscriptions(args, meta);
    case "manage_admin_account":
      return manageAdminAccount(args, meta);
    case "manage_discussion_quota":
      return manageDiscussionQuota(args, meta);
    default:
      throw new McpToolError(`أداة غير معروفة: «${name}»`);
  }
}
