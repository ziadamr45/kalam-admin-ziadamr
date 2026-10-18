import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, isRejected, writeAudit, getClientIp } from "@/lib/guard";

/** الأجهزة الموثوقة — قائمة + إبطال */
export async function GET(request: Request) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  const devices = await prisma.trustedDevice.findMany({
    where: { adminId: guard.adminId },
    orderBy: { lastSeenAt: "desc" },
  });
  return NextResponse.json({ devices });
}

export async function DELETE(request: Request) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  const url = new URL(request.url);
  const deviceId = url.searchParams.get("id");
  if (!deviceId) return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });

  await prisma.trustedDevice.deleteMany({
    where: { id: deviceId, adminId: guard.adminId },
  });

  await writeAudit({
    adminId: guard.adminId,
    action: "security.device_revoked",
    entity: "TrustedDevice",
    entityId: deviceId,
    ip: getClientIp(request),
  });

  return NextResponse.json({ ok: true });
}
