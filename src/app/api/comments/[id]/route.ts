import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, isRejected, writeAudit, getClientIp, raiseAlert } from "@/lib/guard";

type Params = { params: Promise<{ id: string }> };

/**
 * مركز إدارة التعليقات:
 * PATCH — اعتماد/رفض/تعديل تعليق
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
    };

    const data: Record<string, unknown> = {};
    if (body.status) data.status = body.status;
    if (body.content !== undefined) {
      data.content = body.content.trim();
      data.editedByAdmin = true;
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
