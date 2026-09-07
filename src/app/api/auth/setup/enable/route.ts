import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyScopedToken, SETUP_COOKIE } from "@/lib/jwt";
import { decryptSecret, hashDeviceFingerprint } from "@/lib/crypto";
import { verifyTotpToken } from "@/lib/totp";
import { createSession } from "@/lib/session";
import { getClientIp, getUserAgent, writeAudit } from "@/lib/guard";

/** تفعيل 2FA نهائيًا بعد التحقق من أول رمز — ثم فتح الجلسة الكاملة */
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const userAgent = getUserAgent(request);

  try {
    const body = (await request.json()) as { code?: string; fingerprint?: string };
    const store = await cookies();
    const setupToken = store.get(SETUP_COOKIE)?.value;
    if (!setupToken) {
      return NextResponse.json({ error: "انتهت المهلة" }, { status: 401 });
    }
    const payload = await verifyScopedToken(setupToken, "setup");
    if (!payload) {
      store.delete(SETUP_COOKIE);
      return NextResponse.json({ error: "انتهت المهلة" }, { status: 401 });
    }

    const admin = await prisma.adminUser.findUnique({
      where: { id: payload.sub },
      select: { id: true, username: true, totpSecretEnc: true, totpEnabled: true },
    });
    if (!admin || admin.totpEnabled || !admin.totpSecretEnc) {
      return NextResponse.json({ error: "حالة غير سليمة" }, { status: 400 });
    }

    const secret = decryptSecret(admin.totpSecretEnc);
    if (!verifyTotpToken(secret, body.code?.trim() || "")) {
      return NextResponse.json({ error: "الرمز غير صحيح.. تأكد من تطبيق التوثيق" }, { status: 401 });
    }

    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { totpEnabled: true },
    });

    store.delete(SETUP_COOKIE);

    /* الجهاز الحالي يوثَّق تلقائيًا (أول تفعيل) */
    const fingerprint = body.fingerprint || "";
    const deviceHash = fingerprint ? hashDeviceFingerprint(fingerprint) : null;
    if (deviceHash) {
      await prisma.trustedDevice.upsert({
        where: { adminId_deviceHash: { adminId: admin.id, deviceHash } },
        update: { lastIp: ip, lastSeenAt: new Date() },
        create: {
          adminId: admin.id,
          deviceHash,
          label: "الجهاز الأول — تفعيل 2FA",
          lastIp: ip,
        },
      });
    }

    await createSession({
      adminId: admin.id,
      username: admin.username,
      ip,
      userAgent,
      deviceHash,
      trusted: Boolean(deviceHash),
    });

    await writeAudit({
      adminId: admin.id,
      action: "security.2fa_enabled",
      meta: { ip },
      ip,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}
