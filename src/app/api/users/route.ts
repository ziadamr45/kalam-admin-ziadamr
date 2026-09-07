import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, isRejected, writeAudit, getClientIp } from "@/lib/guard";

/** إدارة المستخدمين: قائمة + حظر/فك حظر */
export async function GET(request: Request) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
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
    const body = (await request.json()) as { userId?: string; banned?: boolean; banReason?: string };
    if (!body.userId) {
      return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });
    }

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
