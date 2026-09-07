import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { requireSession, isRejected, writeAudit, getClientIp } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { destroyAudio } from "@/lib/cloudinary";

/** إزالة الصوت من المقال بالكامل — مع تنظيف الأصل السحابي */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;
  const { id } = await params;

  try {
    const article = await prisma.article.findUnique({
      where: { id },
      select: { slug: true, audioPublicId: true },
    });
    if (!article) {
      return NextResponse.json({ error: "المقال غير موجود" }, { status: 404 });
    }

    await prisma.article.update({
      where: { id },
      data: {
        audioUrl: null,
        audioPublicId: null,
        audioDurationSec: null,
        audioWords: Prisma.DbNull,
        audioVoice: null,
        audioGeneratedAt: null,
      },
    });

    if (article.audioPublicId) {
      await destroyAudio(article.audioPublicId);
    }

    revalidatePath(`/article/${article.slug}`);

    await writeAudit({
      adminId: guard.adminId,
      action: "article.audio_removed",
      entity: "Article",
      entityId: id,
      meta: { slug: article.slug },
      ip: getClientIp(request),
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "تعذر إزالة الصوت — أعد المحاولة" }, { status: 500 });
  }
}
