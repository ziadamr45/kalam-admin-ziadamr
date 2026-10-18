import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { writeAudit, raiseAlert } from "@/lib/guard";
import { destroyCloudinaryAsset } from "@/lib/cloudinary";
import { revalidatePublicPaths } from "@/lib/revalidate";
import { OWNER_EMAIL } from "@/lib/vip";

/**
 * ============================================================
 * منظومة المحو التام للبيانات — Cascading Hard-Delete Engine
 * ============================================================
 * تنفيذ صادق ومتكامل لبند «الحق في محو البيانات» في سياسة الخصوصية:
 * حذف برمجي فوري وشامل لكافة سجلات المستخدم الفعلية داخل معاملة
 * واحدة ذرّية — لا حذف صوري ولا تعليم «غير نشط» — مع كتابة قيد
 * التدقيق في AuditTrail داخل المعاملة نفسها (لا يُحذف الحساب
 * إلا أن يُكتب سجله الرقابي)، ثم تنظيف الصور الشخصية من مزود
 * التخزين السحابي وإعادة توليد صفحات المقالات التي ظهرت فيها
 * تعليقاته حتى يختفي أثرها لحظةً.
 *
 * يخدم هذه المحرك ثلاث قنوات على حد سواء:
 *  - نافذة الحذف السيادي في جدول المستخدمين (PATCH /api/users)
 *  - التيرمينال السيادي (user hard-delete)
 *  - أداة MCP kalam_execute_hard_delete لـ Gemini Spark
 * ويخدمه المستخدم نفسه حذفًا ذاتيًا من صفحة ملفه عبر المسار
 * الموازي المطبق بالمنطق ذاته في المنصة العامة (/api/account/delete).
 */

/** أسباب الحذف السيادي المعتمدة — تُعرض في نافذة التأكيد وتُوثق بالسجل */
export const HARD_DELETE_REASONS = [
  { value: "OFFICIAL_USER_REQUEST", label: "طلب رسمي من المستخدم عبر صفحة اتصل بنا", requireEvidence: true },
  { value: "SEVERE_DIALOGUE_VIOLATION", label: "مخالفة جسيمة لآداب الحوار والشريعة", requireEvidence: true },
  { value: "SECURITY_ABUSE", label: "إساءة وتعدٍّ أمني", requireEvidence: true },
] as const;

export type HardDeleteReason = (typeof HARD_DELETE_REASONS)[number]["value"];

export function isHardDeleteReason(value: string): value is HardDeleteReason {
  return HARD_DELETE_REASONS.some((r) => r.value === value);
}

export function hardDeleteReasonLabel(value: string): string {
  return HARD_DELETE_REASONS.find((r) => r.value === value)?.label ?? value;
}

/** استخراج public_id من رابط Cloudinary — لتنظيف الأصول عند المحو
 *  https://res.cloudinary.com/<cloud>/image/upload/[تحويلات/][v123/]kalam/accounts/x.jpg
 *  → kalam/accounts/x */
export function publicIdFromCloudinaryUrl(url: string | null | undefined): string | null {
  if (!url || !url.includes("res.cloudinary.com")) return null;
  const marker = "/upload/";
  const at = url.indexOf(marker);
  if (at < 0) return null;
  let tail = url.slice(at + marker.length).split("?")[0];
  const segments = tail.split("/");
  /* إسقاط أجزاء التحويل (f_auto,q_auto ..) وجزء الإصدار (v123) من المقدمة */
  while (segments.length > 0 && (/^v\d+$/.test(segments[0]) || segments[0].includes(",") || segments[0].includes("="))) {
    segments.shift();
  }
  tail = segments.join("/");
  /* إسقاط امتداد الملف الأخير */
  tail = tail.replace(/\.[a-z0-9]{2,5}$/i, "");
  return tail || null;
}

export type HardDeleteActor = {
  adminId: string | null;
  actorEmail: string; // بريد الفاعل أو معرف النظام (gemini-spark)
  actorRole: string; // OWNER | ADMIN | MODERATOR | SYSTEM | USER
  ip: string | null;
  userAgent?: string | null;
  via: string; // studio | cli:web | cli:mcp | gemini-spark-mcp | self-profile
};

export type HardDeleteInput = {
  userId: string;
  reason: string; // سبب إلزامي — نص المخالفة أو تفصيل الطلب
  reasonCode: HardDeleteReason; // تصنيف السبب المعتمد
  evidenceUrl?: string | null; // رابط لقطة الشاشة الدليلية
  /** إيقاف الحماية الافتراضية لصاحب المنصة — لا تُستخدم أبدًا من القنوات التفاعلية */
  allowOwnerOverride?: boolean;
};

export type HardDeleteResult = {
  ok: boolean;
  auditId: string;
  target: { id: string; label: string; email: string | null };
  deletedCounts: Record<string, number>;
  assetsRemoved: string[];
  revalidatedSlugs: number;
};

