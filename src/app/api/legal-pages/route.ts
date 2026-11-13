import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, isRejected, writeAudit, getClientIp } from "@/lib/guard";
import { revalidatePublicPaths } from "@/lib/revalidate";
import { LEGAL_DEFAULTS, LEGAL_TITLES, LEGAL_DEFAULTS_UPDATED_AT } from "@/lib/legal-defaults";

const ALLOWED_SLUGS = ["privacy", "terms", "dialogue-ethics"];

/** قراءة نصوص الصفحات القانونية القابلة للتحرير — مع النصوص الافتراضية
    المعرضة حاليًا على الموقع (لتعبئة المحرر عند غياب نسخة محفوظة) */
export async function GET(request: Request) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  try {
    const pages = await prisma.legalPage.findMany({
      where: { slug: { in: ALLOWED_SLUGS } },
    });
    /* النص الافتراضي لكل صفحة — نفس المصدر الذي يعرضه الموقع العام عند غياب النسخة المحفوظة */
    const defaults = Object.fromEntries(
      ALLOWED_SLUGS.map((slug) => [
        slug,
        {
          title: LEGAL_TITLES[slug as keyof typeof LEGAL_TITLES],
          content: LEGAL_DEFAULTS[slug as keyof typeof LEGAL_DEFAULTS],
          updatedAt: LEGAL_DEFAULTS_UPDATED_AT,
        },
      ]),
    );
    return NextResponse.json({ pages, defaults });
  } catch {
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}

/** حفظ نص صفحة قانونية — تظهر التعديلات على المنصة فورًا */
export async function POST(request: Request) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  try {
    const body = (await request.json()) as { slug?: string; title?: string; content?: string };
    const slug = body.slug ?? "";

    if (!ALLOWED_SLUGS.includes(slug)) {
      return NextResponse.json({ error: "صفحة غير معروفة" }, { status: 400 });
    }
    if (!body.content?.trim()) {
      return NextResponse.json({ error: "محتوى الصفحة إلزامي" }, { status: 400 });
    }

    const TITLES: Record<string, string> = {
      privacy: "سياسة الخصوصية",
      terms: "شروط الاستخدام",
      "dialogue-ethics": "أخلاقيات الحوار والتعليق",
    };

    const page = await prisma.legalPage.upsert({
      where: { slug },
      update: {
        title: body.title?.trim() || TITLES[slug],
        content: body.content.slice(0, 60_000),
      },
      create: {
        slug,
        title: body.title?.trim() || TITLES[slug],
        content: body.content.slice(0, 60_000),
      },
    });

    await writeAudit({
      adminId: guard.adminId,
      action: "legal_page.updated",
      entity: "LegalPage",
      entityId: page.id,
      meta: { slug },
      ip: getClientIp(request),
    });

    /* النص الجديد حي على المنصة العامة لحظًا */
    revalidatePublicPaths([slug === "privacy" ? "/privacy" : slug === "terms" ? "/terms" : "/dialogue-ethics"]);

    return NextResponse.json({ page });
  } catch {
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}
