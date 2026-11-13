import "server-only";
import { prisma } from "@/lib/prisma";
import type { TrailSource } from "@prisma/client";
import { currentChannel } from "@/lib/audit-channel";

/**
 * ============================================================
 * سجل التدقيق السيادي (AuditTrail) — كاتب القيود الرقابية الموحد
 * ============================================================
 * كل إجراء مغيّر في المنصة — من اللوحة أو الموقع العام أو التيرمينال
 * السيادي أو بوابة MCP — يودع قيدًا رقابيًا مصنفًا: التصنيف، مصدر
 * التنفيذ (WEB/MCP/CLI/PUBLIC) واسم القناة المتصلة، وصفًا عربيًا
 * مقروءًا، واسم الأداة/الأمر، والسبب إلزاميًا في الأفعال الإدارية
 * والدليل المصوّر إن وُجد. الكتابة غير حرجة إطلاقًا: فشلها لا يعطل
 * الإجراء أبدًا، لكنها تغذي شاشة «السجل السيادي» وتقارير PDF الدورية
 * وأدوات MCP. لا يُحذف منه شيء أبدًا (حق الاحتفاظ القانوني).
 */

export type TrailCategory =
  | "USER_SELF_ACTION"
  | "ADMIN_MODERATION"
  | "ADMIN_VIP_CHANGE"
  | "SYSTEM_CONFIG_CHANGE"
  | "CONTENT_CHANGE"
  | "INFRASTRUCTURE_CHANGE"
  | "MCP_ACTION";

export type TrailEntry = {
  actorId: string; // معرف الفاعل أو معرف النظام (mcp / cli:<username>)
  actorEmail: string; // بريد الفاعل أو معرف قناته (mcp:Gemini / cli:ziadamr45)
  actorRole: string; // OWNER | ADMIN | MODERATOR | USER | SYSTEM
  actionCategory: TrailCategory;
  actionType: string; // ACCOUNT_BANNED | COMMENT_FEATURED | ARTICLE_PUBLISHED | kalam_update_article...
  source?: TrailSource; // قناة التنفيذ — من سياق القناة عند غيابها
  channelLabel?: string | null; // اسم العميل المتصل (MCP) أو الأدمن (CLI)
  description?: string | null; // وصف عربي مقروء لما حدث بالضبط
  tool?: string | null; // اسم أداة MCP أو أمر CLI المنفذ
  targetId?: string | null;
  targetEmail?: string | null;
  reason?: string | null; // سبب الإجراء — إلزامي في الأفعال الإدارية
  evidenceUrl?: string | null; // رابط لقطة الشاشة الدليلية إن وُجدت
  metadata?: Record<string, unknown> | null; // IP، القيم السابقة والجديدة..
};

/** تطهير الميتاداتا من الأسرار — لا كلمات مرور أو توكنات في السجل الرقابي */
export function sanitizeAuditMeta(meta: Record<string, unknown> | undefined | null): Record<string, unknown> | null {
  if (!meta) return null;
  const SECRET_KEY = /(pass|secret|token|key|credential|auth|bearer|apikey)/i;
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (SECRET_KEY.test(k)) continue;
    const s = typeof v === "string" ? v : JSON.stringify(v);
    clean[k] = typeof s === "string" && s.length > 240 ? `${s.slice(0, 240)}…` : v;
  }
  try {
    return JSON.stringify(clean).length > 3500
      ? { truncated: true, keys: Object.keys(clean) }
      : clean;
  } catch {
    return null;
  }
}

export async function writeTrail(entry: TrailEntry): Promise<void> {
  /* المصدر من القيد صراحةً، وإلا من سياق القناة الجاري، وإلا اللوحة */
  const channel = currentChannel();
  const source =
    entry.source ??
    (channel.channel === "mcp"
      ? "MCP"
      : channel.channel === "cli"
        ? "CLI"
        : channel.channel === "public"
          ? "PUBLIC"
          : "WEB");
  const channelLabel = entry.channelLabel ?? channel.label ?? null;
  try {
    await prisma.auditTrail.create({
      data: {
        actorId: entry.actorId,
        actorEmail: entry.actorEmail,
        actorRole: entry.actorRole,
        actionCategory: entry.actionCategory,
        actionType: entry.actionType,
        source,
        channelLabel,
        description: entry.description ?? null,
        tool: entry.tool ?? null,
        targetId: entry.targetId ?? null,
        targetEmail: entry.targetEmail ?? null,
        reason: entry.reason ?? null,
        evidenceUrl: entry.evidenceUrl ?? null,
        metadata: (entry.metadata ?? undefined) as never,
      },
    });
  } catch {
    // فشل القيد الرقابي غير حرج — لا يُعطل الإجراء الإداري أبدًا
  }
}
