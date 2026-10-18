import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, isRejected } from "@/lib/guard";

/** قائمة تعليقات لوحة الإشراف بفلترة الحالة */
export async function GET(request: Request) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status") || "PENDING";
    const flagged = url.searchParams.get("flagged") === "1";

    const comments = await prisma.comment.findMany({
      where: {
        ...(status !== "ALL" && ["PENDING", "APPROVED", "REJECTED"].includes(status)
          ? { status: status as "PENDING" | "APPROVED" | "REJECTED" }
          : {}),
        ...(flagged ? { flagged: true } : {}),
      },
      orderBy: [{ isInspiring: "desc" }, { createdAt: "desc" }],
      take: 150,
      include: {
        user: {
          select: {
            name: true,
            email: true,
            image: true,
            banned: true,
            customName: true,
            customImage: true,
            impactScore: true,
            intellectualRank: true,
          },
        },
        article: { select: { title: true, slug: true } },
      },
    });

    return NextResponse.json({ comments });
  } catch {
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}
