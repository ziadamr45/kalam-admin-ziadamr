import "server-only";
import { prisma } from "@/lib/prisma";
import { cloudinaryUsage } from "@/lib/cloudinary";

/**
 * ============================================================
 * محرك المراقبة الشاملة — Total System Observability Engine
 * ============================================================
 * صحة Neon PostgreSQL لحظيًا (زمن الاستجابة، الاتصالات النشطة،
 * حجم القاعدة)، لقطات الحركة، الأخطاء التشغيلية، وحصص الواجهات
 * الخارجية (Gemini/Resend/Cloudinary) بعدّادات يومية في Neon.
 */

export type DbHealth = {
  ok: boolean;
  latencyMs: number;
  version: string;
  activeConnections: number;
  maxConnections: number;
  sizeBytes: number;
  startedAt: string | null;
};

/* ==================== يوم القاهرة ==================== */

export function cairoDayKey(offsetDays = 0): string {
  const cairo = new Date(Date.now() + 3 * 60 * 60 * 1000 + offsetDays * 86_400_000);
  return cairo.toISOString().slice(0, 10);
}

/** نبض عداد استهلاك خارجي — upsert تزايدي آمن تحت التزامن */
export async function bumpApiUsage(provider: string, by = 1): Promise<void> {
  try {
    await prisma.apiUsageCounter.upsert({
      where: { provider_day: { provider, day: cairoDayKey() } },
      update: { count: { increment: by } },
      create: { provider, day: cairoDayKey(), count: by },
    });
  } catch {
    /* العداد زينة رقابية — لا يعطّل المسار الأصلي أبدًا */
  }
}

export type ProviderQuota = {
  provider: string;
  label: string;
  configured: boolean;
  today: number;
  last7Days: { day: string; count: number }[];
  extra?: Record<string, unknown>;
};

async function counterRows(providers: string[]): Promise<Map<string, { day: string; count: number }[]>> {
  const since = cairoDayKey(-6);
  const rows = await prisma.apiUsageCounter.findMany({
    where: { provider: { in: providers }, day: { gte: since } },
    orderBy: { day: "asc" },
  });
  const map = new Map<string, { day: string; count: number }[]>();
  for (const p of providers) map.set(p, []);
  for (const r of rows) map.get(r.provider)?.push({ day: r.day, count: r.count });
  return map;
}

/* ==================== صحة قاعدة Neon ==================== */

export async function dbHealth(): Promise<DbHealth> {
  const t0 = Date.now();
  await prisma.$queryRaw`SELECT 1`;
  const latencyMs = Date.now() - t0;

  let version = "PostgreSQL";
  let activeConnections = 0;
  let maxConnections = 0;
  let sizeBytes = 0;
  let startedAt: string | null = null;

  try {
    const v = await prisma.$queryRaw<{ version: string }[]>`SELECT version() AS version`;
    version = String(v[0]?.version ?? "").split(" ").slice(0, 2).join(" ") || version;
  } catch {}
  try {
    const act = await prisma.$queryRaw<{ c: number }[]>`
      SELECT count(*)::int AS c FROM pg_stat_activity WHERE datname = current_database()`;
    activeConnections = act[0]?.c ?? 0;
  } catch {}
  try {
    const mx = await prisma.$queryRaw<{ setting: number }[]>`
      SELECT setting::int AS setting FROM pg_settings WHERE name = 'max_connections'`;
    maxConnections = mx[0]?.setting ?? 0;
  } catch {}
  try {
    const sz = await prisma.$queryRaw<{ size: string }[]>`
      SELECT pg_database_size(current_database())::text AS size`;
    sizeBytes = Number(sz[0]?.size ?? 0);
  } catch {}
  try {
    const st = await prisma.$queryRaw<{ t: string }[]>`
      SELECT pg_postmaster_start_time()::text AS t`;
    startedAt = st[0]?.t ?? null;
  } catch {}

  return { ok: latencyMs < 3000, latencyMs, version, activeConnections, maxConnections, sizeBytes, startedAt };
}

