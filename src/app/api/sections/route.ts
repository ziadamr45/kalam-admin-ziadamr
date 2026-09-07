import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, isRejected, writeAudit, getClientIp } from "@/lib/guard";
import { slugify } from "@/lib/slugify";
import { revalidatePublicPaths } from "@/lib/revalidate";

/** قائمة الأقسام مع عدادات المقالات */
export async function GET(request: Request) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  try {
    const sections = await prisma.section.findMany({
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { articles: true } } },
    });
    return NextResponse.json({ sections });
  } catch {
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}

/** إنشاء قسم جديد فورًا */
export async function POST(request: Request) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  try {
    const body = (await request.json()) as {
      name?: string;
      slug?: string;
      description?: string;
      color?: string;
      icon?: string;
      sortOrder?: number;
      active?: boolean;
    };

    const name = body.name?.trim();
    if (!name) {
      return NextResponse.json({ error: "اسم القسم إلزامي" }, { status: 400 });
    }

    let slug = slugify(body.slug?.trim() || name);
    if (!slug) slug = `section-${Date.now().toString(36)}`;

    /* تفرد الـ slug */
    const exists = await prisma.section.findUnique({ where: { slug } });
    const finalSlug = exists ? `${slug}-${Date.now().toString(36)}` : slug;

    const section = await prisma.section.create({
      data: {
        name,
        slug: finalSlug,
        description: body.description?.trim() || null,
        color: body.color?.trim() || null,
        icon: body.icon?.trim() || null,
        sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : 0,
        active: body.active ?? true,
      },
    });

    await writeAudit({
      adminId: guard.adminId,
      action: "section.created",
      entity: "Section",
      entityId: section.id,
      meta: { name: section.name, slug: section.slug },
      ip: getClientIp(request),
    });

    /* انعكاس فوري على المنصة العامة */
    revalidatePublicPaths(["/"]);

    return NextResponse.json({ section });
  } catch {
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}
