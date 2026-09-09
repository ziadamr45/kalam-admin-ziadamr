import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, isRejected, writeAudit, getClientIp, getUserAgent } from "@/lib/guard";
import { awardImpact } from "@/lib/impact";
import { grantVip, revokeVip, grantVerification, revokeVerification, type VipPrivileges, type GrantableRole, type VerificationType } from "@/lib/vip";
import { hardDeleteUser, isHardDeleteReason } from "@/lib/hard-delete";
import { writeTrail } from "@/lib/audit-trail";

/**
 * إدارة المستخدمين: قائمة + حظر/فك حظر + تعديل رصيد الأثر يدويًا
 * (منح/خصم بسبب موثق) + تصفير الهوية المخصصة عند الانتهاك.
 */

export async function GET(request: Request) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  try {
    const users = await prisma.user.findMany({
      orderBy: [{ impactScore: "desc" }, { createdAt: "desc" }],
      take: 200,
      include: { _count: { select: { comments: true } } },
    });
    return NextResponse.json({ users });
  } catch {
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  try {
    const body = (await request.json()) as {
      userId?: string;
      banned?: boolean;
      banReason?: string;
      action?:
        | "adjust-impact"
        | "reset-identity"
        | "grant-vip"
        | "revoke-vip"
        | "grant-verification"
        | "revoke-verification"
        | "hard-delete";
      delta?: number;
      reason?: string;
      /* حقول استوديو العضوية المميزة */
      role?: GrantableRole;
      badgeTitle?: string;
      badgeColor?: string;
      privileges?: VipPrivileges;
      welcomePoints?: number;
      resetRole?: boolean;
      /* حقول استوديو التوثيق الرسمي */
      verificationType?: VerificationType;
      verificationLabel?: string;
      /* حقول الحذف السيادي */
      reasonCode?: string;
      evidenceUrl?: string;
    };
    if (!body.userId) {
      return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });
    }

    /* ============ منح/تحديث تمييز حساب — استوديو VIP ============ */
    if (body.action === "grant-vip") {
      try {
        const result = await grantVip(
          {
            userId: body.userId,
            role: body.role,
            badgeTitle: body.badgeTitle ?? "",
            badgeColor: body.badgeColor ?? "",
            reason: body.reason ?? "",
            privileges: body.privileges,
            welcomePoints: body.welcomePoints,
          },
          {
            adminId: guard.adminId,
            adminUsername: guard.username ?? "admin",
            ip: getClientIp(request),
            via: "studio",
          },
        );
        return NextResponse.json(result);
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "تعذر المنح" },
          { status: 400 },
        );
      }
    }

    /* ============ سحب العضوية المميزة فقط — التوثيق الرسمي لا يُمس ============ */
    if (body.action === "revoke-vip") {
      try {
        const result = await revokeVip(
          { userId: body.userId, reason: body.reason ?? "", resetRole: Boolean(body.resetRole) },
          {
            adminId: guard.adminId,
            adminUsername: guard.username ?? "admin",
            ip: getClientIp(request),
            via: "studio",
          },
        );
        return NextResponse.json(result);
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "تعذر السحب" },
          { status: 400 },
        );
      }
    }

    /* ============ منح التوثيق الرسمي — إثبات هوية فقط بلا امتيازات ============ */
    if (body.action === "grant-verification") {
      try {
        const result = await grantVerification(
          {
            userId: body.userId,
            verificationType: (body.verificationType ?? "OFFICIAL_AUTHOR") as VerificationType,
            label: body.verificationLabel ?? null,
            reason: body.reason ?? null,
          },
          {
            adminId: guard.adminId,
            adminUsername: guard.username ?? "admin",
            ip: getClientIp(request),
            via: "studio",
          },
        );
        return NextResponse.json(result);
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "تعذر منح التوثيق" },
          { status: 400 },
        );
      }
    }

    /* ============ سحب التوثيق الرسمي فقط — العضوية المميزة لا تُمس ============ */
    if (body.action === "revoke-verification") {
      try {
        const result = await revokeVerification(
          { userId: body.userId, reason: body.reason ?? null },
          {
            adminId: guard.adminId,
            adminUsername: guard.username ?? "admin",
            ip: getClientIp(request),
            via: "studio",
          },
        );
        return NextResponse.json(result);
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "تعذر سحب التوثيق" },
          { status: 400 },
        );
      }
    }

    /* ============ تعديل رصيد الأثر يدويًا (منح/خصم بسبب موثق) ============ */
    if (body.action === "adjust-impact") {
      const delta = Math.floor(Number(body.delta));
      const reason = body.reason?.trim() ?? "";
      if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 5000) {
        return NextResponse.json({ error: "قيمة النقاط غير صالحة (±1 إلى ±5000)" }, { status: 400 });
      }
      if (reason.length < 3) {
        return NextResponse.json({ error: "اذكر سبب التعديل — يُوثَّق في سجل الأثر" }, { status: 400 });
      }

      const target = await prisma.user.findUnique({
        where: { id: body.userId },
        select: { id: true, banned: true },
      });
      if (!target) return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });

      const result = await awardImpact({
        userId: target.id,
        actionType: "ADMIN_ADJUST",
        points: delta,
        reason,
      });

      await writeAudit({
        adminId: guard.adminId,
        action: delta > 0 ? "impact.granted" : "impact.deducted",
        entity: "User",
        entityId: target.id,
        meta: { delta, reason, newScore: result.impactScore, newRank: result.rank },
        ip: getClientIp(request),
      });

      return NextResponse.json({
        ok: true,
        awarded: result.awarded,
        impactScore: result.impactScore,
        rank: result.rank,
      });
    }

    /* ============ تصفير الهوية المخصصة — عودة لحالة Google الأصلية ============ */
    if (body.action === "reset-identity") {
      const target = await prisma.user.findUnique({
        where: { id: body.userId },
        select: { id: true, customName: true, customImage: true },
      });
      if (!target) return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });
      if (!target.customName && !target.customImage) {
        return NextResponse.json({ error: "لا هوية مخصصة لتصفيرها" }, { status: 400 });
      }

      await prisma.user.update({
        where: { id: target.id },
        data: { customName: null, customImage: null, bio: null },
      });

      await writeAudit({
        adminId: guard.adminId,
        action: "user.identity_reset",
        entity: "User",
        entityId: target.id,
        meta: { clearedName: target.customName, clearedImage: Boolean(target.customImage) },
        ip: getClientIp(request),
      });

      return NextResponse.json({ ok: true });
    }

    /* ============ الحذف السيادي الشامل — محو برمجي كامل موثق بالدليل ============ */
    if (body.action === "hard-delete") {
      const reasonCode = body.reasonCode ?? "";
      if (!isHardDeleteReason(reasonCode)) {
        return NextResponse.json({ error: "اختر سببًا رسميًا من الأسباب الثلاثة المعتمدة" }, { status: 400 });
      }
      try {
        const result = await hardDeleteUser(
          {
            userId: body.userId,
            reason: body.reason ?? "",
            reasonCode,
            evidenceUrl: body.evidenceUrl ?? null,
          },
          {
            adminId: guard.adminId,
            actorEmail: guard.username ?? "admin",
            actorRole: "ADMIN",
            ip: getClientIp(request),
            userAgent: getUserAgent(request),
            via: "studio",
          },
        );
        return NextResponse.json(result);
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "تعذر إتمام المحو السيادي" },
          { status: 400 },
        );
      }
    }

    /* ============ الحظر / رفع الحظر (السلوك الأصلي) ============ */
    const user = await prisma.user.update({
      where: { id: body.userId },
      data: {
        banned: Boolean(body.banned),
        banReason: body.banned ? body.banReason || "مخالفة أدب الحوار" : null,
      },
    });

    await writeAudit({
      adminId: guard.adminId,
      action: body.banned ? "user.banned" : "user.unbanned",
      entity: "User",
      entityId: user.id,
      meta: { reason: body.banned ? body.banReason ?? "مخالفة أدب الحوار" : null },
      ip: getClientIp(request),
    });
    await writeTrail({
      actorId: guard.adminId,
      actorEmail: guard.username ?? "admin",
      actorRole: "ADMIN",
      actionCategory: "ADMIN_MODERATION",
      actionType: body.banned ? "ACCOUNT_BANNED" : "ACCOUNT_UNBANNED",
      targetId: user.id,
      targetEmail: user.email,
      reason: body.banned ? body.banReason ?? "مخالفة أدب الحوار" : "رفع الحظر بقرار إداري",
      metadata: { via: "studio", ip: getClientIp(request) },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}
