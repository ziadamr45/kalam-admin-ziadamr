import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, isRejected } from "@/lib/guard";

/**
 * تقرير الشفافية الشامل: أحداث المنصة، الأخطاء اللحظية، وتقرير تفاعلات اليوم.
 * كل حركة في الموقع العام يطّلع عليها الأدمن هنا فورًا.
 */
export async function GET(request: Request) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  try {
    const url = new URL(request.url);
    const tab = url.searchParams.get("tab") ?? "events";
    const filter = url.searchParams.get("filter") ?? "all";

    if (tab === "errors") {
      const errors = await prisma.errorReport.findMany({
        orderBy: { lastSeenAt: "desc" },
        take: 50,
      });
      return NextResponse.json({ errors });
    }

    if (tab === "interactions") {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const [grouped, logins24h] = await Promise.all([
        prisma.interaction.groupBy({
          by: ["articleId", "value"],
          where: { createdAt: { gte: since } },
          _count: { value: true },
        }),
        prisma.auditEvent.count({
          where: { type: "AUTH_LOGIN_SUCCESS", createdAt: { gte: since } },
        }),
      ]);

      const articleIds = [...new Set(grouped.map((g) => g.articleId))];
      const articles = articleIds.length
        ? await prisma.article.findMany({
            where: { id: { in: articleIds } },
            select: { id: true, title: true, slug: true },
          })
        : [];
      const titleMap = new Map(articles.map((a) => [a.id, a]));

      const daily = grouped
        .map((g) => ({
          article: titleMap.get(g.articleId) ?? { id: g.articleId, title: "مقال محذوف", slug: "" },
          value: g.value,
          count: g._count.value,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 30);

      return NextResponse.json({
        daily,
        logins24h,
        likes24h: daily.filter((d) => d.value === 1).reduce((a, b) => a + b.count, 0),
        dislikes24h: daily.filter((d) => d.value === -1).reduce((a, b) => a + b.count, 0),
      });
    }

    /* أحداث المنصة مع فلترة */
    const where =
      filter === "auth"
        ? { type: { in: ["AUTH_LOGIN_SUCCESS", "AUTH_LOGIN_BLOCKED", "AUTH_SIGNOUT"] } }
        : filter !== "all"
          ? { type: filter }
          : {};

    const events = await prisma.auditEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json({ events });
  } catch {
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}
