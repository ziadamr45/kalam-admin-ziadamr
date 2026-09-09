import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/guard";
import { writeTrail } from "@/lib/audit-trail";

/**
 * ============================================================
 * منظومة التوثيق السيادي والحسابات المميزة — نسخة لوحة التحكم
 * ============================================================
 * منطق المنح والسحب والإشعارات الموحد الذي يخدمه ثلاثة قنوات على حد سواء:
 * استوديو VIP في واجهة اللوحة (PATCH /api/users) + التيرمينال السيادي
 * (user grant-vip / user verify / user set-points) + أدوات MCP الثلاث
 * الجديدة (kalam_assign_user_vip / kalam_manage_verification /
 * kalam_dispatch_vip_notification). كل فعل مُغيِّر يُوثَّق في AuditLog
 * وAuditEvent معًا — اللوحة تراه في سجل التدقيق والمرصد الحي معًا.
 */

/** بريد صاحب المنصة — الحساب السيادي الأسمى */
export const OWNER_EMAIL = "ziad90216@gmail.com";
export const SOVEREIGN_IMPACT = 9999;
export const SOVEREIGN_COLOR = "#D97706";

/* ==================== مفاتيح الصلاحيات ==================== */

export type VipPrivileges = {
  unlimitedAiChat?: boolean;
  bypassRateLimits?: boolean;
  bypassCooldowns?: boolean;
  ahlAlKalimaAccess?: boolean;
  selfPinComment?: boolean;
  vipCommentBorder?: boolean;
  betaFeatures?: boolean;
};

export const ALL_PRIVILEGES: VipPrivileges = {
  unlimitedAiChat: true,
  bypassRateLimits: true,
  bypassCooldowns: true,
  ahlAlKalimaAccess: true,
  selfPinComment: true,
  vipCommentBorder: true,
  betaFeatures: true,
};

export const PRIVILEGE_LABELS: Record<keyof VipPrivileges, string> = {
  unlimitedAiChat: "حصة ذكاء اصطناعي غير محدودة",
  bypassRateLimits: "تجاوز محددات المعدل",
  bypassCooldowns: "تجاوز فترات التهدئة",
  ahlAlKalimaAccess: "قناة «أهل الكلمة» فورية",
  selfPinComment: "تثبيت تعليقاته ذاتيًا",
  vipCommentBorder: "إطار تعليق فخم بلون الشارة",
  betaFeatures: "وصول مبكر للميزات التجريبية",
};

export const PRIVILEGE_KEYS = Object.keys(PRIVILEGE_LABELS) as (keyof VipPrivileges)[];

export function parsePrivileges(raw: unknown): VipPrivileges {
  if (!raw || typeof raw !== "object") return {};
  const out: VipPrivileges = {};
  for (const key of PRIVILEGE_KEYS) {
    if ((raw as Record<string, unknown>)[key] === true) out[key] = true;
  }
  return out;
}

export function hasPrivilege(rawVipPrivileges: unknown, key: keyof VipPrivileges): boolean {
  return parsePrivileges(rawVipPrivileges)[key] === true;
}

/** صلاحيات مستخدم بالمعرف — للبوابات الخادمية عند الحاجة */
export async function userHasPrivilege(userId: string, key: keyof VipPrivileges): Promise<boolean> {
  try {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { vipPrivileges: true } });
    return hasPrivilege(u?.vipPrivileges, key);
  } catch {
    return false;
  }
}

/* ==================== التصنيفات والألوان ==================== */

export type VerifiedType =
  | "SOVEREIGN"
  | "ADMIN_STAFF"
  | "IMPACT_ELITE"
  | "VIP_GRANT"
  | "GUEST_AUTHOR"
  | "COMMUNITY";

export const VERIFIED_TYPES: VerifiedType[] = [
  "SOVEREIGN",
  "ADMIN_STAFF",
  "IMPACT_ELITE",
  "VIP_GRANT",
  "GUEST_AUTHOR",
  "COMMUNITY",
];

export const VERIFIED_TYPE_META: Record<VerifiedType, { color: string; label: string }> = {
  SOVEREIGN: { color: SOVEREIGN_COLOR, label: "توثيق سيادي" },
  ADMIN_STAFF: { color: "#2563EB", label: "طاقم الإدارة" },
  IMPACT_ELITE: { color: "#1E3A8A", label: "عضو أهل الكلمة" },
  VIP_GRANT: { color: "#7C3AED", label: "حساب مميز" },
  GUEST_AUTHOR: { color: "#6B8E23", label: "كاتب ضيف" },
  COMMUNITY: { color: "#0D9488", label: "موثّق مجتمعيًا" },
};

