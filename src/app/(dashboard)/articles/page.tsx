import { prisma } from "@/lib/prisma";
import { ArticlesTable } from "@/components/articles-table";

export const dynamic = "force-dynamic";

export default async function ArticlesPage() {
  const [articles, sections] = await Promise.all([
    prisma.article.findMany({
      orderBy: { updatedAt: "desc" },
      include: { section: { select: { name: true, slug: true } } },
    }),
    prisma.section.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  return (
    <ArticlesTable
      articles={articles.map((a) => ({
        id: a.id,
        title: a.title,
        slug: a.slug,
        status: a.status,
        sectionName: a.section?.name ?? null,
        views: a.views,
        readingTimeSec: a.readingTimeSec,
        hasAudio: Boolean(a.audioUrl),
        hasTashkeel: Boolean(a.contentWithTashkeel && a.contentWithTashkeel !== a.content),
        updatedAt: a.updatedAt.toISOString(),
        publishedAt: a.publishedAt?.toISOString() ?? null,
        scheduledAt: a.scheduledAt?.toISOString() ?? null,
      }))}
      sections={sections.map((s) => ({ id: s.id, name: s.name }))}
    />
  );
}
