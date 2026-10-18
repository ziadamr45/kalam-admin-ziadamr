import { NextResponse } from "next/server";
import { destroySession } from "@/lib/session";
import { getClientIp, writeAudit } from "@/lib/guard";

export async function POST(request: Request) {
  const ip = getClientIp(request);
  await writeAudit({ action: "logout", ip });
  await destroySession();
  return NextResponse.json({ ok: true });
}