export const BADGE_COLOR_PRESETS = [
  { hex: "#D97706", name: "ذهبي سيادي" },
  { hex: "#2563EB", name: "أزرق ملكي" },
  { hex: "#059669", name: "زمردي" },
  { hex: "#1E3A8A", name: "كحلي رصين" },
  { hex: "#6B8E23", name: "زيتي شرفي" },
  { hex: "#7C3AED", name: "بنفسجي فاخر" },
  { hex: "#E11D48", name: "قرمزي" },
  { hex: "#0D9488", name: "فيروزي" },
];

export function isValidHexColor(value: string | null | undefined): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

/** الرتب المقبولة في الاستوديو — OWNER لا يُمنح يدويًا أبدًا (بذر سيادي حصري) */
export const GRANTABLE_ROLES = ["USER", "MODERATOR", "EDITOR", "ADMIN"] as const;
export type GrantableRole = (typeof GRANTABLE_ROLES)[number];

export function roleLabelAr(role: string | null | undefined): string {
  switch (role) {
    case "OWNER":
      return "صاحب المنصة";
    case "ADMIN":
      return "مدير نظام";
    case "EDITOR":
      return "كاتب محتوى";
    case "MODERATOR":
      return "مشرف محتوى";
    default:
      return "مستخدم عادي";
  }
}

/* ==================== البذر السيادي لحساب المالك ==================== */

/**
 * ضمان سيادة حساب المالك — يُستدعى عند إقلاع خادم اللوحة
 * (instrumentation) وعند كل منح VIP لأي مستخدم تفسيرًا احترازيًا.
 * Idempotent: يقرأ أولًا ولا يكتب إلا ما نقص، ولا يُخفض رصيدًا أبدًا.
 */
export async function ensureOwnerSovereign(): Promise<{ seeded: boolean }> {
  try {
    const user = await prisma.user.findUnique({ where: { email: OWNER_EMAIL } });
    if (!user) return { seeded: false };

    const fullySovereign =
      user.role === "OWNER" &&
      user.isVerified &&
      user.verifiedType === "SOVEREIGN" &&
      user.vipBadgeTitle === "مؤسس المنصة" &&
      user.vipBadgeColor === SOVEREIGN_COLOR &&
      user.impactScore >= SOVEREIGN_IMPACT &&
      hasPrivilege(user.vipPrivileges, "unlimitedAiChat") &&
      hasPrivilege(user.vipPrivileges, "selfPinComment");
    if (fullySovereign) return { seeded: false };

    await prisma.user.update({
      where: { id: user.id },
      data: {
        role: "OWNER",
        banned: false,
        banReason: null,
        isVerified: true,
        verifiedType: "SOVEREIGN",
        vipBadgeTitle: "مؤسس المنصة",
        vipBadgeColor: SOVEREIGN_COLOR,
        vipReason: user.vipReason ?? "صاحب المنصة السيادي — الحساب الأسمى",
        vipGrantedAt: user.vipGrantedAt ?? new Date(),
        vipPrivileges: ALL_PRIVILEGES as never,
      },
    });

    if (user.impactScore < SOVEREIGN_IMPACT) {
      await prisma
        .$transaction([
          prisma.user.update({
            where: { id: user.id },
            data: { impactScore: SOVEREIGN_IMPACT, intellectualRank: "أهل الكلمة" },
          }),
          prisma.impactLog.create({
            data: {
              userId: user.id,
              actionType: "CALIBRATION",
              points: SOVEREIGN_IMPACT - user.impactScore,
              reason: "الرصيد السيادي لحساب صاحب المنصة — فتح دائم لكل القنوات",
              dedupKey: `SOV:${user.id}`,
            },
          }),
        ])
        .catch(async () => {
          await prisma.user
            .update({
              where: { id: user.id },
              data: { impactScore: SOVEREIGN_IMPACT, intellectualRank: "أهل الكلمة" },
            })
            .catch(() => {});
        });
    }

    if (!user.isVerified) {
      await prisma.auditEvent
        .create({
          data: {
            type: "USER_VERIFIED",
            actorType: "SYSTEM",
            actorId: user.id,
            actorLabel: user.email,
            message: "البذر السيادي: تُوّثق حساب صاحب المنصة تلقائيًا بشارة المؤسس الذهبية",
            meta: { verifiedType: "SOVEREIGN", badge: "مؤسس المنصة" },
          },
        })
        .catch(() => {});
    }

    return { seeded: true };
  } catch {
    return { seeded: false };
  }
}