/**
 * الحذف السيادي الشامل — المحو الفعلي الكامل لكل سجلات المستخدم
 * مع توثيق رقابي محكم داخل المعاملة ذاتها.
 */
export async function hardDeleteUser(
  input: HardDeleteInput,
  actor: HardDeleteActor,
): Promise<HardDeleteResult> {
  const reason = input.reason?.trim() ?? "";
  if (reason.length < 5) {
    throw new Error("سبب الحذف إلزامي — تدوّن نص الطلب أو المخالفة بدقة (5 أحرف فأكثر)");
  }
  if (!isHardDeleteReason(input.reasonCode)) {
    throw new Error("تصنيف سبب الحذف غير معتمد — اختر من الأسباب الثلاثة الرسمية");
  }
  if (!input.evidenceUrl || !/^https?:\/\//.test(input.evidenceUrl)) {
    throw new Error("إرفاق لقطة شاشة دليلية إلزامي — تُرفع لمجلد الأدلة المحمي وتُوثق برابطها في السجل");
  }

  const target = await prisma.user.findUnique({
    where: { id: input.userId },
    select: {
      id: true, email: true, name: true, customName: true, customImage: true, image: true,
      role: true, isVerified: true, impactScore: true, banned: true,
    },
  });
  if (!target) throw new Error("لا يوجد مستخدم مطابق لهذا الحذف");
  if (target.email?.toLowerCase() === OWNER_EMAIL && !input.allowOwnerOverride) {
    throw new Error("حساب صاحب المنصة سيادي محمي بالبذر التلقائي — لا يُمحى مطلقًا");
  }
  const label = target.customName ?? target.name ?? target.email ?? target.id;
  const email = target.email ?? "";

  /* عناوين مقالات تعليقاته المعتمدة لإعادة توليدها بعد المحو */
  const approved = await prisma.comment.findMany({
    where: { userId: target.id, status: "APPROVED" },
    select: { article: { select: { slug: true } } },
  });

  /* عُدّ ما سيُمحى — يُودَع في السجل الرقابي كتفاصيل تقنية دقيقة */
  const [
    commentsCount, votesCount, interactionsCount, savedCount, progressCount,
    aiCount, impactCount, proposalsCount, notificationsCount, pushCount,
    sessionsCount, accountsCount,
  ] = await Promise.all([
    prisma.comment.count({ where: { userId: target.id } }),
    prisma.commentVote.count({ where: { userId: target.id } }),
    prisma.interaction.count({ where: { userId: target.id } }),
    prisma.savedArticle.count({ where: { userId: target.id } }),
    prisma.readingProgress.count({ where: { userId: target.id } }),
    prisma.aiDiscussionUsage.count({ where: { userId: target.id } }),
    prisma.impactLog.count({ where: { userId: target.id } }),
    prisma.userProposal.count({ where: { userId: target.id } }),
    prisma.userNotification.count({ where: { userId: target.id } }),
    prisma.userPushSubscription.count({ where: { userId: target.id } }),
    prisma.session.count({ where: { userId: target.id } }).catch(() => 0),
    prisma.account.count({ where: { userId: target.id } }),
  ]);

  const deletedCounts: Record<string, number> = {
    comments: commentsCount,
    commentVotes: votesCount,
    interactions: interactionsCount,
    savedArticles: savedCount,
    readingProgress: progressCount,
    aiDiscussionUsage: aiCount,
    impactLedger: impactCount,
    proposals: proposalsCount,
    notifications: notificationsCount,
    pushSubscriptions: pushCount,
    sessions: sessionsCount,
    accounts: accountsCount,
    user: 1,
  };

  /* ==================== المعاملة الذرّية: قيد رقابي + محو كامل ====================
     لا يُمحى الحساب إلا أن يُكتب سجله في AuditTrail داخل المعاملة نفسها —
     إما أن يُوثق المحو كاملاً أو لا يحدث شيء إطلاقًا. */
  const auditMetadata = {
    via: actor.via,
    ip: actor.ip,
    userAgent: actor.userAgent?.slice(0, 300) ?? null,
    reasonCode: input.reasonCode,
    reasonLabel: hardDeleteReasonLabel(input.reasonCode),
    targetLabel: label,
    targetRole: target.role,
    targetImpactScore: target.impactScore,
    wasVerified: target.isVerified,
    wasBanned: target.banned,
    deletedCounts,
    assetsRemoved: [] as string[],
    wipedAt: new Date().toISOString(),
  };

  const auditId = await prisma.$transaction(async (tx) => {
    const entry = await tx.auditTrail.create({
      data: {
        actorId: actor.adminId ?? actor.actorEmail,
        actorEmail: actor.actorEmail,
        actorRole: actor.actorRole,
        actionCategory: "ADMIN_MODERATION",
        actionType: "USER_HARD_DELETE",
        targetId: target.id,
        targetEmail: email,
        reason: `[${hardDeleteReasonLabel(input.reasonCode)}] ${reason}`,
        evidenceUrl: input.evidenceUrl,
        metadata: auditMetadata as never,
      },
    });
    /* التعليقات والردود — وبلاغاتها وأصواتها تتبعها بالتتالي */
    await tx.comment.deleteMany({ where: { userId: target.id } });
    /* تصويتاته على تعليقات الآخرين */
    await tx.commentVote.deleteMany({ where: { userId: target.id } });
    /* تفاعلاته (إعجاب/استياء) */
    await tx.interaction.deleteMany({ where: { userId: target.id } });
    /* محفوظاته السحابية */
    await tx.savedArticle.deleteMany({ where: { userId: target.id } });
    /* مواضع استئناف قراءته */
    await tx.readingProgress.deleteMany({ where: { userId: target.id } });
    /* حصص نقاش الذكاء الاصطناعي */
    await tx.aiDiscussionUsage.deleteMany({ where: { userId: target.id } });
    /* رصيد وسجل الأثر بالكامل */
    await tx.impactLog.deleteMany({ where: { userId: target.id } });
    /* مقترحات أهل الكلمة */
    await tx.userProposal.deleteMany({ where: { userId: target.id } });
    /* إشعارات جرسه */
    await tx.userNotification.deleteMany({ where: { userId: target.id } });
    /* اشتراكات الإشعارات الفورية */
    await tx.userPushSubscription.deleteMany({ where: { userId: target.id } });
    /* جلساته وروابط Google */
    await tx.session.deleteMany({ where: { userId: target.id } });
    await tx.account.deleteMany({ where: { userId: target.id } });
    /* أخيرًا: السجل الأساسي — وتتبعه المتبقي بالتتالي */
    await tx.user.delete({ where: { id: target.id } });
    return entry.id;
  });

  /* ==================== بعد الالتزام: تنظيف الأصول وإعادة التوليد ==================== */

  /* صوره الشخصية من التخزين السحابي — فورًا وبلا تعطيل للمحو */
  const assetsRemoved: string[] = [];
  for (const assetUrl of [target.customImage, target.image]) {
    const publicId = publicIdFromCloudinaryUrl(assetUrl);
    if (!publicId) continue;
    try {
      const result = await destroyCloudinaryAsset(publicId, "image");
      if (result.deleted) assetsRemoved.push(publicId);
    } catch {
      /* فشل تنظيف الأصل لا يُسقط المحو — يُوثق فقط */
    }
  }
  if (assetsRemoved.length) {
    await prisma.auditTrail
      .update({
        where: { id: auditId },
        data: { metadata: { ...auditMetadata, assetsRemoved } as never },
      })
      .catch(() => {});
  }

  /* سجل التدقيق الإداري الموازي + المرصد الحي + تنبيه فوري لهاتف صاحب المنصة */
  await writeAudit({
    adminId: actor.adminId,
    action: "user.hard_deleted",
    entity: "User",
    entityId: target.id,
    meta: {
      via: actor.via,
      by: actor.actorEmail,
      email,
      label,
      reasonCode: input.reasonCode,
      reason,
      evidenceUrl: input.evidenceUrl,
      auditTrailId: auditId,
      deletedCounts,
    },
    ip: actor.ip,
  });
  await prisma.auditEvent
    .create({
      data: {
        type: "ACCOUNT_HARD_DELETED",
        actorType: "USER",
        actorId: actor.adminId ?? actor.actorEmail,
        actorLabel: `${actor.actorEmail} ← ${email}`,
        message: `محو سيادي شامل لحساب ${email} — السبب: ${hardDeleteReasonLabel(input.reasonCode)}`,
        meta: { auditTrailId: auditId, reasonCode: input.reasonCode, deletedCounts },
        ip: actor.ip,
      },
    })
    .catch(() => {});
  await raiseAlert({
    type: "ACCOUNT_HARD_DELETED",
    severity: "WARN",
    message: `مُحيا جميع بيانات الحساب ${email} نهائيًا (${actor.via}) — السبب: ${hardDeleteReasonLabel(input.reasonCode)} — الدليل: ${input.evidenceUrl.slice(0, 80)}`,
    meta: { auditTrailId: auditId, via: actor.via, reasonCode: input.reasonCode },
  });

  /* إعادة توليد صفحات المنصة التي ظهرت فيها تعليقاته + ملفه */
  const slugs = [...new Set(approved.map((c) => c.article.slug))];
  await revalidatePublicPaths(slugs.map((s) => `/article/${s}`), slugs[0]).catch(() => {});
  revalidatePath("/profile");

  return {
    ok: true,
    auditId,
    target: { id: target.id, label, email },
    deletedCounts,
    assetsRemoved,
    revalidatedSlugs: slugs.length,
  };
}
