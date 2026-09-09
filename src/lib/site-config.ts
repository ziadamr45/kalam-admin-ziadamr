import { prisma } from "@/lib/prisma";

/**
 * ============================================================
 * جدول التكوين السيادي — SiteConfig (مفتاح/قيمة/تصنيف)
 * ============================================================
 * كل نص وعلم ومعيار اقتصادي في المنصة يُخزَّن هنا كصف مستقل
 * ويُعدَّل من استوديو التكوين أو التيرمينال السيادي أو MCP،
 * ويُطبَّق على الموقع العام لحظيًا عبر revalidateTag('site-config')
 * + إعادة تحقق عابرة للتطبيقات — دون إعادة نشر (Zero-Deploy).
 *
 * ترحيل آمن: القيم القديمة في SystemSetting.blob «site_config»
 * تُزرع تلقائيًا في الجدول الجديد عند أول قراءة إذا كان فارغًا.
 */

export type SiteConfigCategory = "BRANDING" | "TEXTS" | "FLAGS" | "IMPACT";
export type SiteConfigValueType = "string" | "text" | "boolean" | "number" | "json";

export type SiteConfigKeyDef = {
  key: string;
  category: SiteConfigCategory;
  type: SiteConfigValueType;
  label: string;
  hint?: string;
  default: unknown;
};

/* ==================== مخطط المفاتيح المعتمدة ==================== */