/* ==================== مذيّع إشعارات التوثيق ==================== */

export type VipDispatchEvent = "GRANTED" | "MODIFIED" | "REVOKED" | "ELITE";

export type VipDispatchInput = {
  event: VipDispatchEvent;
  userId: string;
  badgeTitle?: string | null;
  badgeColor?: string | null;
  reason?: string | null;
  roleLabel?: string | null;
};

function notificationCopy(input: VipDispatchInput): { title: string; body: string } {
  const badge = input.badgeTitle || "حساب موثّق";
  switch (input.event) {
    case "GRANTED":
      return {
        title: `تهانينا! حصلت على شارة «${badge}» ✦`,
        body: `تم منح حسابك رتبة${input.roleLabel ? ` «${input.roleLabel}»` : ""} وشارة «${badge}»${
          input.badgeColor ? " بلون مميز" : ""
        }. السبب: ${input.reason ?? "تمييز إداري"}. تفقد مزاياك الفكرية الجديدة في ملفك الشخصي.`,
      };
    case "ELITE":
      return {
        title: "لقد بلغت عتبة 350 نقطة أثر! ✦",
        body: "تم توثيق حسابك رسميًا كعضو في «أهل الكلمة»، وبات بإمكانك الآن طرح ومناقشة مقترحات المقالات مباشرة مع الإدارة.",
      };
    case "MODIFIED":
      return {
        title: "تم تحديث مزايا حسابك الموثّق",
        body: `حالة توثيق حسابك: «${badge}». السبب: ${input.reason ?? "تحديث إداري"}.`,
      };
    case "REVOKED":
      return {
        title: "تم تحديث حالة توثيق حسابك",
        body: `سُحبت الشارة «${badge}». السبب: ${input.reason ?? "قرار إداري"}. شكرًا لمشاركتك، ويمكنك استعادة التمييز بالتفاعل الرصين.`,
      };
  }
}

/** قالب البريد الفاخر — مطابق لنسخة المنصة العامة */
function vipEmailHtml(input: VipDispatchInput, name: string | null): string {
  const { title, body } = notificationCopy(input);
  const badge = input.badgeTitle || "حساب موثّق";
  const color = isValidHexColor(input.badgeColor) ? input.badgeColor : "#D97706";
  return `<!doctype html><html dir="rtl" lang="ar"><body style="margin:0;padding:0;background:#faf9f7;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="text-align:center;padding:28px 24px;background:#ffffff;border-radius:16px;border:1px solid #eee7dd;">
      <p style="margin:0 0 6px;font-size:13px;color:#8a8378;letter-spacing:.5px;">كلام له لازمة</p>
      <h1 style="margin:0 0 18px;font-size:22px;color:#1c1917;">${title}</h1>
      <div style="display:inline-block;padding:8px 22px;border-radius:999px;background:${color};color:#fff;font-size:14px;font-weight:700;margin-bottom:18px;">${badge}</div>
      <p style="margin:0;font-size:15px;line-height:2;color:#44403c;">${body}</p>
      <p style="margin:22px 0 0;font-size:12px;color:#a8a29e;">${name ? `أهلاً ${name} — ` : ""}هذه رسالة نظامية من منظومة التوثيق، لا تحتاج ردًا.</p>
    </div>
    <p style="text-align:center;font-size:11px;color:#a8a29e;margin:16px 0 0;">نُشر بعناية.. لكلام له لازمة.</p>
  </div></body></html>`;
}

/** إطلاق حزمة الإشعارات الكاملة: جرس داخلي + بث ويب + بريد + توثيق مزدوج */
export async function dispatchVipNotification(input: VipDispatchInput): Promise<{
  inApp: boolean;
  pushSent: boolean;
  emailSent: boolean;
}> {
  const { title, body } = notificationCopy(input);
  let inApp = false;
  let pushSent = false;
  let emailSent = false;

  let user: { id: string; email: string | null; customName: string | null; name: string | null } | null = null;
  try {
    user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true, email: true, customName: true, name: true },
    });
    if (!user) return { inApp: false, pushSent: false, emailSent: false };
    await prisma.userNotification.create({
      data: { userId: user.id, title, body, url: "/profile", kind: "TARGETED" },
    });
    inApp = true;
  } catch {}

  try {
    const { pushUsers } = await import("@/lib/push");
    const sent = await pushUsers(
      { title, body: body.slice(0, 220), url: "/profile", tag: `vip-${input.event.toLowerCase()}` },
      { userIds: [user!.id] },
    );
    pushSent = sent > 0;
  } catch {}

  try {
    const key = process.env.RESEND_API_KEY;
    if (key && user!.email) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: process.env.SECURITY_EMAIL_FROM ?? "كلام له لازمة <onboarding@resend.dev>",
          to: [user!.email],
          subject: title,
          html: vipEmailHtml(input, user!.customName ?? user!.name),
        }),
      });
      emailSent = res.ok;
    }
  } catch {}

  try {
    await prisma.auditEvent.create({
      data: {
        type: "NOTIFICATION_DISPATCHED_VIP",
        actorType: "SYSTEM",
        actorId: user!.id,
        actorLabel: user!.email,
        message: title,
        meta: {
          event: input.event,
          badge: input.badgeTitle ?? null,
          color: input.badgeColor ?? null,
          reason: input.reason ?? null,
          channels: { inApp, push: pushSent, email: emailSent },
        },
      },
    });
  } catch {}

  return { inApp, pushSent, emailSent };
}

