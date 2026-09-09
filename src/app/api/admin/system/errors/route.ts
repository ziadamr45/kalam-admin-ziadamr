import { NextResponse } from "next/server";
import { requireSession, isRejected } from "@/lib/guard";
import { recentErrors } from "@/lib/system";

/** سجل الأخطاء التشغيلية اللحظية — Stack Trace الكامل فور الوقوع */

export async function GET(request: Request) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  try {
    const url = new URL(request.url);
    const rows = await recentErrors(Math.min(Math.max(Number(url.searchParams.get("limit")) || 40, 1), 100));
    return NextResponse.json({ rows }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "تعذر جلب سجل الأخطاء" }, { status: 500 });
  }
}
