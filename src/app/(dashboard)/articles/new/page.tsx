import { prisma } from "@/lib/prisma";
import { getChecklist, getSystemSettings } from "@/lib/settings";
import { ArticleEditor } from "@/components/article-editor";

export const dynamic = "force-dynamic";

export default async function NewArticlePage() {
  const [sections, checklist, settings] = await Promise.all([
    prisma.section.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    getChecklist(),
    getSystemSettings(),
  ]);

  return (
    <ArticleEditor
      mode="new"
      sections={sections.map((s) => ({ id: s.id, name: s.name }))}
      checklist={checklist}
      requireChecklist={settings.REQUIRE_CHECKLIST}
    />
  );
}
