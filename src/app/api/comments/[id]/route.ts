import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, isRejected, writeAudit, getClientIp, raiseAlert } from "@/lib/guard";
import { setCommentFeatured, awardImpact } from "@/lib/impact";
import { dispatchNotification } from "@/lib/notifications/dispatcher";
import { writeTrail } from "@/lib/audit-trail";
import { articleRevalidatePaths, revalidatePublicPaths } from "@/lib/revalidate";

type Params = { params: Promise<{ id: string }> };

/**
 * مركز إدارة التعليقات:
 * PATCH — اعتماد/رفض/تعديل تعليق + تمييز/إلغاء تمييز «تعليق ملهم»
 *         (معاملة ذرّية: +10 عند التمييز و-10 عكسية عند إلغائه — السبب إلزامي موثق)
 * DELETE — حذف نهائي
 * POST — حظر المستخدم المخالف نهائيًا (عبر body بـ ?action=ban-user)
 */
export async function PATCH(request: Request, { params }: Params) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  const { id } = await params;

  try {
    const body = (await request.json()) as {
      status?: "APPROVED" | "REJECTED" | "PENDING";
      content?: string;
      isInspiring?: boolean;
      reason?: string;
    };

    const data: Record<string, unknown> = {};
    if (body.status) data.status = body.status;
    if (body.content !== undefined) {
      data.content = body.content.trim();
      data.editedByAdmin = true;
    }

    /* ============ تمييز/إلغاء تمييز «تعليق ملهم» — سيادة الأدمن ============
       السبب إلزامي في الاتجاهين (5 أحرف فأكثر) ويُوثَّق في سجل أثر القارئ
       وفي إشعاره وفي تدقيق اللوحة — لا تمييز صامت ولا خصم صامت. */
    if (typeof body.isInspiring === "boolean") {
      const reason = (body.reason ?? "").trim();
      if (reason.length < 5) {
        return NextResponse.json(
          {
            error: body.isInspiring
              ? "سبب التمييز إلزامي — اكتب 5 أحرف فأكثر (مثل: إضافة فكرية قيّمة، تلخيص رائع)"
              : "سبب إلغاء التمييز إلزامي — اكتب 5 أحرف فأكثر (مثل: مراجعة التنسيق، التعليق لا يستوفي الشروط)",
          },
          { status: 400 },
        );
      }

      const result = await setCommentFeatured({
        commentId: id,
        featured: body.isInspiring,
        reason,
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }

      /* الإشعار مرّ عبر المرسل المركزي داخل setCommentFeatured — يبقى جلب التعليق لتحديث الصفحة والتوثيق */
      const comment = await prisma.comment.findUnique({
        where: { id },
        select: { userId: true, article: { select: { slug: true, title: true } } },
      });
      if (comment) {
        /* تحديث صفحة المقال على المنصة فورًا (التثبيت أعلى الحوار) */
        await revalidatePublicPaths(
          articleRevalidatePaths({ slug: comment.article.slug, sectionSlug: null }),
        ).catch(() => {});
      }

      await writeAudit({
        adminId: guard.adminId,
        action: body.isInspiring ? "comment.inspiring" : "comment.uninspiring",
        entity: "Comment",
        entityId: id,
        meta: {
          reason,
          pointsDelta: result.points,
          impactScore: result.impactScore,
          rank: result.rank,
        },
        ip: getClientIp(request),
      });
      await writeTrail({
        actorId: guard.adminId,
        actorEmail: guard.username ?? "admin",
        actorRole: "ADMIN",
        actionCategory: "ADMIN_MODERATION",
        actionType: body.isInspiring ? "COMMENT_FEATURED" : "COMMENT_UNFEATURED",
        targetId: id,
        targetEmail: comment?.userId ?? null,
        reason,
        metadata: {
          via: "studio",
          ip: getClientIp(request),
          pointsDelta: result.points,
          articleSlug: comment?.article.slug ?? null,
        },
      });

      return NextResponse.json({
        ok: true,
        inspiring: body.isInspiring,
        pointsDelta: result.points,
        impactScore: result.impactScore,
      });
    }

    /* حالة التعليق قبل التغيير — لالتقاط انتقال «بانتظار المراجعة → معتمد» تحديدًا */
    const before = await prisma.comment.findUnique({
      where: { id },
      select: {
        status: true,
        userId: true,
        articleId: true,
        article: { select: { slug: true, title: true, section: { select: { slug: true } } } },
      },
    });

    const comment = await prisma.comment.update({
      where: { id },
      data: data as never,
      include: { user: { select: { email: true, name: true } }, article: { select: { slug: true } } },
    });

    /* ============ اعتماد تعليق معلق → +2 نقطة أثر لصاحبه ============
       awardImpact معاملة ذرّية: قيد ImpactLog بنوع COMMENT_APPROVED
       ومفتاح COMMENT:{id} الفريد — من حصل على نقطتيه لحظة الإرسال
       (تدقيق AI منخفض المخاطر) يصله رفض المنح آمنًا (DUPLICATE)،
       ومن فوّتهما (تعليق قصير أو مخاطرة أعلى) يستلمهما الآن عند الاعتماد. */
    const approved =
      body.status === "APPROVED" && before !== null && before.status !== "APPROVED" && before.userId !== null;
    let impact: { awarded: boolean; points: number; impactScore: number; rank: string } | null = null;
    if (approved && before && before.userId) {
      impact = await awardImpact({
        userId: before.userId,
        actionType: "COMMENT_APPROVED",
        points: 2,
        articleId: before.articleId,
        dedupKey: `COMMENT:${id}`,
        reason: "نشر تعليق فكري معتمد",
      }).catch(() => null);

      /* إشعار الاعتماد عبر المرسل المركزي الموحد — النص يعكس ما حدث فعلًا للنقاط */
      void dispatchNotification({
        userId: before.userId,
        type: "COMMENT_APPROVED",
        title: "تم اعتماد تعليقك ونشره على المنصة",
        message: impact?.awarded
          ? `وصل تعليقك إلى القراء بمقال «${before.article.title}» وأُضيفت +2 نقطة إلى رصيد أثرك.`
          : `وصل تعليقك إلى القراء بمقال «${before.article.title}».`,
        link: `/article/${before.article.slug}#comments`,
        pushTag: "comment-approved",
        metadata: { commentId: id, points: impact?.awarded ? impact.points : 0 },
        channels: "ALL",
      }).catch(() => {});

      /* تحديث صفحة المقال فورًا — التعليق يظهر للقراء لحظة الاعتماد */
      await revalidatePublicPaths(
        articleRevalidatePaths({
          slug: before.article.slug,
          sectionSlug: before.article.section?.slug ?? null,
        }),
      ).catch(() => {});
    }

    await writeAudit({
      adminId: guard.adminId,
      action: body.status ? `comment.${body.status.toLowerCase()}` : "comment.edited",
      entity: "Comment",
      entityId: id,
      meta: impact?.awarded ? { impactPoints: impact.points, impactScore: impact.impactScore } : undefined,
      ip: getClientIp(request),
    });

    if (approved) {
      await writeTrail({
        actorId: guard.adminId,
        actorEmail: guard.username ?? "admin",
        actorRole: "ADMIN",
        actionCategory: "ADMIN_MODERATION",
        actionType: "COMMENT_APPROVED",
        targetId: id,
        targetEmail: comment.user?.email ?? null,
        reason: "نشر تعليق فكري معتمد",
        metadata: {
          via: "studio",
          ip: getClientIp(request),
          pointsDelta: impact?.awarded ? impact.points : 0,
          articleSlug: before.article.slug,
        },
      });
    }

    return NextResponse.json({ comment, impact });
  } catch {
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  const { id } = await params;
  await prisma.comment.delete({ where: { id } });

  await writeAudit({
    adminId: guard.adminId,
    action: "comment.deleted",
    entity: "Comment",
    entityId: id,
    ip: getClientIp(request),
  });

  return NextResponse.json({ ok: true });
}

/** حظر صاحب التعليق نهائيًا */
export async function POST(request: Request, { params }: Params) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  const { id } = await params;

  try {
    const body = (await request.json()) as { banReason?: string };
    const comment = await prisma.comment.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!comment?.userId) {
      return NextResponse.json({ error: "التعليق من زائر غير مسجل — احذفه فقط" }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: comment.userId },
      data: { banned: true, banReason: body.banReason || "مخالفة أدب الحوار والقيم" },
    });
    /* إخفاء كل تعليقاته السابقة غير المعتمدة */
    await prisma.comment.updateMany({
      where: { userId: comment.userId, status: "PENDING" },
      data: { status: "REJECTED" },
    });

    await raiseAlert({
      type: "USER_BANNED",
      severity: "INFO",
      message: `حُظر مستخدم نهائيًا: ${comment.userId}`,
      meta: { commentId: id, by: guard.username },
    });
    await writeAudit({
      adminId: guard.adminId,
      action: "user.banned",
      entity: "User",
      entityId: comment.userId,
      meta: { reason: body.banReason || "مخالفة أدب الحوار والقيم", commentId: id },
      ip: getClientIp(request),
    });
    await writeTrail({
      actorId: guard.adminId,
      actorEmail: guard.username ?? "admin",
      actorRole: "ADMIN",
      actionCategory: "ADMIN_MODERATION",
      actionType: "ACCOUNT_BANNED",
      targetId: comment.userId,
      reason: body.banReason || "مخالفة أدب الحوار والقيم",
      metadata: { via: "studio:comments", ip: getClientIp(request), commentId: id },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}
