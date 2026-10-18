import { NextResponse } from "next/server";
import { requireSession, isRejected } from "@/lib/guard";
import { listRequestLogs } from "@/lib/system";
import { recordServerError } from "@/lib/error-alert";

/**
 * مستكشف حركة الخادم الحي — كل استدعاءات Route Handlers و Server Actions
 * بـ IP والمسار ونوع الجهاز وربط القارئ، مع تصفية بالثواني أو معرف المستخدم.
 */

export async function GET(request: Request) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  try {
    const url = new URL(request.url);
    const rows = await listRequestLogs({
      seconds: Math.min(Math.max(Number(url.searchParams.get("seconds")) || 600, 60), 86400),
      userId: url.searchParams.get("userId") || undefined,
      errorOnly: url.searchParams.get("errorOnly") === "1",
      path: url.searchParams.get("path") || undefined,
      limit: Math.min(Math.max(Number(url.searchParams.get("limit")) || 80, 10), 200),
    });
    return NextResponse.json({ rows }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    await recordServerError({ err, app: "ADMIN", path: "/api/admin/system/traffic", method: request.method, requestId: request.headers.get("x-kalam-rid"), url: "/system?tab=errors" });
    return NextResponse.json({ error: "تعذر جلب سجل الحركة" }, { status: 500 });
  }
}