export const SITE_CONFIG_SCHEMA: SiteConfigKeyDef[] = [
  /* ---------- الهوية والعلامة ---------- */
  {
    key: "SITE_NAME",
    category: "BRANDING",
    type: "string",
    label: "اسم المنصة",
    hint: "يظهر في الترويسة والوثائق والإشعارات",
    default: "كلام له لازمة",
  },
  {
    key: "SITE_META_TITLE",
    category: "BRANDING",
    type: "string",
    label: "عنوان الصفحة (Meta Title)",
    default: "كلام له لازمة",
  },
  {
    key: "SITE_META_DESC",
    category: "BRANDING",
    type: "text",
    label: "وصف المنصة (Meta Description)",
    default:
      "مش كل كلام لازم يتقال.. بس فيه كلام له لازمة. منصة فكرية ومعرفية عربية: مقالات رصينة، بلا ضجيج، بلا إعلانات — كلام يستحق وقّتك.",
  },
  {
    key: "FOOTER_TEXT",
    category: "BRANDING",
    type: "string",
    label: "نص التذييل",
    default: "نُشر بعناية.. لكلام له لازمة.",
  },
  {
    key: "COPYRIGHT_TEXT",
    category: "BRANDING",
    type: "string",
    label: "نص حقوق النشر",
    default: "© كلام له لازمة — جميع الحقوق محفوظة",
  },
  {
    key: "SOCIAL_LINKS",
    category: "BRANDING",
    type: "json",
    label: "روابط التواصل الاجتماعي",
    hint: 'مصفوفة [{"label":"X","url":"https://x.com/..."}]',
    default: [] as { label: string; url: string }[],
  },

  /* ---------- النصوص والرسائل ---------- */
  {
    key: "WELCOME_MESSAGE",
    category: "TEXTS",
    type: "text",
    label: "رسالة الترحيب للزوار",
    hint: "تظهر في واجهة المنصة الرئيسية",
    default: "مش كل كلام لازم يتقال.. بس فيه كلام له لازمة",
  },
  {
    key: "ONBOARDING_SLIDES",
    category: "TEXTS",
    type: "json",
    label: "نصوص شرائح التهيئة (Onboarding)",
    hint: 'مصفوفة [{"title":"..","text":".."}] — حتى 3 شرائح',
    default: [] as { title: string; text: string }[],
  },
  {
    key: "DISCUSS_BADGE",
    category: "TEXTS",
    type: "string",
    label: "شارة هوية المحاور الذكي",
    default: "مساعد ذكاء اصطناعي",
  },
  {
    key: "DISCUSS_OPENING",
    category: "TEXTS",
    type: "text",
    label: "رسالة المحاور الافتتاحية",
    default:
      "أنا هنا لأحاورك حول الأفكار الواردة في هذا المقال ومساعدتك في تحليلها واستخراج أبعادها.",
  },
  {
    key: "DISCUSS_DISCLAIMER",
    category: "TEXTS",
    type: "text",
    label: "التنويه الثابت أسفل المحاورة",
    default:
      "المحاور هو نموذج ذكاء اصطناعي تحليلي، وقد تقع منه أخطاء أو تأويلات؛ يُرجى الرجوع لمتن المقال والمصادر الأصلية دائمًا.",
  },

  /* ---------- مفاتيح الميزات (Feature Flags) ---------- */
  {
    key: "COMMENTS_ENABLED",
    category: "FLAGS",
    type: "boolean",
    label: "التعليقات مفعّلة (عامًا)",
    hint: "إيقافها يقفل الحوار في كل المقالات فورًا",
    default: true,
  },
  {
    key: "TASHKEEL_ENABLED",
    category: "FLAGS",
    type: "boolean",
    label: "وضع التشكيل مفعّل عامًا",
    default: true,
  },
  {
    key: "AI_DISCUSS_ENABLED",
    category: "FLAGS",
    type: "boolean",
    label: "محاورة الذكاء الاصطناعي «ناقش المقال»",
    hint: "إيقافها يخفي زر المحاورة ويغلق المسار الخادمي فورًا",
    default: true,
  },
  {
    key: "AUDIO_PLAYER_ENABLED",
    category: "FLAGS",
    type: "boolean",
    label: "مشغل الصوت ظاهر للقراء",
    default: true,
  },
  {
    key: "PROPOSALS_ENABLED",
    category: "FLAGS",
    type: "boolean",
    label: "قناة مقترحات «أهل الكلمة»",
    default: true,
  },
  {
    key: "ONBOARDING_ENABLED",
    category: "FLAGS",
    type: "boolean",
    label: "تجربة التهيئة والجولة التفاعلية للأعضاء الجدد",
    default: true,
  },
  {
    key: "ERROR_ALERTS_ENABLED",
    category: "FLAGS",
    type: "boolean",
    label: "تنبيه Push فوري عند أي خطأ 500 جديد",
    hint: "البث لهواتف الإدارة عند أول ظهور لكل بصمة خطأ — تكراراته تُجمَّع بلا بث",
    default: true,
  },

  /* ---------- معايير اقتصاد الأثر ---------- */
  {
    key: "IMPACT_READ_COMPLETE",
    category: "IMPACT",
    type: "number",
    label: "نقاط إتمام القراءة المتأنية",
    default: 1,
  },
  {
    key: "IMPACT_READ_DAILY_CAP",
    category: "IMPACT",
    type: "number",
    label: "السقف اليومي لنقاط القراءة",
    default: 2,
  },
  {
    key: "IMPACT_COMMENT_APPROVED",
    category: "IMPACT",
    type: "number",
    label: "نقاط التعليق الهادف (عند الاعتماد)",
    default: 2,
  },
  {
    key: "IMPACT_COMMENT_LIKED",
    category: "IMPACT",
    type: "number",
    label: "نقاط الإعجاب بتعليق القارئ",
    default: 1,
  },
  {
    key: "IMPACT_COMMENT_INSPIRING",
    category: "IMPACT",
    type: "number",
    label: "نقاط التمييز الإداري «تعليق ملهم»",
    default: 10,
  },
  {
    key: "IMPACT_COMMENT_UNFEATURED",
    category: "IMPACT",
    type: "number",
    label: "خصم إلغاء التمييز (سالب)",
    default: -10,
  },
  {
    key: "IMPACT_AI_DISCUSS",
    category: "IMPACT",
    type: "number",
    label: "نقاط المحاورة العميقة مع الذكاء الاصطناعي",
    default: 1,
  },
  {
    key: "IMPACT_QUOTE_SHARE",
    category: "IMPACT",
    type: "number",
    label: "نقاط حفظ/مشاركة الاقتباس",
    default: 1,
  },
  {
    key: "IMPACT_ELDERS_THRESHOLD",
    category: "IMPACT",
    type: "number",
    label: "عتبة رتبة «أهل الكلمة»",
    hint: "الحد الأدنى لرصيد الأثر لفتح قناة المقترحات",
    default: 350,
  },
];

