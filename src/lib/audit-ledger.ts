import "server-only";
import { prisma } from "@/lib/prisma";
import type { PdfTrailEntry, PdfReportSummary } from "@/lib/audit-pdf";

/**
 * ============================================================
 * طبقة قراءة «السجل السيادي» الموحدة
 * ============================================================
 * تخدم كل القنوات بمنطق واحد: شاشة السجل السيادي، التقرير
 * الرقابي PDF، التيرمينال السيادي (audit list/inspect/export-pdf)،
 * وأدوات MCP الثلاث لـ Gemini Spark.
 */

export type LedgerRange = { from: Date; to: Date; label: string };

export const TRAIL_CATEGORIES = [
  "USER_SELF_ACTION",
  "ADMIN_MODERATION",
  "ADMIN_VIP_CHANGE",
  "SYSTEM_CONFIG_CHANGE",
  "CONTENT_CHANGE",
  "INFRASTRUCTURE_CHANGE",
  "MCP_ACTION",
] as const;

export type TrailCategoryFilter = (typeof TRAIL_CATEGORIES)[number] | "ALL";

/** قنوات التنفيذ الرقابية — نفس ثوابت TrailSource في المخطط */
export const TRAIL_SOURCES = ["WEB", "MCP", "CLI", "PUBLIC"] as const;

export type TrailSourceFilter = (typeof TRAIL_SOURCES)[number] | "ALL";

export const SOURCE_LABELS: Record<string, string> = {
  WEB: "لوحة التحكم",
  MCP: "بوابة MCP",
  CLI: "التيرمينال السيادي",
  PUBLIC: "الموقع العام",
};

/** تحويل معامل النطاق (weekly/monthly/custom/days) إلى مدى زمني فعلي */
export function resolveLedgerRange(
  rangeParam: string | null | undefined,
  fromStr?: string | null,
  toStr?: string | null,
): LedgerRange {
  const now = new Date();
  const r = (rangeParam ?? "").toLowerCase();
  if (r === "weekly") {
    return {
      from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      to: now,
      label: "أسبوعي — آخر ٧ أيام",
    };
  }
  if (r === "monthly") {
    return {
      from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      to: now,
      label: "شهري — آخر ٣٠ يومًا",
    };
  }
  if (r === "custom" || (fromStr && toStr)) {
    const from = fromStr ? new Date(fromStr) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const to = toStr ? new Date(`${toStr}T23:59:59.999`) : now;
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new Error("نطاق التاريخ المخصص غير صالح — استخدم صيغة YYYY-MM-DD");
    }
    if (from > to) throw new Error("تاريخ البداية يجب أن يسبق تاريخ النهاية");
    const fmt = (d: Date) =>
      new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "long", year: "numeric" }).format(d);
    return { from, to, label: `مخصص: ${fmt(from)} – ${fmt(to)}` };
  }
  if (/^\d+$/.test(r ?? "")) {
    const days = Number(r);
    return {
      from: new Date(now.getTime() - days * 24 * 60 * 60 * 1000),
      to: now,
      label: `آخر ${days} يومًا`,
    };
  }
  /* الافتراضي: آخر ٧ أيام */
  return {
    from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
    to: now,
    label: "أسبوعي — آخر ٧ أيام",
  };
}

/** تلخيص القيود — أرقام الملخص التنفيذي للتقرير والشاشة */
export function summarizeTrail(entries: { actionCategory: string; actionType: string }[]): PdfReportSummary {
  const by = (t: string) => entries.filter((e) => e.actionType === t).length;
  return {
    hardDeletes: by("USER_HARD_DELETE") + by("USER_SELF_HARD_DELETE"),
    bans: by("ACCOUNT_BANNED"),
    featured: by("COMMENT_FEATURED"),
    vipChanges: entries.filter((e) => e.actionCategory === "ADMIN_VIP_CHANGE").length,
    configChanges: entries.filter((e) => e.actionCategory === "SYSTEM_CONFIG_CHANGE").length,
    contentChanges: entries.filter((e) => e.actionCategory === "CONTENT_CHANGE").length,
    infraChanges: entries.filter((e) => e.actionCategory === "INFRASTRUCTURE_CHANGE").length,
    mcpActions: entries.filter((e) => e.actionCategory === "MCP_ACTION").length,
    total: entries.length,
  };
}

export type LedgerQuery = {
  range: LedgerRange;
  category?: TrailCategoryFilter;
  source?: TrailSourceFilter;
  take?: number;
};

/** تحميل قيود السجل السيادي + ملخصها — قناة واحدة لكل المستهلكين */
export async function loadLedger(q: LedgerQuery): Promise<{
  entries: (PdfTrailEntry & { id: string; source: string; channelLabel: string | null; description: string | null; tool: string | null; actorId: string; targetId: string | null; metadata: unknown })[];
  summary: PdfReportSummary;
}> {
  const category =
    q.category && q.category !== "ALL" && (TRAIL_CATEGORIES as readonly string[]).includes(q.category)
      ? q.category
      : undefined;
  const source =
    q.source && q.source !== "ALL" && (TRAIL_SOURCES as readonly string[]).includes(q.source)
      ? q.source
      : undefined;

  const rows = await prisma.auditTrail.findMany({
    where: {
      createdAt: { gte: q.range.from, lte: q.range.to },
      ...(category ? { actionCategory: category } : {}),
      ...(source ? { source } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: q.take ?? 500,
  });

  const entries = rows.map((r) => ({
    id: r.id,
    actorId: r.actorId,
    actorEmail: r.actorEmail,
    actorRole: r.actorRole,
    actionCategory: r.actionCategory,
    actionType: r.actionType,
    source: r.source as string,
    channelLabel: r.channelLabel,
    description: r.description,
    tool: r.tool,
    targetId: r.targetId,
    targetEmail: r.targetEmail,
    reason: r.reason,
    evidenceUrl: r.evidenceUrl,
    metadata: r.metadata,
    createdAt: r.createdAt,
  }));

  return { entries, summary: summarizeTrail(entries) };
}

/** رقم تقرير فاخر: AUD-YYYYMMDD-XXXX */
export function makeReportNo(): string {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, "0");
  return `AUD-${day}-${rand}`;
}
