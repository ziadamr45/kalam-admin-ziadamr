import { NextResponse } from "next/server";
import { isRejected, requireSession } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

/**
 * البحث عن مستخدم لإرسال إشعار مخصص — بالاسم أو البريد الإلكتروني.
 * يعيد نتائج مختصرة (id, name, email, image) فقط — بلا أي بيانات حساسة.
 */
export async function GET(request: Request) {
  const ctx = await requireSession(request);
  if (isRejected(ctx)) return ctx;

  try {
    const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
    if (q.length < 2) {
      return NextResponse.json({ items: [] });
    }

    const items = await prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, email: true, image: true, banned: true },
      orderBy: { createdAt: "desc" },
      take: 8,
    });

    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ error: "فشل البحث" }, { status: 500 });
  }
}