export const SCHEMA_BY_KEY = new Map(SITE_CONFIG_SCHEMA.map((d) => [d.key, d]));

/* ==================== الترحيل من الكتلة القديمة ==================== */

let migrated = false;

async function migrateLegacyBlobOnce(): Promise<void> {
  if (migrated) return;
  migrated = true;
  try {
    const existing = await prisma.siteConfig.count();
    if (existing > 0) return;
    const legacy = await prisma.systemSetting.findUnique({ where: { key: "site_config" } });
    const stored = (legacy?.value ?? {}) as Record<string, unknown>;
    const data = SITE_CONFIG_SCHEMA.filter((d) => stored[d.key] !== undefined).map((d) => ({
      key: d.key,
      value: stored[d.key] as never,
      category: d.category,
      label: d.label,
      updatedBy: "migration",
    }));
    if (data.length) await prisma.siteConfig.createMany({ data, skipDuplicates: true });
  } catch {
    /* فشل الترحيل غير حرج — الافتراضيات تغطي */
  }
}

/* ==================== القراءة ==================== */

/** ذاكرة قصيرة العمر لتخفيف قراءات التكوين المتلاحقة في العملية الواحدة */
let cacheMap: Record<string, unknown> | null = null;
let cacheAt = 0;
const CACHE_TTL_MS = 15_000;

function withDefaults(rows: { key: string; value: unknown }[]): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  for (const d of SITE_CONFIG_SCHEMA) map[d.key] = d.default;
  for (const r of rows) if (r.key in map) map[r.key] = r.value;
  return map;
}

/** خريطة التكوين الكاملة — قيم الجدول مدمجة فوق الافتراضيات */
export async function getSiteConfigMap(): Promise<Record<string, unknown>> {
  if (cacheMap && Date.now() - cacheAt < CACHE_TTL_MS) return cacheMap;
  await migrateLegacyBlobOnce();
  try {
    const rows = await prisma.siteConfig.findMany({ select: { key: true, value: true } });
    cacheMap = withDefaults(rows);
  } catch {
    cacheMap = withDefaults([]);
  }
  cacheAt = Date.now();
  return cacheMap;
}

export function invalidateSiteConfigCache(): void {
  cacheMap = null;
  cacheAt = 0;
}

/* قراءة مفتاح واحد مع تحقق النوع */
export async function getConfigValue<T>(key: string): Promise<T> {
  const map = await getSiteConfigMap();
  return (key in map ? map[key] : SCHEMA_BY_KEY.get(key)?.default) as T;
}

/* ==================== الكتابة ==================== */

/** تحويل القيمة الواردة (من استوديو/تيرمينال/MCP) إلى النوع المعتمد */
export function coerceConfigValue(def: SiteConfigKeyDef, raw: unknown): unknown {
  switch (def.type) {
    case "boolean":
      if (typeof raw === "boolean") return raw;
      if (typeof raw === "string") return raw.trim().toLowerCase() === "true";
      return Boolean(raw);
    case "number": {
      const n = Number(raw);
      if (!Number.isFinite(n)) throw new Error(`قيمة رقمية غير صالحة للمفتاح ${def.key}`);
      return Math.round(n);
    }
    case "json": {
      if (typeof raw !== "string") return raw;
      try {
        return JSON.parse(raw);
      } catch {
        throw new Error(`JSON غير صالح للمفتاح ${def.key} — راجع الصيغة`);
      }
    }
    default:
      return String(raw ?? "").trim();
  }
}

/** حفظ دفعة مفاتيح — يتحقق من كل مفتاح قبل الكتابة، ذريًّا في معاملة واحدة */
export async function saveSiteConfigEntries(
  entries: { key: string; value: unknown }[],
  updatedBy: string,
): Promise<{ saved: string[] }> {
  const prepared = entries.map(({ key, value }) => {
    const def = SCHEMA_BY_KEY.get(key);
    if (!def) throw new Error(`مفتاح تكوين غير معروف: ${key}`);
    return { key, value: coerceConfigValue(def, value) as never, category: def.category, label: def.label };
  });

  await prisma.$transaction(
    prepared.map((p) =>
      prisma.siteConfig.upsert({
        where: { key: p.key },
        update: { value: p.value, category: p.category, label: p.label, updatedBy },
        create: { key: p.key, value: p.value, category: p.category, label: p.label, updatedBy },
      }),
    ),
  );

  invalidateSiteConfigCache();
  return { saved: prepared.map((p) => p.key) };
}

