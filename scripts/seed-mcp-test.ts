/**
 * بذر بيانات اختبار بوابة MCP v5.1.0 على قاعدة PostgreSQL المحلية المعزولة —
 * مستخدم مالك + قارئ اختبار + مقال مسودة ومقال منشور + تعليق + أدمن بالتحقق الثنائي + سجل تحديث.
 * الاستخدام: npx tsx scripts/seed-mcp-test.ts
 */
import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";

/* PrismaClient مباشر بدل @/lib/prisma — الأخير مختوم server-only ولا يعمل خارج حزمة Next.
   وكذلك تجزئة كلمة المرور بـ Argon2id مباشرة بنفس خيارات src/lib/password.ts */
const prisma = new PrismaClient();

const ARGON2_OPTIONS = { memoryCost: 65536, timeCost: 3, parallelism: 4 } as const;
const hashPassword = (password: string) => hash(password, ARGON2_OPTIONS);

async function main() {
  const owner = await prisma.user.upsert({
    where: { email: "ziad90216@gmail.com" },
    update: { role: "OWNER", isVerified: true, banned: false },
    create: {
      email: "ziad90216@gmail.com",
      name: "زياد عمرو — مالك المنصة",
      role: "OWNER",
      isVerified: true,
      impactScore: 500,
      intellectualRank: "صاحب المنصة",
    },
  });

  const reader = await prisma.user.upsert({
    where: { email: "mcp-test-reader@example.com" },
    update: { banned: false, hasCompletedOnboarding: true },
    create: {
      email: "mcp-test-reader@example.com",
      name: "قارئ اختبار MCP",
      impactScore: 12,
    },
  });

  const section = await prisma.section.upsert({
    where: { slug: "mcp-test" },
    update: { name: "قسم اختبار MCP", active: true },
    create: { slug: "mcp-test", name: "قسم اختبار MCP", active: true },
  });

  const draft = await prisma.article.upsert({
    where: { slug: "mcp-draft-article" },
    update: { status: "DRAFT", authorIntent: "توجيه فكري سرية للاختبار: دافع عن فكرة الصبر المدروس بأسلوب هادئ." },
    create: {
      slug: "mcp-draft-article",
      title: "مقال مسودة لاختبار المحاور الذكي",
      summary: "مسودة اختبار بوابة MCP — ليست للنشر.",
      content: "هذا متن تجريبي لاختبار المحاور الذكي على المسودات.\n\nالفكرة الأولى: الصبر ليس انتظارًا سلبيًا بل قرار واعٍ بالتوقيت.\n\nالفكرة الثانية: الحدة تبيع لكنها لا تبني.",
      contentWithTashkeel: "هذا متنٌ تجريبيٌّ لاختبار المحاور الذكي على المسودات.\n\nالفكرة الأولى: الصبرُ ليس انتظارًا سلبيًّا بل قرارٌ واعٍ بالتوقيت.\n\nالفكرة الثانية: الحدةُ تبيعُ لكنها لا تبني.",
      authorIntent: "توجيه فكري سرية للاختبار: دافع عن فكرة الصبر المدروس بأسلوب هادئ.",
      status: "DRAFT",
      sectionId: section.id,
    },
  });

  const published = await prisma.article.upsert({
    where: { slug: "mcp-published-article" },
    update: { status: "PUBLISHED" },
    create: {
      slug: "mcp-published-article",
      title: "مقال منشور لاختبار التعليق الرسمي",
      summary: "مقال اختبار بوابة MCP v5.1.0.",
      content: "متن تجريبي منشور لاختبار التعليق الرسمي والإشعارات.\n\nالنقطة الأولى: الحوار الهادئ أثره أطول.",
      contentWithTashkeel: "متنٌ تجريبيٌّ منشورٌ لاختبار التعليق الرسمي والإشعارات.\n\nالنقطة الأولى: الحوارُ الهادئُ أثرُه أطول.",
      status: "PUBLISHED",
      sectionId: section.id,
      publishedAt: new Date(),
    },
  });

  const comment = await prisma.comment.upsert({
    where: { id: "mcp-test-comment-1" },
    update: { status: "APPROVED", userId: reader.id, articleId: published.id },
    create: {
      id: "mcp-test-comment-1",
      articleId: published.id,
      userId: reader.id,
      content: "تعليق القارئ التجريبي على المقال المنشور — من يستحق الرد الرسمي؟",
      status: "APPROVED",
    },
  });

  const passwordHash = await hashPassword("SuperSecret!2026");
  const admin = await prisma.adminUser.upsert({
    where: { username: "mcptest" },
    update: { totpEnabled: true, passwordHash },
    create: { username: "mcptest", passwordHash, totpEnabled: true },
  });

  const update = await prisma.platformUpdate.upsert({
    where: { id: "mcp-test-update-1" },
    update: { title: "تحديث تجريبي للتعديل", details: "نص قبل التعديل", kind: "FEATURE" },
    create: {
      id: "mcp-test-update-1",
      title: "تحديث تجريبي للتعديل",
      details: "نص قبل التعديل",
      kind: "FEATURE",
    },
  });

  console.log(
    JSON.stringify(
      {
        owner: owner.id,
        reader: reader.id,
        section: section.id,
        draft: draft.id,
        published: published.id,
        comment: comment.id,
        admin: admin.id,
        update: update.id,
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("SEED FAILED:", e);
  process.exit(1);
});
