import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword, validatePasswordStrength } from "@/lib/password";
import { revokeOtherSessions } from "@/lib/session";
import { requireSession, isRejected, writeAudit, getClientIp } from "@/lib/guard";

/** تغيير كلمة المرور — يعيد تجزئة Argon2id ويبطئ كل الجلسات الأخرى */
export async function POST(request: Request) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  try {
    const body = (await request.json()) as {
      currentPassword?: string;
      newPassword?: string;
    };

    const admin = await prisma.adminUser.findUnique({
      where: { id: guard.adminId },
      select: { id: true, passwordHash: true },
    });
    if (!admin) return NextResponse.json({ error: "غير موجود" }, { status: 404 });

    const ok = await verifyPassword(admin.passwordHash, body.currentPassword || "");
    if (!ok) {
      return NextResponse.json({ error: "كلمة المرور الحالية غير صحيحة" }, { status: 401 });
    }

    const strength = validatePasswordStrength(body.newPassword || "");
    if (!strength.ok) {
      return NextResponse.json({ error: strength.message }, { status: 400 });
    }

    const newHash = await hashPassword(body.newPassword as string);
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { passwordHash: newHash },
    });

    await writeAudit({
      adminId: admin.id,
      action: "security.password_changed",
      ip: getClientIp(request),
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}