/* ==================== واجهات عالية المستوى ==================== */

export type SiteConfig = {
  SITE_META_TITLE: string;
  SITE_META_DESC: string;
  FOOTER_TEXT: string;
  COMMENTS_ENABLED: boolean;
  TASHKEEL_ENABLED: boolean;
};

/** الشكل القديم المتوافق — للصفحات القائمة (site-settings) */
export async function getSiteConfig(): Promise<SiteConfig> {
  const map = await getSiteConfigMap();
  return {
    SITE_META_TITLE: map.SITE_META_TITLE as string,
    SITE_META_DESC: map.SITE_META_DESC as string,
    FOOTER_TEXT: map.FOOTER_TEXT as string,
    COMMENTS_ENABLED: map.COMMENTS_ENABLED as boolean,
    TASHKEEL_ENABLED: map.TASHKEEL_ENABLED as boolean,
  };
}

/** حفظ بالشكل القديم المتوافق — يكتب في الجدول الجديد */
export async function saveSiteConfig(next: Partial<SiteConfig>): Promise<SiteConfig> {
  const entries = Object.entries(next).map(([key, value]) => ({ key, value }));
  if (entries.length) await saveSiteConfigEntries(entries, "admin:site-settings");
  return getSiteConfig();
}

export type ImpactParams = {
  READ_COMPLETE: number;
  READ_DAILY_CAP: number;
  COMMENT_APPROVED: number;
  COMMENT_LIKED: number;
  COMMENT_INSPIRING: number;
  COMMENT_UNFEATURED: number;
  AI_DISCUSS: number;
  QUOTE_SHARE: number;
  ELDERS_THRESHOLD: number;
};

/** أوزان اقتصاد الأثر الحية — يحكمها الأدمن ديناميكيًا */
export async function getImpactParams(): Promise<ImpactParams> {
  const map = await getSiteConfigMap();
  return {
    READ_COMPLETE: Number(map.IMPACT_READ_COMPLETE),
    READ_DAILY_CAP: Number(map.IMPACT_READ_DAILY_CAP),
    COMMENT_APPROVED: Number(map.IMPACT_COMMENT_APPROVED),
    COMMENT_LIKED: Number(map.IMPACT_COMMENT_LIKED),
    COMMENT_INSPIRING: Number(map.IMPACT_COMMENT_INSPIRING),
    COMMENT_UNFEATURED: Number(map.IMPACT_COMMENT_UNFEATURED),
    AI_DISCUSS: Number(map.IMPACT_AI_DISCUSS),
    QUOTE_SHARE: Number(map.IMPACT_QUOTE_SHARE),
    ELDERS_THRESHOLD: Number(map.IMPACT_ELDERS_THRESHOLD),
  };
}

export type PlatformFlags = {
  COMMENTS_ENABLED: boolean;
  TASHKEEL_ENABLED: boolean;
  AI_DISCUSS_ENABLED: boolean;
  AUDIO_PLAYER_ENABLED: boolean;
  PROPOSALS_ENABLED: boolean;
  ONBOARDING_ENABLED: boolean;
};

/** مفاتيح الميزات — تُقرأ طازة من مسارات API (بوابات خادمية) */
export async function getFlags(): Promise<PlatformFlags> {
  const map = await getSiteConfigMap();
  return {
    COMMENTS_ENABLED: Boolean(map.COMMENTS_ENABLED),
    TASHKEEL_ENABLED: Boolean(map.TASHKEEL_ENABLED),
    AI_DISCUSS_ENABLED: Boolean(map.AI_DISCUSS_ENABLED),
    AUDIO_PLAYER_ENABLED: Boolean(map.AUDIO_PLAYER_ENABLED),
    PROPOSALS_ENABLED: Boolean(map.PROPOSALS_ENABLED),
    ONBOARDING_ENABLED: Boolean(map.ONBOARDING_ENABLED),
  };
}