/* ==================== المنح والسحب — المنطق الموحد ==================== */

export type GrantVipInput = {
  userId: string;
  role?: GrantableRole;
  badgeTitle: string; // إلزامي
  badgeColor: string; // إلزامي
  reason: string; // إلزامي — سبب منح التمييز
  privileges?: VipPrivileges;
  welcomePoints?: number; // رصيد أثر ترحيبي فوري
  vipBadgeKind?: VerifiedType; // تصنيف التوثيق — الافتراضي VIP_GRANT
};

export type GrantVipResult = {
  ok: boolean;
  user: { id: string; label: string; email: string | null };
  badgeTitle: string;
  badgeColor: string;
  role: string;
  privileges: VipPrivileges;
  welcomePoints: number;
  impactScore?: number;
  rank?: string;
  dispatch: { inApp: boolean; pushSent: boolean; emailSent: boolean };
};

/**
 * منح/تحديث تمييز حساب — إلزاميات صارمة: شارة نصية + لون سداسي سليم + سبب.
 * سير العمل الذري: تحديث الحقول → النقاط الترحيبية (أثر موثق) → الإشعارات
 * → التوثيق المزدوج. حفظ السبب في السجل شرط لنجاح العملية كلها.
 */
export async function grantVip(
  input: GrantVipInput,
  actor: { adminId: string | null; adminUsername: string; ip: string | null; via: string },
): Promise<GrantVipResult> {
  const badgeTitle = input.badgeTitle?.trim() ?? "";
  const badgeColor = input.badgeColor?.trim().toUpperCase() ?? "";
  const reason = input.reason?.trim() ?? "";

  if (badgeTitle.length < 2 || badgeTitle.length > 40) {
    throw new Error("مسمى الشارة إلزامي (من حرفين إلى 40 حرفًا)");
  }
  if (!isValidHexColor(badgeColor)) {
    throw new Error("لون الشارة يجب أن يكون كودًا سداسيًا سليمًا مثل #D97706");
  }
  if (reason.length < 3) {
    throw new Error("سبب منح التمييز إلزامي — يُحفظ في السجل ويظهر في إشعار المستخدم");
  }
  const role = input.role && GRANTABLE_ROLES.includes(input.role) ? input.role : undefined;
  const welcomePoints = Math.floor(Number(input.welcomePoints) || 0);
  if (welcomePoints < 0 || welcomePoints > 10000) {
    throw new Error("الرصيد الترحيبي بين 0 و10000 نقطة");
  }

  const target = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, customName: true, name: true, email: true, banned: true, impactScore: true },
  });
  if (!target) throw new Error("لا يوجد مستخدم مطابق");
  if (target.email?.toLowerCase() === OWNER_EMAIL) {
    throw new Error("حساب صاحب المنصة سيادي بالبذر التلقائي — لا يُعدل يدويًا");
  }
  const label = target.customName ?? target.name ?? target.email ?? target.id;

  const privileges: VipPrivileges = {};
  for (const key of PRIVILEGE_KEYS) {
    if (input.privileges?.[key] === true) privileges[key] = true;
  }

  const kind: VerifiedType =
    input.vipBadgeKind && VERIFIED_TYPES.includes(input.vipBadgeKind) ? input.vipBadgeKind : "VIP_GRANT";

  await prisma.user.update({
    where: { id: target.id },
    data: {
      ...(role ? { role } : {}),
      isVerified: true,
      verifiedType: kind,
      vipBadgeTitle: badgeTitle,
      vipBadgeColor: badgeColor,
      vipReason: reason,
      vipGrantedAt: new Date(),
      vipPrivileges: privileges as never,
    },
  });

  let impactScore: number | undefined;
  let rank: string | undefined;
  if (welcomePoints > 0) {
    try {
      const { awardImpact } = await import("@/lib/impact");
      const result = await awardImpact({
        userId: target.id,
        actionType: "ADMIN_ADJUST",
        points: welcomePoints,
        reason: `رصيد ترحيبي مع منح شارة «${badgeTitle}» — ${reason}`,
      });
      impactScore = result.impactScore;
      rank = result.rank;
    } catch {
      /* فشل النقاط لا يُسقط المنحة نفسها */
    }
  }

  const dispatch = await dispatchVipNotification({
    event: "GRANTED",
    userId: target.id,
    badgeTitle,
    badgeColor,
    reason,
    roleLabel: role ? roleLabelAr(role) : null,
  });

  await writeAudit({
    adminId: actor.adminId,
    action: "user.vip_granted",
    entity: "User",
    entityId: target.id,
    meta: {
      via: actor.via,
      by: actor.adminUsername,
      user: label,
      badge: badgeTitle,
      color: badgeColor,
      kind,
      role: role ?? "unchanged",
      privileges,
      welcomePoints,
      reason,
      notify: dispatch,
    },
    ip: actor.ip,
  });
  await writeTrail({
    actorId: actor.adminId ?? actor.adminUsername,
    actorEmail: actor.adminUsername,
    actorRole: actor.adminUsername === "gemini-spark" ? "SYSTEM" : "ADMIN",
    actionCategory: "ADMIN_VIP_CHANGE",
    actionType: "VIP_GRANTED",
    targetId: target.id,
    targetEmail: target.email,
    reason,
    metadata: {
      via: actor.via,
      badge: badgeTitle,
      color: badgeColor,
      kind,
      role: role ?? "unchanged",
      privileges,
      welcomePoints,
      ip: actor.ip,
    },
  });

  return {
    ok: true,
    user: { id: target.id, label, email: target.email },
    badgeTitle,
    badgeColor,
    role: role ?? "unchanged",
    privileges,
    welcomePoints,
    impactScore,
    rank,
    dispatch,
  };
}

