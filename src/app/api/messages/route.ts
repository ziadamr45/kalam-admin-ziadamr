import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, isRejected } from "@/lib/guard";

/** قائمة رسائل التواصل */
export async function GET(request: Request) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  try {
    const url = new URL(request.url);
    const filter = url.searchParams.get("filter") ?? "all";

    const messages = await prisma.contactMessage.findMany({
      where:
        filter === "unread"
          ? { read: false, archived: false }
          : filter === "archived"
            ? { archived: true }
            : { archived: false },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const unread = await prisma.contactMessage.count({ where: { read: false, archived: false } });

    return NextResponse.json({ messages, unread });
  } catch {
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}
