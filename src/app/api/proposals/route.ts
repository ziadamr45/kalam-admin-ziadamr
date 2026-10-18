import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, isRejected, writeAudit, getClientIp } from "@/lib/guard";

/** مقترحات «أهل الكلمة» — القناة الخاصة لأصحاب أعلى رتبة فكرية */
export async function GET(request: Request) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  try {
    const proposals = await prisma.userProposal.findMany({
      orderBy: [{ handled: "asc" }, { createdAt: "desc" }],
      take: 150,
      include: {
        user: {
          select: {
            name: true,
            email: true,
            image: true,
            customName: true,
            customImage: true,
            impactScore: true,
            intellectualRank: true,
          },
        },
      },
    });
    return NextResponse.json({ proposals });
  } catch {
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}

/** تعليم المقترح كمُعالَج */
export async function PATCH(request: Request) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  try {
    const body = (await request.json()) as { id?: string; handled?: boolean };
    if (!body.id) return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });

    await prisma.userProposal.update({
      where: { id: body.id },
      data: { handled: Boolean(body.handled) },
    });

    await writeAudit({
      adminId: guard.adminId,
      action: body.handled ? "proposal.handled" : "proposal.reopened",
      entity: "UserProposal",
      entityId: body.id,
      ip: getClientIp(request),
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}
