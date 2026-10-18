import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, isRejected } from "@/lib/guard";

/** التنبيهات الأمنية — آخر 100 تنبيه + تعليم كمُعالج */
export async function GET(request: Request) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  const alerts = await prisma.securityAlert.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const unresolved = alerts.filter((a) => !a.resolved).length;
  return NextResponse.json({ alerts, unresolved });
}

export async function PATCH(request: Request) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  try {
    const body = (await request.json()) as { id?: string; resolveAll?: boolean };
    if (body.resolveAll) {
      await prisma.securityAlert.updateMany({
        where: { resolved: false },
        data: { resolved: true },
      });
      return NextResponse.json({ ok: true });
    }
    if (body.id) {
      await prisma.securityAlert.update({
        where: { id: body.id },
        data: { resolved: true },
      });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}
