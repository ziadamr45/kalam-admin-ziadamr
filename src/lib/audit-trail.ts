import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * ============================================================
 * سجل التدقيق السيادي (AuditTrail) — كاتب القيود الرقابية الموحد
 * ============================================================
 * كل إجراء إداري حساس (حظر، تمييز تعليق، منح توثيق، تعديل تكوين،
 * محو حساب) يودع قيدًا رقابيًا مصنفًا بالسبب إلزاميًا وبالدليل
 * المصوّر إن وُجد. الكتابة غير حرجة إطلاقًا: فشلها لا يعطل الإجراء
 * أبدًا (السجلات الموازية AuditLog/AuditEvent تغطي الاحتياط)،
 * لكنها تُغذّي شاشة «سجل التدقيق السيادي» وتقارير PDF الدورية
 * وأدوات MCP لـ Gemini Spark.
 */

export type TrailCategory =
  | "USER_SELF_ACTION"
  | "ADMIN_MODERATION"
  | "ADMIN_VIP_CHANGE"
  | "SYSTEM_CONFIG_CHANGE";

export type TrailEntry = {
  actorId: string; // معرف الفاعل أو معرف النظام (mcp / cli:<username>)
  actorEmail: string; // بريد الفاعل أو معرف قناته
  actorRole: string; // OWNER | ADMIN | MODERATOR | USER | SYSTEM
  actionCategory: TrailCategory;
  actionType: string; // ACCOUNT_BANNED | COMMENT_FEATURED | VIP_GRANTED | ...
  targetId?: string | null;
  targetEmail?: string | null;
  reason?: string | null; // سبب الإجراء — إلزامي في الأفعال الإدارية
  evidenceUrl?: string | null; // رابط لقطة الشاشة الدليلية إن وُجدت
  metadata?: Record<string, unknown> | null; // IP، القيم السابقة والجديدة..
};

export async function writeTrail(entry: TrailEntry): Promise<void> {
  try {
    await prisma.auditTrail.create({
      data: {
        actorId: entry.actorId,
        actorEmail: entry.actorEmail,
        actorRole: entry.actorRole,
        actionCategory: entry.actionCategory,
        actionType: entry.actionType,
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
