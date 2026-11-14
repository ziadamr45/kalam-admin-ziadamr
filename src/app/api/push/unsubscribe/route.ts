import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * إلغاء اشتراك إشعارات الأدمن — حذف الصف المطابق للـ endpoint.
 * محمي بجلسة الأدمن على مستوى الوسيط (ليس من PUBLIC_PATHS — يرد 401
 * لأي طلب بلا جلسة صالحة). حذف اشتراك لا يكشف أي بيانات، والمتصفح
 * يستدعيه مع نهاية الجلسة أو إلغاء الإذن من إعدادات المتصفح.
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
