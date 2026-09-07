import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, isRejected, writeAudit, getClientIp } from "@/lib/guard";

/** تعليم كمقروءة / أرشفة / استرجاع / حذف رسالة */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  try {
    const { id } = await params;
    const body = (await request.json()) as { read?: boolean; archived?: boolean };

    const message = await prisma.contactMessage.update({
      where: { id },
      data: {
        ...(typeof body.read === "boolean" ? { read: body.read } : {}),
        ...(typeof body.archived === "boolean" ? { archived: body.archived } : {}),
      },
    });

    return NextResponse.json({ message });
  } catch {
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  try {
    const { id } = await params;
    await prisma.contactMessage.delete({ where: { id } });

    await writeAudit({
      adminId: guard.adminId,
      action: "message.deleted",
      entity: "ContactMessage",
      entityId: id,
      ip: getClientIp(request),
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}
