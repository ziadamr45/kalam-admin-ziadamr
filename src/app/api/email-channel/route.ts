import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, isRejected, writeAudit, getClientIp } from "@/lib/guard";
import {
  resolveEmailConfig,
  sendRawEmail,
  OWNER_EMAIL,
  PLATFORM_EMAIL,
  notificationEmailHtml,
} from "@/lib/notifications/dispatcher";

/**
 * قناة البريد المعاملاتي (Gmail SMTP عبر Nodemailer) — لوحة سيادة بلا طرفية:
 *  GET  — حالة القناة (البريد المرسل، مصدر كلمة مرور التطبيق، مقنعًا)
 *  POST — حفظ بريد Gmail وكلمة مرور التطبيق (App Password) في SystemSetting المشترك
 *         (ينعكس فورًا على المنصة العامة واللوحة معًا — بلا متغيرات بيئة ولا إعادة نشر)
 *  PUT  — إرسال بريد تجريبي حي لصاحب المنصة للتحقق من العمل الفعلي
 */

function maskSecret(val: string): string {
  if (val.length <= 6) return "••••••••";
  return `${val.slice(0, 2)}${"•".repeat(10)}${val.slice(-2)}`;
}

export async function GET(request: Request) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  const { user, pass, from } = await resolveEmailConfig();
  const envPass = Boolean(process.env.SMTP_PASS?.trim());
  const dbPass = !envPass && Boolean(pass);

  return NextResponse.json({
    active: Boolean(user && pass),
    source: envPass ? "env" : dbPass ? "db" : "none",
    user: user ?? PLATFORM_EMAIL,
    maskedPass: pass ? maskSecret(pass) : null,
    from,
  });
}

export async function POST(request: Request) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      user?: string;
      appPassword?: string;
      from?: string;
      clear?: boolean;
    };

    if (body.clear) {
      await prisma.systemSetting.deleteMany({
        where: { key: { in: ["SMTP_USER", "SMTP_PASS", "RESEND_API_KEY"] } },
      });
      await writeAudit({ adminId: guard.adminId, action: "email-channel.cleared", ip: getClientIp(request) });
      return NextResponse.json({ ok: true, cleared: true });
    }

    const smtpUser = body.user?.trim() ?? "";
    const appPass = body.appPassword?.trim().replace(/\s+/g, "") ?? "";
    const from = body.from?.trim() ?? "";

    if (!smtpUser && !appPass && !from) {
      return NextResponse.json(
        { error: "أدخل كلمة مرور تطبيق Gmail (16 حرفًا) أو بريد المرسل" },
        { status: 400 },
      );
    }
    if (smtpUser && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(smtpUser)) {
      return NextResponse.json({ error: "صيغة البريد الإلكتروني غير صالحة" }, { status: 400 });
    }
    if (appPass && appPass.length < 12) {
      return NextResponse.json(
        { error: "كلمة مرور التطبيق (App Password) من Google تكون 16 حرفًا — تأكد من نسخها كاملة" },
        { status: 400 },
      );
    }

    if (smtpUser) {
      await prisma.systemSetting.upsert({
        where: { key: "SMTP_USER" },
        update: { value: smtpUser as never },
        create: { key: "SMTP_USER", value: smtpUser as never },
      });
    }
    if (appPass) {
      await prisma.systemSetting.upsert({
        where: { key: "SMTP_PASS" },
        update: { value: appPass as never },
        create: { key: "SMTP_PASS", value: appPass as never },
      });
    }
    if (from) {
      const normalized = /<.+>/.test(from) ? from : `كلام له لازمة <${from}>`;
      await prisma.systemSetting.upsert({
        where: { key: "SECURITY_EMAIL_FROM" },
        update: { value: normalized as never },
        create: { key: "SECURITY_EMAIL_FROM", value: normalized as never },
      });
    }

    await writeAudit({
      adminId: guard.adminId,
      action: "email-channel.saved",
      entity: "SystemSetting",
      entityId: "SMTP_PASS",
      ip: getClientIp(request),
    });

    const config = await resolveEmailConfig();
    return NextResponse.json({
      ok: true,
      active: Boolean(config.user && config.pass),
      source: process.env.SMTP_PASS?.trim() ? "env" : "db",
      user: config.user ?? PLATFORM_EMAIL,
      maskedPass: config.pass ? maskSecret(config.pass) : null,
      from: config.from,
    });
  } catch {
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  try {
    const { user, pass } = await resolveEmailConfig();
    if (!user || !pass) {
      return NextResponse.json(
        { ok: false, error: "أضف كلمة مرور تطبيق Gmail (App Password) أولًا ثم جرّب الإرسال" },
        { status: 400 },
      );
    }

    const owner = await prisma.user.findUnique({
      where: { email: OWNER_EMAIL },
      select: { email: true },
    });
    const toEmail = owner?.email ?? OWNER_EMAIL;

    const title = "رسالة تجريبية — قناة البريد (Gmail SMTP) مفعّلة";
    const message =
      "هذه رسالة تجريبية من لوحة الأدمن للتأكد أن قناة البريد عبر Gmail SMTP تعمل بنجاح.\nمن الآن: تنبيهات الأمان عند دخول جهاز جديد، وبلوغ رتبة أهل الكلمة، وأحداث السيادة — كلها تصلك إلى بريدك لحظة وقوعها.";

    const sent = await sendRawEmail({
      to: toEmail,
      subject: title,
      html: notificationEmailHtml(title, message, "/profile"),
    });

    await writeAudit({
      adminId: guard.adminId,
      action: "email-channel.test",
      ip: getClientIp(request),
    });

    if (!sent.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: `تعذر الإرسال عبر Gmail SMTP: ${sent.error ?? "تحقق من البريد وكلمة مرور التطبيق"}`,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, to: toEmail });
  } catch {
    return NextResponse.json({ ok: false, error: "خطأ داخلي" }, { status: 500 });
  }
}
