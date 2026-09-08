import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, isRejected, writeAudit, getClientIp } from "@/lib/guard";
import { awardImpact } from "@/lib/impact";

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
      action?: "adjust-impact" | "reset-identity";
      delta?: number;
      reason?: string;
    };
    if (!body.userId) {
      return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });
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
      ip: getClientIp(request),
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}
