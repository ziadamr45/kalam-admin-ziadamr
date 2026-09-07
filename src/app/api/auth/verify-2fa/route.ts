import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyScopedToken, PREAUTH_COOKIE } from "@/lib/jwt";
import { decryptSecret, hashDeviceFingerprint } from "@/lib/crypto";
import { verifyTotpToken } from "@/lib/totp";
import { createSession } from "@/lib/session";
import { getClientIp, getUserAgent, raiseAlert, writeAudit } from "@/lib/guard";

/**
 * المرحلة الثانية: التحقق من الرمز السري المتغير (TOTP)
 * لا يصدر JWT الجلسة إلا بعد نجاح هذه المرحلة
 */

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const userAgent = getUserAgent(request);

  try {
    const body = (await request.json()) as {
      code?: string;
      fingerprint?: string;
      trustDevice?: boolean;
    };

    const store = await cookies();
    const preauthToken = store.get(PREAUTH_COOKIE)?.value;
    if (!preauthToken) {
      return NextResponse.json({ error: "انتهت المهلة.. ابدأ من جديد" }, { status: 401 });
    }

    const payload = await verifyScopedToken(preauthToken, "preauth");
    if (!payload) {
      store.delete(PREAUTH_COOKIE);
      return NextResponse.json({ error: "انتهت المهلة.. ابدأ من جديد" }, { status: 401 });
    }

    const admin = await prisma.adminUser.findUnique({
      where: { id: payload.sub },
      select: { id: true, username: true, totpSecretEnc: true, totpEnabled: true },
    });

    if (!admin || !admin.totpEnabled || !admin.totpSecretEnc) {
      store.delete(PREAUTH_COOKIE);
      return NextResponse.json({ error: "حالة المصادقة غير سليمة" }, { status: 400 });
    }

    const secret = decryptSecret(admin.totpSecretEnc);
    const code = body.code?.trim() || "";

    if (!verifyTotpToken(secret, code)) {
      await prisma.loginAttempt.create({
        data: { username: admin.username, ip, success: false, reason: "WRONG_TOTP" },
      });
      await raiseAlert({
        type: "TOTP_FAILED",
        severity: "WARN",
        message: `رمز تحقق خاطئ لـ ${admin.username} من ${ip}`,
        meta: { ip },
      });
      return NextResponse.json({ error: "الرمز غير صحيح" }, { status: 401 });
    }

    /* نجاح التحقق الكامل — إنشاء الجلسة */
    store.delete(PREAUTH_COOKIE);

    const fingerprint = body.fingerprint || "";
    const deviceHash = fingerprint ? hashDeviceFingerprint(fingerprint) : null;
    const trustDevice = Boolean(body.trustDevice) && Boolean(deviceHash);

    if (trustDevice && deviceHash) {
      await prisma.trustedDevice.upsert({
        where: { adminId_deviceHash: { adminId: admin.id, deviceHash } },
        update: { lastIp: ip, lastSeenAt: new Date() },
        create: {
          adminId: admin.id,
          deviceHash,
          label: `جهاز موثوق (${ip})`,
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
      trusted: trustDevice,
    });

    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    await writeAudit({
      adminId: admin.id,
      action: "login.success",
      meta: { ip, trustedDevice: trustDevice },
      ip,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}
