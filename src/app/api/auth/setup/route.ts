import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyScopedToken, SETUP_COOKIE } from "@/lib/jwt";
import { encryptSecret } from "@/lib/crypto";
import { generateTotpSecret, buildOtpauthUrl } from "@/lib/totp";
import QRCode from "qrcode";

/** توليد سر TOTP جديد وإرجاع QR — يتطلب كوكي setup من أول دخول */
export async function GET(request: Request) {
  try {
    const store = await cookies();
    const setupToken = store.get(SETUP_COOKIE)?.value;
    if (!setupToken) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }
    const payload = await verifyScopedToken(setupToken, "setup");
    if (!payload) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const admin = await prisma.adminUser.findUnique({
      where: { id: payload.sub },
      select: { id: true, username: true, totpEnabled: true },
    });
    if (!admin) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    if (admin.totpEnabled) {
      return NextResponse.json({ error: "التحقق بخطوتين مفعّل مسبقًا" }, { status: 400 });
    }

    const secret = generateTotpSecret();
    const otpauthUrl = buildOtpauthUrl(secret, admin.username);
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl, {
      width: 400,
      margin: 1,
      color: { dark: "#0d1626", light: "#ffffff" },
    });

    /* تخزين السر مشفرًا AES-256-GCM — لن يُفعَّل إلا بعد التحقق من أول رمز */
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { totpSecretEnc: encryptSecret(secret) },
    });

    return NextResponse.json({ secret, otpauthUrl, qrDataUrl });
  } catch {
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}
