import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import {
  hashPassword,
  verifyPassword,
  constantTimeDummyVerify,
} from "@/lib/password";
import { signScopedToken, PREAUTH_COOKIE, SETUP_COOKIE } from "@/lib/jwt";
import { hashDeviceFingerprint } from "@/lib/crypto";
import { getClientIp, raiseAlert, writeAudit } from "@/lib/guard";
import { decideIpAccess } from "@/lib/iprules";

/**
 * المرحلة الأولى من الدخول — Zero-Trust:
 * 1. قواعد IP → 2. حد معدل المحاولات (Brute-force) →
 * 3. Argon2id → 4. تسجيل المحاولة والتنبيهات →
 * 5. إصدار رمز مؤقت محصور (preauth أو setup) — لا جلسة كاملة هنا
 */

const MAX_FAILS_15MIN = 5;
const MAX_FAILS_HOUR = 12;

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const userAgent = request.headers.get("user-agent") || "unknown";

  try {
    const body = (await request.json()) as {
      username?: string;
      password?: string;
      fingerprint?: string;
    };
    const username = body.username?.trim() || "";
    const password = body.password || "";
    const fingerprint = body.fingerprint || "";

    if (!username || !password) {
      return NextResponse.json({ error: "أدخل اسم المستخدم وكلمة المرور" }, { status: 400 });
    }

    /* 1) جدار IP */
    const ipDecision = await decideIpAccess(ip);
    if (!ipDecision.access) {
      await raiseAlert({
        type: "IP_BLOCKED",
        severity: "CRITICAL",
        message: `محاولة دخول من IP محظور: ${ip} (${ipDecision.reason})`,
        meta: { ip, username },
      });
      return NextResponse.json({ error: "وصول مرفوض" }, { status: 403 });
    }

    /* 2) حد معدل المحاولات الفاشلة (Brute-force Protection) */
    const since15 = new Date(Date.now() - 15 * 60_000);
    const since1h = new Date(Date.now() - 60 * 60_000);
    const [fails15, fails1h] = await Promise.all([
      prisma.loginAttempt.count({
        where: { success: false, createdAt: { gte: since15 }, OR: [{ username }, { ip }] },
      }),
      prisma.loginAttempt.count({
        where: { success: false, createdAt: { gte: since1h }, OR: [{ username }, { ip }] },
      }),
    ]);

    if (fails15 >= MAX_FAILS_15MIN || fails1h >= MAX_FAILS_HOUR) {
      await raiseAlert({
        type: "BRUTE_FORCE",
        severity: "CRITICAL",
        message: `حظر مؤقت: ${fails15} محاولة فاشلة خلال 15 دقيقة (${username} من ${ip})`,
        meta: { ip, username, fails15, fails1h },
      });
      await prisma.loginAttempt.create({
        data: { username, ip, success: false, reason: "RATE_LIMITED" },
      });
      return NextResponse.json(
        { error: "تم حظر المحاولات مؤقتًا لأسباب أمنية.. أعد المحاولة بعد 15 دقيقة" },
        { status: 429 },
      );
    }

    /* 3) التحقق من الاعتماديات (Argon2id) */
    const admin = await prisma.adminUser.findUnique({ where: { username } });
    let passwordOk = false;

    if (admin) {
      passwordOk = await verifyPassword(admin.passwordHash, password);
    } else {
      /* تأخير ثابت حتى لا يُستنتج وجود الحساب من زمن الاستجابة */
      await constantTimeDummyVerify();
    }

    if (!admin || !passwordOk) {
      await prisma.loginAttempt.create({
        data: { username, ip, success: false, reason: admin ? "WRONG_PASSWORD" : "UNKNOWN_USER" },
      });
      if (fails15 >= MAX_FAILS_15MIN - 2) {
        await raiseAlert({
          type: "LOGIN_FAILED",
          severity: "WARN",
          message: `محاولات فاشلة متكررة لـ ${username} من ${ip}`,
          meta: { ip, username },
        });
      }
      return NextResponse.json({ error: "بيانات الدخول غير صحيحة" }, { status: 401 });
    }

    /* 4) فحص الجهاز (Device Fingerprinting) */
    const deviceHash = fingerprint ? hashDeviceFingerprint(fingerprint) : null;
    let deviceTrusted = false;
    if (deviceHash) {
      const known = await prisma.trustedDevice.findUnique({
        where: { adminId_deviceHash: { adminId: admin.id, deviceHash } },
      });
      deviceTrusted = Boolean(known);
    }

    const blockUnknownDevices = (process.env.BLOCK_UNTRUSTED_DEVICES || "false") === "true";
    if (blockUnknownDevices && !deviceTrusted) {
      await raiseAlert({
        type: "UNKNOWN_DEVICE_BLOCKED",
        severity: "CRITICAL",
        message: `حُظر دخول من جهاز غير موثوق (${username} من ${ip})`,
        meta: { ip, deviceHash: deviceHash?.slice(0, 16) },
      });
      return NextResponse.json(
        { error: "هذا الجهاز غير موثوق.. اعتمده أولًا من صفحة الأمان على جهازك الموثوق" },
        { status: 403 },
      );
    }

    if (!deviceTrusted) {
      await raiseAlert({
        type: "NEW_DEVICE_LOGIN",
        severity: "WARN",
        message: `دخول من جهاز/شبكة جديدة: ${username} من ${ip}`,
        meta: {
          ip,
          userAgent: userAgent.slice(0, 200),
          deviceHash: deviceHash?.slice(0, 16) ?? null,
        },
      });
    }

    await prisma.loginAttempt.create({
      data: { username, ip, success: true, reason: "PASSWORD_OK" },
    });
    await writeAudit({
      adminId: admin.id,
      action: "login.password_ok",
      meta: { ip, deviceTrusted },
      ip,
    });

    /* 5) إصدار الرمز المؤقت المحصور */
    const store = await cookies();

    if (!admin.totpEnabled) {
      /* أول دخول: تفعيل 2FA إلزامي قبل أي صلاحية */
      const { token } = await signScopedToken(
        { sub: admin.id, username: admin.username },
        "setup",
        600,
      );
      store.set(SETUP_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 600,
      });
      return NextResponse.json({ next: "setup2fa" });
    }

    const { token } = await signScopedToken(
      { sub: admin.id, username: admin.username },
      "preauth",
      300,
    );
    store.set(PREAUTH_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 300,
    });

    /* التأخير الذكي: Argon2 يكفي — لا نكشف أي شيء أكثر */
    void hashPassword;
    return NextResponse.json({ next: "totp" });
  } catch {
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}
