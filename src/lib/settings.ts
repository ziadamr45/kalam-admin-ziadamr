import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * إعدادات النظام القابلة للتبديل من لوحة التحكم — مخزنة في SystemSetting
 */

export type SystemSettings = {
  AUTO_APPROVE_COMMENTS: boolean;
  REQUIRE_CHECKLIST: boolean;
};

const DEFAULTS: SystemSettings = {
  AUTO_APPROVE_COMMENTS: false, // كل التعليقات تمر بمراجعة الأدمن أولًا
  REQUIRE_CHECKLIST: true, // النشر يتطلب اجتياز قائمة الفحص الأخلاقي
};

const KEY = "system_settings";

export async function getSystemSettings(): Promise<SystemSettings> {
  try {
    const row = await prisma.systemSetting.findUnique({ where: { key: KEY } });
    if (row?.value) {
      const stored = row.value as Partial<SystemSettings>;
      return { ...DEFAULTS, ...stored };
    }
  } catch {}
  return { ...DEFAULTS };
}

export async function saveSystemSettings(next: Partial<SystemSettings>): Promise<SystemSettings> {
  const current = await getSystemSettings();
  const merged = { ...current, ...next };
  await prisma.systemSetting.upsert({
    where: { key: KEY },
    update: { value: merged as never },
    create: { key: KEY, value: merged as never },
  });
  return merged;
}

/** عناصر قائمة الفحص الأخلاقي الافتراضية — قلب معايير «له لازمة» */
export const DEFAULT_CHECKLIST = [
  "هل يضيف المقال قيمة حقيقية قابلة للإحساس أو التطبيق؟",
  "هل هو خالٍ من الحشو والتكرار والسطحية؟",
  "هل الفكرة واضحة من العنوان والمختصر دون تشتيت؟",
  "هل اللغة رصينة ومحترمة ومخالصة للقارئ؟",
  "هل يخلو مما يخالف الشريعة والقيم العربية الأصيلة؟",
  "هل النسخة المشكولة دقيقة إعرابيًا وتشكيليًا؟",
  "هل تستحق هذه الكلمات أن تكون «لازمة» يرجع إليها القارئ؟",
];

const CHECKLIST_KEY = "quality_checklist";

export type ChecklistItem = { id: string; text: string };

export async function getChecklist(): Promise<ChecklistItem[]> {
  try {
    const row = await prisma.systemSetting.findUnique({ where: { key: CHECKLIST_KEY } });
    if (row?.value && Array.isArray(row.value) && row.value.length > 0) {
      return row.value as ChecklistItem[];
    }
  } catch {}
  return DEFAULT_CHECKLIST.map((text, i) => ({ id: `c${i + 1}`, text }));
}

export async function saveChecklist(items: ChecklistItem[]): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key: CHECKLIST_KEY },
    update: { value: items as never },
    create: { key: CHECKLIST_KEY, value: items as never },
  });
}
