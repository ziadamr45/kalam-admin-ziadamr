import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, isRejected, writeAudit, getClientIp } from "@/lib/guard";
import { slugify } from "@/lib/slugify";
import { revalidatePublicPaths } from "@/lib/revalidate";

/** تعديل قسم حالي وتحديث بياناته مباشرة */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  try {
    const { id } = await params;
    const body = (await request.json()) as {
      name?: string;
      slug?: string;
      description?: string | null;
      color?: string | null;
      icon?: string | null;
      sortOrder?: number;
      active?: boolean;
    };

    const existing = await prisma.section.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "القسم غير موجود" }, { status: 404 });
    }

    let slug = existing.slug;
    if (body.slug && slugify(body.slug) !== existing.slug) {
      slug = slugify(body.slug) || existing.slug;
      const clash = await prisma.section.findUnique({ where: { slug } });
      if (clash && clash.id !== id) {
        slug = `${slug}-${Date.now().toString(36)}`;
      }
    }

    const section = await prisma.section.update({
      where: { id },
      data: {
        ...(body.name?.trim() ? { name: body.name.trim() } : {}),
        slug,
        ...(body.description !== undefined
          ? { description: body.description?.trim() || null }
          : {}),
        ...(body.color !== undefined ? { color: body.color?.trim() || null } : {}),
        ...(body.icon !== undefined ? { icon: body.icon?.trim() || null } : {}),
        ...(typeof body.sortOrder === "number" ? { sortOrder: body.sortOrder } : {}),
        ...(typeof body.active === "boolean" ? { active: body.active } : {}),
      },
    });

    await writeAudit({
      adminId: guard.adminId,
      action: "section.updated",
      entity: "Section",
      entityId: id,
      meta: { name: section.name, slug: section.slug, active: section.active },
      ip: getClientIp(request),
    });

    /* انعكاس فوري: الرئيسية + صفحة القسم + صفحات مقالاته */
    const paths = ["/", `/section/${section.slug}`];
    const arts = await prisma.article.findMany({
      where: { sectionId: id },
      select: { slug: true },
      take: 100,
    });
    for (const a of arts) paths.push(`/article/${a.slug}`);
    revalidatePublicPaths(paths);

    return NextResponse.json({ section });
  } catch {
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}

/**
 * حذف قسم — مع حماية كاملة من كسر الروابط:
 * خيار نقل المقالات التابعة لقسم آخر، أو تركها غير مصنفة.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  try {
    const { id } = await params;
    const url = new URL(request.url);
    /* moveTo = قسم بديل | none = ترك المقالات غير مصنفة */
    const moveTo = url.searchParams.get("moveTo") ?? "none";

    const existing = await prisma.section.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "القسم غير موجود" }, { status: 404 });
    }

    const movedCount = await prisma.article.count({ where: { sectionId: id } });

    if (movedCount > 0) {
      if (moveTo === "none") {
        /* فك الارتباط فقط — المقالات تبقى حية غير مصنفة */
        await prisma.article.updateMany({ where: { sectionId: id }, data: { sectionId: null } });
      } else {
        const target = await prisma.section.findUnique({ where: { id: moveTo } });
        if (!target) {
          return NextResponse.json({ error: "القسم البديل غير موجود" }, { status: 400 });
        }
        await prisma.article.updateMany({ where: { sectionId: id }, data: { sectionId: moveTo } });
      }
    }

    await prisma.section.delete({ where: { id } });

    await writeAudit({
      adminId: guard.adminId,
      action: "section.deleted",
      entity: "Section",
      entityId: id,
      meta: { name: existing.name, movedCount, moveTo },
      ip: getClientIp(request),
    });

    revalidatePublicPaths(["/", `/section/${existing.slug}`]);

    return NextResponse.json({ ok: true, movedCount });
  } catch {
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}
