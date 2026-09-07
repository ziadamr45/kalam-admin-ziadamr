import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, isRejected, writeAudit, getClientIp } from "@/lib/guard";

/** قواعد IP — قائمة/إضافة/حذف */
export async function GET(request: Request) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  const rules = await prisma.ipRule.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ rules });
}

export async function POST(request: Request) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  try {
    const body = (await request.json()) as { ip?: string; mode?: string; note?: string };
    const ip = body.ip?.trim();
    if (!ip || !/^[0-9a-fA-F.:]{3,45}$/.test(ip)) {
      return NextResponse.json({ error: "عنوان IP غير صالح" }, { status: 400 });
    }
    const mode = body.mode === "ALLOW" ? "ALLOW" : "DENY";

    const rule = await prisma.ipRule.upsert({
      where: { ip },
      update: { mode, note: body.note || null },
      create: { ip, mode, note: body.note || null },
    });

    await writeAudit({
      adminId: guard.adminId,
      action: `security.ip_${mode.toLowerCase()}`,
      entity: "IpRule",
      entityId: rule.id,
      meta: { ip },
      ip: getClientIp(request),
    });

    return NextResponse.json({ rule });
  } catch {
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });

  await prisma.ipRule.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
