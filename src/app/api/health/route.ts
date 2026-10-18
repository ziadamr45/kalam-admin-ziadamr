import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureOwnerSovereign } from "@/lib/vip";

/**
 * نبض لوحة التحكم — يُستدعى بالمراقبة الدورية، وبكل نبضة يضمن
 * مجانًا أن حساب صاحب المنصة سيادي كامل (idempotent: لا كتابة
 * إن كان مكتملًا — طبقة ضمان ثالثة فوق الدخول وإقلاع الخادم).
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    /* بذر سيادي احتياطي — fire-and-forget لا يؤثر على زمن الاستجابة */
    void ensureOwnerSovereign().catch(() => {});
    return NextResponse.json({ ok: true, db: "up", time: new Date().toISOString() });
  } catch {
    return NextResponse.json({ ok: false, db: "down" }, { status: 503 });
  }
}
