import { prisma } from "@/lib/prisma";
import { AnalyticsPanels } from "@/components/analytics-panels";

/**
 * لوحة تحليلات الأداء — عين الأدمن على ما يقرأه الجمهور فعليًا:
 * أكثر المقالات قراءة، توزيع تفاعل الأقسام، جغرافيا الزوار، وأنواع الأجهزة،
 * ومنحنى الزيارات يوميًا — كلها محسوبة لحظة الفتح من قاعدة البيانات الحية.
 */

export const dynamic = "force-dynamic";

type SectionRow = { name: string; color: string | null; interactions: number; likes: number; dislikes: number };
type DayRow = { day: string; views: number };

export default async function AnalyticsPage() {
  const since = new Date(Date.now() - 14 * 24 * 3600 * 1000);

  const [topArticles, sectionRaw, deviceRaw, countryRaw, dailyRaw, totals] = await Promise.all([
    prisma.article.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { views: "desc" },
      take: 10,
      select: {
        slug: true,
        title: true,
        views: true,
        completedReads: true,
        section: { select: { name: true } },
      },
    }),
    /* توزيع تفاعل الأقسام: إعجاب/عدم إعجاب مُجمَّع على مستوى القسم */
    prisma.$queryRaw<SectionRow[]>`
      SELECT s.name AS name,
             s.color AS color,
             COUNT(i.id)::int AS interactions,
             COALESCE(SUM(CASE WHEN i.value = 1 THEN 1 ELSE 0 END), 0)::int AS likes,
             COALESCE(SUM(CASE WHEN i.value = -1 THEN 1 ELSE 0 END), 0)::int AS dislikes
      FROM "Interaction" i
      JOIN "Article" a ON a.id = i."articleId"
      JOIN "Section" s ON s.id = a."sectionId"
      GROUP BY s.name, s.color
      ORDER BY interactions DESC
    `,
    prisma.pageView.groupBy({
      by: ["device"],
      _count: { _all: true },
      where: { device: { not: null } },
    }),
    prisma.pageView.groupBy({
      by: ["country"],
      _count: { _all: true },
      where: { country: { not: null } },
      orderBy: [{ _count: { country: "desc" } }],
      take: 10,
    }),
    /* منحنى الزيارات 14 يومًا */
    prisma.$queryRaw<DayRow[]>`
      SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
             COUNT(*)::int AS views
      FROM "PageView"
      WHERE "createdAt" >= ${since}
      GROUP BY 1
      ORDER BY 1
    `,
    Promise.all([
      prisma.article.aggregate({ _sum: { views: true, completedReads: true } }),
      prisma.interaction.count(),
      prisma.socialShare.count(),
      prisma.user.count(),
      prisma.loginLog.count(),
    ]),
  ]);

  /* ملء أيام الغياب في المنحنى حتى لا ينكسر الخط */
  const dailyMap = new Map(dailyRaw.map((r) => [r.day, r.views]));
  const daily: { day: string; views: number }[] = [];
  for (let i = 13; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 24 * 3600 * 1000);
    const key = d.toISOString().slice(0, 10);
    daily.push({ day: key, views: dailyMap.get(key) ?? 0 });
  }

  const [articleSums, interactionCount, shareCount, userCount, loginCount] = totals;

  return (
    <AnalyticsPanels
      totals={{
        views: articleSums._sum.views ?? 0,
        completedReads: articleSums._sum.completedReads ?? 0,
        interactions: interactionCount,
        shares: shareCount,
        users: userCount,
        logins: loginCount,
      }}
      topArticles={topArticles.map((a) => ({
        slug: a.slug,
        title: a.title,
        section: a.section?.name ?? null,
        views: a.views,
        completedReads: a.completedReads,
      }))}
      sections={sectionRaw.map((r) => ({
        name: r.name,
        color: r.color ?? "#A16A1F",
        interactions: Number(r.interactions),
        likes: Number(r.likes),
        dislikes: Number(r.dislikes),
      }))}
      devices={deviceRaw.map((d) => ({
        device: d.device ?? "غير معروف",
        count: d._count._all,
      }))}
      countries={countryRaw.map((c) => ({
        country: c.country ?? "غير معروف",
        count: c._count._all,
      }))}
      daily={daily}
    />
  );
}