/* ==================== الحركة اللحظية ==================== */

export type TrafficSnapshot = {
  windowMinutes: number;
  total: number;
  errors: number;
  perMinute: number;
  topPaths: { path: string; count: number }[];
  devices: { device: string; count: number }[];
  countries: { country: string; count: number }[];
};

export async function trafficSnapshot(windowMinutes = 60): Promise<TrafficSnapshot> {
  const since = new Date(Date.now() - windowMinutes * 60_000);
  const [total, errors, topPaths, devices, countries] = await Promise.all([
    prisma.requestLog.count({ where: { createdAt: { gte: since } } }),
    prisma.requestLog.count({ where: { createdAt: { gte: since }, isError: true } }),
    prisma.requestLog.groupBy({
      by: ["path"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { path: "desc" } },
      take: 8,
    }),
    prisma.requestLog.groupBy({
      by: ["device"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { device: "desc" } },
      take: 5,
    }),
    prisma.requestLog.groupBy({
      by: ["country"],
      where: { createdAt: { gte: since }, country: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { country: "desc" } },
      take: 6,
    }),
  ]);
  return {
    windowMinutes,
    total,
    errors,
    perMinute: Math.round((total / windowMinutes) * 10) / 10,
    topPaths: topPaths.map((p) => ({ path: p.path, count: p._count._all })),
    devices: devices.map((d) => ({ device: d.device ?? "unknown", count: d._count._all })),
    countries: countries.map((c) => ({ country: c.country ?? "—", count: c._count._all })),
  };
}

export type RequestLogFilters = {
  seconds?: number;
  userId?: string;
  errorOnly?: boolean;
  path?: string;
  limit?: number;
};

