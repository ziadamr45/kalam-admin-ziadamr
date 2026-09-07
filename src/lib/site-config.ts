import { prisma } from "@/lib/prisma";

/**
 * مركز تحكم إعدادات الموقع العامة — سيادة كاملة للأدمن على كل ما يظهر للقرّاء.
 * تُخزن في SystemSetting تحت مفتاح site_config وتقرأها المنصة العامة لحظة التغيير.
 */

export type SiteConfig = {
  SITE_META_TITLE: string;
  SITE_META_DESC: string;
  FOOTER_TEXT: string;
  COMMENTS_ENABLED: boolean; // Kill Switch — إيقاف الحوار بالكامل بضغطة زر
  TASHKEEL_ENABLED: boolean; // وضع التشكيل عامًا — مع قابلية التعطيل لكل مقال
};

const DEFAULTS: SiteConfig = {
  SITE_META_TITLE: "كلام له لازمة",
  SITE_META_DESC:
    "مش كل كلام لازم يتقال.. بس فيه كلام له لازمة. منصة فكرية ومعرفية عربية: مقالات رصينة، بلا ضجيج، بلا إعلانات — كلام يستحق وقّتك.",
  FOOTER_TEXT: "نُشر بعناية.. لكلام له لازمة.",
  COMMENTS_ENABLED: true,
  TASHKEEL_ENABLED: true,
};

const KEY = "site_config";

export async function getSiteConfig(): Promise<SiteConfig> {
  try {
    const row = await prisma.systemSetting.findUnique({ where: { key: KEY } });
    if (row?.value) {
      const stored = row.value as Partial<SiteConfig>;
      return { ...DEFAULTS, ...stored };
    }
  } catch {}
  return { ...DEFAULTS };
}

export async function saveSiteConfig(next: Partial<SiteConfig>): Promise<SiteConfig> {
  const current = await getSiteConfig();
  const merged = { ...current, ...next };
  await prisma.systemSetting.upsert({
    where: { key: KEY },
    update: { value: merged as never },
    create: { key: KEY, value: merged as never },
  });
  return merged;
}
