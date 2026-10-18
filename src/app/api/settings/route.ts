import { NextResponse } from "next/server";
import { requireSession, isRejected, writeAudit, getClientIp } from "@/lib/guard";
import { getSystemSettings, saveSystemSettings, getChecklist, saveChecklist } from "@/lib/settings";

/** إعدادات النظام + قائمة الفحص الأخلاقي */
export async function GET(request: Request) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  const [settings, checklist] = await Promise.all([getSystemSettings(), getChecklist()]);
  return NextResponse.json({ settings, checklist });
}

export async function PUT(request: Request) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  try {
    const body = (await request.json()) as {
      settings?: { AUTO_APPROVE_COMMENTS?: boolean; REQUIRE_CHECKLIST?: boolean };
      checklist?: { id: string; text: string }[];
    };

    if (body.settings) await saveSystemSettings(body.settings);
    if (body.checklist) await saveChecklist(body.checklist);

    await writeAudit({
      adminId: guard.adminId,
      action: "settings.updated",
      ip: getClientIp(request),
    });

    const [settings, checklist] = await Promise.all([getSystemSettings(), getChecklist()]);
    return NextResponse.json({ settings, checklist });
  } catch {
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}
