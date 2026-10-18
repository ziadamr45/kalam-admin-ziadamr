import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deviceFromUserAgent } from "@/lib/traffic";

/**
 * نقطة استقبال سجل الحركة الداخلي — يستدعيها middleware (عبر after)
 * بكلا التطبيقين: المنصة العامة (app=PUBLIC) ولوحة الأدمن (app=ADMIN).
 * محمية بمفتاح سري مشترك؛ الذاكرة والكتابة تحدث في Node وليس على الحافة.
 */

export const runtime = "nodejs";

type Entry = {
  requestId: string;
  app?: string;
  method: string;
  path: string;
  status?: number | null;
  durationMs?: number | null;
  ip?: string | null;
  userAgent?: string | null;
  country?: string | null;
};

export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  const provided = request.headers.get("x-traffic-secret");
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  try {
    const entry = (await request.json()) as Entry;
    if (!entry?.requestId || !entry?.path) {
      return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });
    }

    const device = deviceFromUserAgent(entry.userAgent ?? "");

    await prisma.requestLog.upsert({
      where: { requestId: entry.requestId },
      update: {
        status: entry.status ?? undefined,
        durationMs: entry.durationMs ?? undefined,
      },
      create: {
        requestId: entry.requestId,
        app: entry.app === "ADMIN" ? "ADMIN" : "PUBLIC",
        method: entry.method.slice(0, 8),
        path: entry.path.slice(0, 300),
        status: entry.status ?? null,
        durationMs: entry.durationMs ?? null,
        ip: entry.ip ?? null,
        device,
        userAgent: entry.userAgent ?? null,
        country: entry.country ?? null,
        /* الروبوتات المزحفقة تُعلَّم ولا تُهمل — المرصدة رقابيًا */
        isError: false,
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
