/**
 * زرع الأقسام الأربعة — التسمية غير المألوفة
 *   npm run seed:sections
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SECTIONS = [
  { slug: "al-athar", name: "الأثر", description: "أفكار تركت أثرًا.. وتستحق أن تُطبَّق لا أن تُقرأ فقط.", sortOrder: 1 },
  { slug: "zawaya-ruya", name: "زوايا رؤية", description: "قراءة مختلفة لما نعيشه كل يوم.. من زاوية لم تنظر إليها من قبل.", sortOrder: 2 },
  { slug: "mawazeen", name: "موازين", description: "نزِن القرارات والقيم والأفكار بعينٍ صافية وميزانٍ رصين.", sortOrder: 3 },
  { slug: "afkar-liltatbeq", name: "أفكار للتطبيق", description: "أفكار عملية جاهزة للتنفيذ فورًا.. كلام يتحرك ويصنع أثرًا.", sortOrder: 4 },
];

async function main() {
  for (const section of SECTIONS) {
    await prisma.section.upsert({
      where: { slug: section.slug },
      update: { name: section.name, description: section.description, sortOrder: section.sortOrder },
      create: section,
    });
    console.log(`✓ ${section.name}`);
  }

  /* زرع قائمة الفحص الأخلاقي الافتراضية إن لم توجد */
  const checklistKey = "quality_checklist";
  const existing = await prisma.systemSetting.findUnique({ where: { key: checklistKey } });
  if (!existing) {
    await prisma.systemSetting.create({
      data: {
        key: checklistKey,
        value: [
          { id: "c1", text: "هل يضيف المقال قيمة حقيقية قابلة للإحساس أو التطبيق؟" },
          { id: "c2", text: "هل هو خالٍ من الحشو والتكرار والسطحية؟" },
          { id: "c3", text: "هل الفكرة واضحة من العنوان والمختصر دون تشتيت؟" },
          { id: "c4", text: "هل اللغة رصينة ومحترمة ومخالصة للقارئ؟" },
          { id: "c5", text: "هل يخلو مما يخالف الشريعة والقيم العربية الأصيلة؟" },
          { id: "c6", text: "هل النسخة المشكولة دقيقة إعرابيًا وتشكيليًا؟" },
          { id: "c7", text: "هل تستحق هذه الكلمات أن تكون «لازمة» يرجع إليها القارئ؟" },
        ] as never,
      },
    });
    console.log("✓ قائمة الفحص الأخلاقي (7 معايير)");
  }

  const settingsKey = "system_settings";
  const settingsExisting = await prisma.systemSetting.findUnique({ where: { key: settingsKey } });
  if (!settingsExisting) {
    await prisma.systemSetting.create({
      data: {
        key: settingsKey,
        value: { AUTO_APPROVE_COMMENTS: false, REQUIRE_CHECKLIST: true } as never,
      },
    });
    console.log("✓ الإعدادات الافتراضية (مراجعة التعليقات إلزامية + فرض قائمة الفحص)");
  }

  console.log("\nتم الزرع بنجاح — المنصة جاهزة لاستقبال أول مقال.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
