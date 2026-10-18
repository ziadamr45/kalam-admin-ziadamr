import { NextResponse } from "next/server";
import { isRejected, requireSession, getUserAgent } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

/**
 * حفظ اشتراك الأدمن في إشعارات المنصة الفورية (Web Push + VAPID).
 * Upsert على endpoint — يدعم التجديد التلقائي عند انتهاء الصلاحية،
 * وفتح اللوحة من جهاز جديد تابع للأدمن (كل جهاز صف مستقل).
 */
export async function POST(request: Request) {
  const ctx = await requireSession(request);
  if (isRejected(ctx)) return ctx;

  try {
    const body = (await request.json().catch(() => null)) as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
      deviceLabel?: string;
    } | null;

    const endpoint = body?.endpoint;
    const p256dh = body?.keys?.p256dh;
    const authKey = body?.keys?.auth;
    if (!endpoint || !p256dh || !authKey) {
      return NextResponse.json({ error: "بيانات اشتراك غير مكتملة" }, { status: 400 });
    }

    const userAgent = getUserAgent(request).slice(0, 400);
    const deviceLabel = body.deviceLabel?.slice(0, 120) ?? null;

    await prisma.adminPushSubscription.upsert({
      where: { endpoint },
      update: { p256dh, auth: authKey, userAgent, deviceLabel, lastSeenAt: new Date() },
      create: { endpoint, p256dh, auth: authKey, userAgent, deviceLabel },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "تعذر حفظ الاشتراك" }, { status: 500 });
  }
}