export async function listRequestLogs(filters: RequestLogFilters) {
  const since = new Date(Date.now() - (filters.seconds ?? 600) * 1000);
  return prisma.requestLog.findMany({
    where: {
      createdAt: { gte: since },
      ...(filters.userId ? { OR: [{ userId: filters.userId }, { userEmail: filters.userId }] } : {}),
      ...(filters.errorOnly ? { isError: true } : {}),
      ...(filters.path ? { path: { contains: filters.path } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(filters.limit ?? 60, 200),
  });
}

export async function recentErrors(limit = 25) {
  return prisma.serverErrorLog.findMany({
    orderBy: { lastSeenAt: "desc" },
    take: Math.min(limit, 100),
  });
}

/* ==================== الحصص الخارجية ==================== */

export type ExternalQuotas = {
  geminiChat: ProviderQuota;
  geminiTts: ProviderQuota;
  resend: ProviderQuota;
  cloudinary: ProviderQuota;
  checkedAt: string;
};

export async function externalQuotas(): Promise<ExternalQuotas> {
  const providers = ["GEMINI_CHAT", "GEMINI_TTS", "RESEND_EMAIL", "CLOUDINARY_UPLOAD"];
  const rows = await counterRows(providers);
  const today = cairoDayKey();
  const todayOf = (p: string) => rows.get(p)?.find((r) => r.day === today)?.count ?? 0;

  /* Gemini — المفتاح مُحمَّل في المنصة العامة؛ الفحص هنا عبر عدادات الاستهلاك المشتركة */
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);

  /* Resend — جلب حالة النطاقات مباشرة من API إن توفر المفتاح */
  let resendExtra: Record<string, unknown> | undefined;
  let resendConfigured = Boolean(process.env.RESEND_API_KEY);
  if (resendConfigured) {
    try {
      const res = await fetch("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        const data = (await res.json()) as { data?: { name: string; status: string }[] };
        resendExtra = { domains: data.data ?? [] };
      }
    } catch {
      /* استقصاء الحصص لا يرفع أخطاء */
    }
  }

  /* Cloudinary — واجهة الاستخدام الرسمية مع خطة وحصص التخزين والنطاق الترددي */
  let cloudinaryExtra: Record<string, unknown> | undefined;
  let cloudinaryConfigured = false;
  try {
    const usage = await cloudinaryUsage();
    if (usage) {
      cloudinaryConfigured = true;
      cloudinaryExtra = {
        plan: usage.plan,
        creditsUsed: usage.creditsUsed,
        creditsLimit: usage.creditsLimit,
        storageUsedMB: Math.round((usage.storageUsedBytes ?? 0) / 1_048_576),
        bandwidthUsedMB: Math.round((usage.bandwidthUsedBytes ?? 0) / 1_048_576),
        objects: usage.objectsCount,
      };
    }
  } catch {}

  return {
    geminiChat: {
      provider: "GEMINI_CHAT",
      label: "محاورة Gemini النصية",
      configured: geminiConfigured,
      today: todayOf("GEMINI_CHAT"),
      last7Days: rows.get("GEMINI_CHAT") ?? [],
    },
    geminiTts: {
      provider: "GEMINI_TTS",
      label: "توليد الصوت Gemini TTS",
      configured: geminiConfigured,
      today: todayOf("GEMINI_TTS"),
      last7Days: rows.get("GEMINI_TTS") ?? [],
    },
    resend: {
      provider: "RESEND_EMAIL",
      label: "تسليم البريد Resend",
      configured: resendConfigured,
      today: todayOf("RESEND_EMAIL"),
      last7Days: rows.get("RESEND_EMAIL") ?? [],
      extra: resendExtra,
    },
    cloudinary: {
      provider: "CLOUDINARY_UPLOAD",
      label: "تخزين الوسائط Cloudinary",
      configured: cloudinaryConfigured,
      today: todayOf("CLOUDINARY_UPLOAD"),
      last7Days: rows.get("CLOUDINARY_UPLOAD") ?? [],
      extra: cloudinaryExtra,
    },
    checkedAt: new Date().toISOString(),
  };
}

/* ==================== إحصاءات قاعدة البيانات (CLI) ==================== */

export type DbStats = {
  totalSizeBytes: number;
  tables: { name: string; liveRows: number; bytes: number }[];
  exactCounts: Record<string, number>;
};

export async function dbStats(): Promise<DbStats> {
  const tablesRaw = await prisma.$queryRaw<{ relname: string; n: string; bytes: string }[]>`
    SELECT relname,
           GREATEST(n_live_tup, 0)::text AS n,
           pg_total_relation_size(relid)::text AS bytes
    FROM pg_stat_user_tables
    ORDER BY pg_total_relation_size(relid) DESC
    LIMIT 25`;
  const sizeRaw = await prisma.$queryRaw<{ size: string }[]>`
    SELECT pg_database_size(current_database())::text AS size`;

  const exactCounts: Record<string, number> = {};
  const counters: [string, Promise<number>][] = [
    ["users", prisma.user.count()],
    ["articles", prisma.article.count()],
    ["comments", prisma.comment.count()],
    ["impactLogs", prisma.impactLog.count()],
    ["requestLogs", prisma.requestLog.count()],
    ["notifications", prisma.userNotification.count()],
  ];
  await Promise.all(counters.map(async ([k, p]) => (exactCounts[k] = await p.catch(() => -1))));

  return {
    totalSizeBytes: Number(sizeRaw[0]?.size ?? 0),
    tables: tablesRaw.map((t) => ({ name: t.relname, liveRows: Number(t.n), bytes: Number(t.bytes) })),
    exactCounts,
  };
}

/* ==================== التقليم الدوري ==================== */

/** تقليم سجلات المراقبة القديمة — يحفظ آخر n يومًا (يستدعيه run_maintenance) */
export async function pruneLogs(keepDays = 14): Promise<{ requestLogs: number; serverErrors: number }> {
  const cutoff = new Date(Date.now() - keepDays * 86_400_000);
  const [requestLogs, serverErrors] = await Promise.all([
    prisma.requestLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    prisma.serverErrorLog.deleteMany({ where: { lastSeenAt: { lt: cutoff } } }),
  ]);
  return { requestLogs: requestLogs.count, serverErrors: serverErrors.count };
}