export type RevokeVipInput = {
  userId: string;
  reason: string; // إلزامي — يظهر في إشعار المستخدم
};

/** سحب التوثيق والتمييز كليًا — الرتبة تعود USER والرصيد لا يُمس أبدًا */
export async function revokeVip(
  input: RevokeVipInput,
  actor: { adminId: string | null; adminUsername: string; ip: string | null; via: string },
): Promise<{ ok: boolean; user: { id: string; label: string; email: string | null } }> {
  const reason = input.reason?.trim() ?? "";
  if (reason.length < 3) {
    throw new Error("سبب السحب إلزامي — يظهر في إشعار المستخدم ويُوثق في السجل");
  }

  const target = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, customName: true, name: true, email: true, isVerified: true, vipBadgeTitle: true },
  });
  if (!target) throw new Error("لا يوجد مستخدم مطابق");
  if (target.email?.toLowerCase() === OWNER_EMAIL) {
    throw new Error("حساب صاحب المنصة سيادي دائم — لا يُسحب توثيقه");
  }
  const label = target.customName ?? target.name ?? target.email ?? target.id;

  if (!target.isVerified) throw new Error("الحساب غير موثق أصلًا");
  const oldBadge = target.vipBadgeTitle ?? "حساب موثّق";

  await prisma.user.update({
    where: { id: target.id },
    data: {
      role: "USER",
      isVerified: false,
      verifiedType: null,
      vipBadgeTitle: null,
      vipBadgeColor: null,
      vipReason: null,
      vipGrantedAt: null,
      vipPrivileges: Prisma.JsonNull,
    },
  });

  await dispatchVipNotification({
    event: "REVOKED",
    userId: target.id,
    badgeTitle: oldBadge,
    reason,
  });

  await writeAudit({
    adminId: actor.adminId,
    action: "user.vip_revoked",
    entity: "User",
    entityId: target.id,
    meta: { via: actor.via, by: actor.adminUsername, user: label, oldBadge, reason },
    ip: actor.ip,
  });
  await writeTrail({
    actorId: actor.adminId ?? actor.adminUsername,
    actorEmail: actor.adminUsername,
    actorRole: actor.adminUsername === "gemini-spark" ? "SYSTEM" : "ADMIN",
    actionCategory: "ADMIN_VIP_CHANGE",
    actionType: "VIP_REVOKED",
    targetId: target.id,
    targetEmail: target.email,
    reason,
    metadata: { via: actor.via, oldBadge, ip: actor.ip },
  });

  return { ok: true, user: { id: target.id, label, email: target.email } };
}
