import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, isRejected, writeAudit, getClientIp, raiseAlert } from "@/lib/guard";
import { awardImpact, IMPACT_POINTS } from "@/lib/impact";
import { pushUsers } from "@/lib/push";
import { articleRevalidatePaths, revalidatePublicPaths } from "@/lib/revalidate";

type Params = { params: Promise<{ id: string }> };

/**
 * مركز إدارة التعليقات:
 * PATCH — اعتماد/رفض/تعديل تعليق + تمييز «تعليق فكري ملهم» (+30 أثر وتثبيت أعلى المقال)
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
    };

    const data: Record<string, unknown> = {};
    if (body.status) data.status = body.status;
    if (body.content !== undefined) {
      data.content = body.content.trim();
      data.editedByAdmin = true;
    }

    /* ============ تمييز «تعليق فكري ملهم» — سيادة الأدمن ============ */
    if (typeof body.isInspiring === "boolean") {
      const comment = await prisma.comment.findUnique({
        where: { id },
        include: { user: { select: { id: true, banned: true } }, article: { select: { slug: true, title: true } } },
      });
      if (!comment) return NextResponse.json({ error: "التعليق غير موجود" }, { status: 404 });

      if (body.isInspiring) {
        if (!comment.userId || comment.user?.banned) {
          return NextResponse.json(
            { error: "التمييز للتعليقات المسجلة بحساب نشط فقط" },
            { status: 400 },
          );
        }

        /* العلم + المنح الذري في معاملة منطقية واحدة (قيد فريد يمنع ازدواج +30) */
        await prisma.comment.update({ where: { id }, data: { isInspiring: true } });
        const award = await awardImpact({
          userId: comment.userId,
          actionType: "COMMENT_INSPIRING",
          points: IMPACT_POINTS.COMMENT_INSPIRING,
          articleId: comment.articleId,
          dedupKey: `INSPIRE:${comment.id}`,
          reason: `تمييز تعليقه عن «${comment.article.title}»`,
        });

        /* إشعار داخل الجرس + ويب فوري لهاتف المعلّق */
        await prisma.userNotification
          .create({
            data: {
              userId: comment.userId,
              title: "تعليقك حاز تمييز «فكري ملهم» ✦",
              body: `ميّز فريق التحرير تعليقك عن «${comment.article.title}» ومنحك +${IMPACT_POINTS.COMMENT_INSPIRING} رصيد أثر، وثبّته أعلى حوار المقال.`,
              url: `/article/${comment.article.slug}`,
              kind: "TARGETED",
            },
          })
          .catch(() => {});
        void pushUsers({
          title: "تعليقك حاز تمييز «فكري ملهم» ✦",
          body: `+${IMPACT_POINTS.COMMENT_INSPIRING} رصيد أثر — وتعليقك مثبَّت أعلى حوار المقال`,
          url: `/article/${comment.article.slug}`,
          tag: "inspiring-comment",
        }, { userIds: [comment.userId] });

        /* تحديث صفحة المقال على المنصة فورًا (التثبيت أعلى الحوار) */
        await revalidatePublicPaths(
          articleRevalidatePaths({ slug: comment.article.slug, sectionSlug: null }),
        ).catch(() => {});

        await writeAudit({
          adminId: guard.adminId,
          action: "comment.inspiring",
          entity: "Comment",
          entityId: id,
          meta: { awarded: award.awarded, points: IMPACT_POINTS.COMMENT_INSPIRING },
          ip: getClientIp(request),
        });

        return NextResponse.json({ ok: true, inspiring: true, awarded: award.awarded });
      }

      /* إلغاء التمييز — الشارة والتثبيت يُرفعان (النقاط الموثقة سلفًا تبقى في السجل) */
      await prisma.comment.update({ where: { id }, data: { isInspiring: false } });
      await revalidatePublicPaths(
        articleRevalidatePaths({ slug: comment.article.slug, sectionSlug: null }),
      ).catch(() => {});

      await writeAudit({
        adminId: guard.adminId,
        action: "comment.uninspiring",
        entity: "Comment",
        entityId: id,
        ip: getClientIp(request),
      });

      return NextResponse.json({ ok: true, inspiring: false });
    }

    const comment = await prisma.comment.update({
      where: { id },
      data: data as never,
      include: { user: { select: { email: true, name: true } }, article: { select: { slug: true } } },
    });

    await writeAudit({
      adminId: guard.adminId,
      action: body.status ? `comment.${body.status.toLowerCase()}` : "comment.edited",
      entity: "Comment",
      entityId: id,
      ip: getClientIp(request),
    });

    return NextResponse.json({ comment });
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
      ip: getClientIp(request),
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}
