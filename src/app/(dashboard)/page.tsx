import { prisma } from "@/lib/prisma";
import { OverviewStats } from "@/components/overview-stats";

export const dynamic = "force-dynamic";

/**
 * لوحة التحليلات الحية — زيارات، قراءات متكاملة، تفاعلات، اقتباسات مشتركة
 * كل الأرقام محسوبة مباشرة من قاعدة بيانات المنصة
 */
export default async function DashboardPage() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const prevWeekStart = new Date(now.getTime() - 14 * 24 * 3600 * 1000);
  const days14 = new Date(now.getTime() - 14 * 24 * 3600 * 1000);

  const [
    visitsToday,
    visitsThisWeek,
    visitsPrevWeek,
    completedToday,
    likesTotal,
    dislikesTotal,
    commentsPending,
    sharesTotal,
    publishedCount,
    scheduledCount,
    dailyViews,
    topArticles,
    sharesByPlatform,
    recentAlerts,
    scheduledSoon,
    recentComments,
  ] = await Promise.all([
    prisma.pageView.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.pageView.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.pageView.count({
      where: { createdAt: { gte: prevWeekStart, lt: weekAgo } },
    }),
    prisma.pageView.count({ where: { createdAt: { gte: todayStart }, completed: true } }),
    prisma.interaction.count({ where: { value: 1 } }),
    prisma.interaction.count({ where: { value: -1 } }),
    prisma.comment.count({ where: { status: "PENDING" } }),
    prisma.socialShare.count(),
    prisma.article.count({ where: { status: "PUBLISHED" } }),
    prisma.article.count({ where: { status: "SCHEDULED" } }),
    prisma.$queryRaw<{ day: Date; count: bigint }[]>`
      SELECT date_trunc('day', "createdAt") AS day, COUNT(*) AS count
      FROM "PageView"
      WHERE "createdAt" >= ${days14}
      GROUP BY 1 ORDER BY 1 ASC
    `.catch(() => [] as { day: Date; count: bigint }[]),
    prisma.article.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { views: "desc" },
      take: 5,
      select: { id: true, title: true, views: true, completedReads: true },
    }).catch(() => []),
    prisma.socialShare.groupBy({
      by: ["platform"],
      _count: { platform: true },
      orderBy: { _count: { platform: "desc" } },
    }).catch(() => []),
    prisma.securityAlert.findMany({
      where: { resolved: false },
      orderBy: { createdAt: "desc" },
      take: 4,
    }),
    prisma.article.findMany({
      where: { status: "SCHEDULED", scheduledAt: { not: null } },
      orderBy: { scheduledAt: "asc" },
      take: 5,
      select: { id: true, title: true, scheduledAt: true },
    }),
    prisma.comment.findMany({
      orderBy: { createdAt: "desc" },
      take: 4,
      include: { article: { select: { title: true } }, user: { select: { name: true } } },
    }),
  ]);

  /* إعجابات لكل مقال منشور (للمخطط) */
  const topWithLikes = await Promise.all(
    (topArticles as { id: string; title: string; views: number; completedReads: number }[]).map(
      async (a) => {
        const likes = await prisma.interaction.count({
          where: { articleId: a.id, value: 1 },
        });
        return { ...a, likes };
      },
    ),
  );

  const completionRate =
    visitsThisWeek > 0 ? Math.round((completedToday / Math.max(visitsToday, 1)) * 100) : 0;

  const weeklyDelta =
    visitsPrevWeek > 0
      ? Math.round(((visitsThisWeek - visitsPrevWeek) / visitsPrevWeek) * 100)
      : visitsThisWeek > 0
        ? 100
        : 0;

  return (
    <OverviewStats
      data={{
        visitsToday,
        visitsThisWeek,
        weeklyDelta,
        completedToday,
        completionRate,
        likesTotal,
        dislikesTotal,
        commentsPending,
        sharesTotal,
        publishedCount,
        scheduledCount,
        dailyViews: dailyViews.map((d) => ({
          day: d.day.toISOString(),
          count: Number(d.count),
        })),
        topArticles: topWithLikes,
        sharesByPlatform: sharesByPlatform.map((s) => ({
          platform: s.platform,
          count: s._count.platform,
        })),
        recentAlerts: recentAlerts.map((a) => ({
          id: a.id,
          type: a.type,
          severity: a.severity,
          message: a.message,
          createdAt: a.createdAt.toISOString(),
        })),
        scheduledSoon: scheduledSoon.map((s) => ({
          id: s.id,
          title: s.title,
          scheduledAt: s.scheduledAt?.toISOString() ?? null,
        })),
        recentComments: recentComments.map((c) => ({
          id: c.id,
          content: c.content.slice(0, 140),
          article: c.article?.title ?? "",
          author: c.user?.name || "زائر",
          createdAt: c.createdAt.toISOString(),
        })),
      }}
    />
  );
}
