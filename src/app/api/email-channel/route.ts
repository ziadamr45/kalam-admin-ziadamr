import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, isRejected, writeAudit, getClientIp } from "@/lib/guard";
import { resolveEmailConfig, OWNER_EMAIL, notificationEmailHtml } from "@/lib/notifications/dispatcher";

/**
 * قناة البريد المعاملاتي (Resend) — لوحة سيادة بلا طرفية:
 *  GET  — حالة القناة (مصدر المفتاح البيئة أو قاعدة البيانات، مقنعًا) + عنوان المرسل
 *  POST — حفظ المفتاح وعنوان المرسل في SystemSetting المشترك (ينعكس فورًا
 *         على المنصة العامة واللوحة معًا — بلا متغيرات بيئة ولا إعادة نشر)
 *  PUT  — إرسال بريد تجريبي حي لصاحب المنصة للتحقق من العمل الفعلي
 */

function maskKey(key: string): string {
  if (key.length <= 10) return "••••••••";
  return `${key.slice(0, 5)}${"•".repeat(8)}${key.slice(-3)}`;
}

export async function GET(request: Request) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  const { key, from } = await resolveEmailConfig();
  const envKey = Boolean(process.env.RESEND_API_KEY?.trim());
  const dbKey = !envKey && Boolean(key);

  return NextResponse.json({
    active: Boolean(key),
    source: envKey ? "env" : dbKey ? "db" : "none",
    maskedKey: key ? maskKey(key) : null,
    from,
    fromIsCustom: from !== "كلام له لازمة <onboarding@resend.dev>",
  });
}

export async function POST(request: Request) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      apiKey?: string;
      from?: string;
      clear?: boolean;
    };

    if (body.clear) {
      /* مسح المفتاح المخزن قاعدة البيانات (لا يمس متغير البيئة) */
      await prisma.systemSetting.deleteMany({ where: { key: "RESEND_API_KEY" } });
      await writeAudit({ adminId: guard.adminId, action: "email-channel.cleared", ip: getClientIp(request) });
      return NextResponse.json({ ok: true, cleared: true });
    }

    const apiKey = body.apiKey?.trim() ?? "";
    const from = body.from?.trim() ?? "";

    if (!apiKey && !from) {
      return NextResponse.json({ error: "أدخل مفتاح Resend (يبدأ بـ re_) أو عنوان المرسل" }, { status: 400 });
    }
    if (apiKey && !apiKey.startsWith("re_")) {
      return NextResponse.json({ error: "مفتاح Resend يبدأ دائمًا بـ re_ — تأكد من نسخه كاملًا" }, { status: 400 });
    }
    if (from && !/^[^<>@]+@[^<>]+\.[^<>]+ <.+>$/.test(from) && !/^[^<>@]+@[^<>]+\.[^<>]+$/.test(from)) {
      return NextResponse.json(
        { error: "صيغة المرسل: بريد صحيح أو «اسم <بريد@نطاق>» — تأكد من صحتها" },
        { status: 400 },
      );
    }

    if (apiKey) {
      await prisma.systemSetting.upsert({
        where: { key: "RESEND_API_KEY" },
        update: { value: apiKey as never },
        create: { key: "RESEND_API_KEY", value: apiKey as never },
      });
    }
    if (from) {
      /* تطبيع الصيغة: بريد مجرد يُغلف باسم المنصة */
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
      entityId: "RESEND_API_KEY",
      ip: getClientIp(request),
    });

    const config = await resolveEmailConfig();
    return NextResponse.json({
      ok: true,
      active: Boolean(config.key),
      source: process.env.RESEND_API_KEY?.trim() ? "env" : "db",
      maskedKey: config.key ? maskKey(config.key) : null,
      from: config.from,
      fromIsCustom: config.from !== "كلام له لازمة <onboarding@resend.dev>",
    });
  } catch {
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  try {
    const { key, from } = await resolveEmailConfig();
    if (!key) {
      return NextResponse.json({ ok: false, error: "لا يوجد مفتاح محفوظ بعد — ألصقه أولًا ثم جرّب" }, { status: 400 });
    }

    const owner = await prisma.user.findUnique({
      where: { email: OWNER_EMAIL },
      select: { email: true },
    });
    if (!owner?.email) {
      return NextResponse.json({ ok: false, error: "حساب صاحب المنصة غير موجود لاستلام البريد التجريبي" }, { status: 404 });
    }

    const title = "رسالة تجريبية — قناة البريد مفعّلة";
    const message =
      "هذه رسالة تجريبية من لوحة الأدمن للتأكد أن قناة البريد المعاملاتي تعمل بصدق.\nمن الآن: تنبيهات الأمان عند الدخول من جهاز جديد، وبلوغ رتبة أهل الكلمة، وأحداث السيادة — كلها تصلك إلى بريدك لحظة وقوعها.";

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [owner.email],
        subject: title,
        html: notificationEmailHtml(title, message, "/profile"),
      }),
    });

    await writeAudit({
      adminId: guard.adminId,
      action: "email-channel.test",
      ip: getClientIp(request),
    });

    if (!res.ok) {
      const errText = (await res.text().catch(() => "")).slice(0, 300);
      /* أخطاء Resend الشائعة — رسالة عربية مفهومة بدل الرموز الخام */
      let hint = `رفض Resend الإرسال (HTTP ${res.status}).`;
      if (errText.includes("You can only send testing emails to your own email address")) {
        hint = "مفتاح الاختبار يرسل إلى بريد حساب Resend حصرًا حتى توثّق نطاقك من لوحة Resend — أضف سجلات DNS للنطاق ثم استخدم عنوان مرسل على ذلك النطاق.";
      } else if (res.status === 401 || res.status === 403) {
        hint = "المفتاح مرفوض (401/403) — انسخ مفتاحًا صحيحًا وفعّلًا من لوحة Resend.";
      }
      return NextResponse.json({ ok: false, error: hint, detail: errText }, { status: 502 });
    }

    return NextResponse.json({ ok: true, to: owner.email });
  } catch {
    return NextResponse.json({ ok: false, error: "خطأ داخلي" }, { status: 500 });
  }
}
