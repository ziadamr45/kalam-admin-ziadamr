import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getChecklist, getSystemSettings } from "@/lib/settings";
import { ArticleEditor } from "@/components/article-editor";

export const dynamic = "force-dynamic";

export default async function EditArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [article, sections, checklist, settings] = await Promise.all([
    prisma.article.findUnique({
      where: { id },
      include: { section: { select: { id: true, name: true } } },
    }),
    prisma.section.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    getChecklist(),
    getSystemSettings(),
  ]);

  if (!article) notFound();

  return (
    <ArticleEditor
      mode="edit"
      initial={{
        id: article.id,
        title: article.title,
        slug: article.slug,
        summary: article.summary,
        content: article.content,
        contentWithTashkeel: article.contentWithTashkeel,
        sectionId: article.sectionId,
        coverImage: article.coverImage,
        audioUrl: article.audioUrl,
        audioDurationSec: article.audioDurationSec,
        audioCues: (article.audioCues as { t: number; id: string }[] | null) ?? null,
        audioVoice: article.audioVoice,
        audioGeneratedAt: article.audioGeneratedAt?.toISOString() ?? null,
        audioWordsCount: Array.isArray(article.audioWords)
          ? (article.audioWords as unknown[]).length
          : 0,
        status: article.status,
        tashkeelEnabled: article.tashkeelEnabled,
        scheduledAt: article.scheduledAt?.toISOString() ?? null,
        checklistData: (article.checklistData as { items: { text: string; checked: boolean }[] } | null) ?? null,
      }}
      sections={sections.map((s) => ({ id: s.id, name: s.name }))}
      checklist={checklist}
      requireChecklist={settings.REQUIRE_CHECKLIST}
    />
  );
}
