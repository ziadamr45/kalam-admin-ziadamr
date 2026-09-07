import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * إلغاء اشتراك إشعارات الأدمن — حذف الصف المطابق للـ endpoint.
 * متاح دون جلسة لأن المتصفح قد يلغي الاشتراك بعد انتهاء الجلسة،
 * ولا يشكّل خطرًا: حذف اشتراك لا يكشف أي بيانات.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { endpoint?: string } | null;
    const endpoint = body?.endpoint;
    if (!endpoint) {
      return NextResponse.json({ error: "endpoint مطلوب" }, { status: 400 });
    }

    await prisma.adminPushSubscription
      .delete({ where: { endpoint } })
      .catch(() => null);
    await prisma.userPushSubscription
      .delete({ where: { endpoint } })
      .catch(() => null);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "تعذر إلغاء الاشتراك" }, { status: 500 });
  }
}
