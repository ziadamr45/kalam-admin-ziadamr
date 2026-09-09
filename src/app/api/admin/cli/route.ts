import { NextResponse } from "next/server";
import { requireSession, isRejected, writeAudit, getClientIp } from "@/lib/guard";
import { runCliCommand } from "@/lib/cli";

/**
 * نقطة تنفيذ التيرمينال السيادي — يستدعيها محرك الواجهة الأمامية.
 * نفس المحرك يخدم أداة admin_cli في MCP، وكل فعل مُغيِّر يُوثَّق.
 */

export async function POST(request: Request) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  try {
    const body = (await request.json()) as { command?: string };
    const command = String(body.command ?? "").slice(0, 500);
    if (!command.trim()) {
      return NextResponse.json({ error: "أمر فارغ" }, { status: 400 });
    }

    const lines = await runCliCommand(command, {
      adminUsername: guard.username,
      adminId: guard.adminId,
      ip: getClientIp(request),
      source: "web",
    });

    /* توثيق كل جلسة أمر غير قرائية فقط (help و clear لا يزدحمان بالسجل) */
    const first = command.trim().split(/\s+/)[0]?.toLowerCase();
    if (!["help", "clear", "?", "config", "sys", "db", "traffic", "errors", "user"].includes(first) === false) {
      /* الأوامر القرائية أعلاه تُوثق خفيفًا */
      await writeAudit({
        adminId: guard.adminId,
        action: "cli.exec",
        entity: "Terminal",
        meta: { command: command.slice(0, 200), source: "web" },
        ip: getClientIp(request),
      }).catch(() => {});
    }

    return NextResponse.json({ lines });
  } catch {
    return NextResponse.json(
      { lines: [{ type: "error", text: "تعذر تنفيذ الأمر — خطأ داخلي في المحرك" }] },
      { status: 500 },
    );
  }
}
