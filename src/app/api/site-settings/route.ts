import { NextResponse } from "next/server";
import { requireSession, isRejected, writeAudit, getClientIp } from "@/lib/guard";
import { getSiteConfig, saveSiteConfig, type SiteConfig } from "@/lib/site-config";
import { revalidatePublicPaths } from "@/lib/revalidate";

/** قراءة إعدادات الموقع العامة */
export async function GET(request: Request) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  const config = await getSiteConfig();
  return NextResponse.json({ config });
}

/** حفظ الإعدادات + انعكاس فوري على المنصة العامة */
export async function POST(request: Request) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  try {
    const body = (await request.json()) as Partial<SiteConfig>;

    const config = await saveSiteConfig({
      ...(body.SITE_META_TITLE !== undefined ? { SITE_META_TITLE: body.SITE_META_TITLE.slice(0, 120) } : {}),
      ...(body.SITE_META_DESC !== undefined ? { SITE_META_DESC: body.SITE_META_DESC.slice(0, 400) } : {}),
      ...(body.FOOTER_TEXT !== undefined ? { FOOTER_TEXT: body.FOOTER_TEXT.slice(0, 300) } : {}),
      ...(body.COMMENTS_ENABLED !== undefined ? { COMMENTS_ENABLED: Boolean(body.COMMENTS_ENABLED) } : {}),
      ...(body.TASHKEEL_ENABLED !== undefined ? { TASHKEEL_ENABLED: Boolean(body.TASHKEEL_ENABLED) } : {}),
    });

    await writeAudit({
      adminId: guard.adminId,
      action: "site_config.updated",
      entity: "SystemSetting",
      meta: {
        commentsEnabled: config.COMMENTS_ENABLED,
        tashkeelEnabled: config.TASHKEEL_ENABLED,
      },
      ip: getClientIp(request),
    });

    /* انعكاس فوري على كل صفحات المنصة العامة */
    revalidatePublicPaths(["/", "/about", "/contact", "/privacy", "/terms", "/dialogue-ethics"]);

    return NextResponse.json({ config });
  } catch {
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}
