import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, isRejected, writeAudit, getClientIp, raiseAlert } from "@/lib/guard";
import { setCommentFeatured } from "@/lib/impact";
import { pushUsers } from "@/lib/push";
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

      /* بث فوري لهاتف المعلّق — زينة لا تعطل أبدًا */
      const comment = await prisma.comment.findUnique({
        where: { id },
        select: { userId: true, article: { select: { slug: true, title: true } } },
      });
      if (comment) {
        void pushUsers(
          {
            title: body.isInspiring ? "تم تمييز تعليقك كتعليق ملهم ✦" : "أُلغي تمييز تعليقك",
            body: body.isInspiring
              ? `+10 نقاط أثر بمقال «${comment.article.title.slice(0, 50)}» — السبب: ${reason.slice(0, 80)}`
              : `-10 نقاط أثر بمقال «${comment.article.title.slice(0, 50)}» — السبب: ${reason.slice(0, 80)}`,
            url: `/article/${comment.article.slug}`,
            tag: body.isInspiring ? "inspiring-comment" : "uninspiring-comment",
          },
          { userIds: comment.userId ? [comment.userId] : [] },
        );

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

      return NextResponse.json({
        ok: true,
        inspiring: body.isInspiring,
        pointsDelta: result.points,
        impactScore: result.impactScore,
      });
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
