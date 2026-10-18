import { NextResponse } from "next/server";
import { requireSession, isRejected } from "@/lib/guard";
import { dbHealth, trafficSnapshot, externalQuotas, recentErrors } from "@/lib/system";
import { recordServerError } from "@/lib/error-alert";

/**
 * نبض النظام الحي — صحة Neon، الحركة اللحظية، الحصص الخارجية، والأخطاء.
 * يستدعيها مرصد النظام /system باستقصاء دوري كل 15 ثانية.
 */

export async function GET(request: Request) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  try {
    const [db, traffic, quotas, errors] = await Promise.all([
      dbHealth(),
      trafficSnapshot(60),
      externalQuotas(),
      recentErrors(6),
    ]);
    return NextResponse.json(
      { db, traffic, quotas, errors, checkedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    await recordServerError({ err, app: "ADMIN", path: "/api/admin/system/telemetry", method: request.method, requestId: request.headers.get("x-kalam-rid"), url: "/system?tab=errors" });
    return NextResponse.json({ error: "تعذر قياس نبض النظام" }, { status: 500 });
  }
}
