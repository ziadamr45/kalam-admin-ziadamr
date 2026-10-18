import { NextResponse } from "next/server";
import { requireSession, isRejected, writeAudit, getClientIp } from "@/lib/guard";
import {
  SITE_CONFIG_SCHEMA,
  getSiteConfigMap,
  saveSiteConfigEntries,
  type SiteConfigKeyDef,
} from "@/lib/site-config";
import { revalidatePath } from "next/cache";
import { revalidateTag } from "next/cache";
import { revalidatePublicPaths } from "@/lib/revalidate";

/**
 * واجهة استوديو التكوين السيادي — قراءة المخطط والقيم، وحفظ دفعات
 * مفاتيح مع انعكاس لحظي على المنصة العامة (Zero-Deploy Runtime Updates).
 */

export async function GET(request: Request) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  const values = await getSiteConfigMap();
  const schema: SiteConfigKeyDef[] = SITE_CONFIG_SCHEMA;
  return NextResponse.json(
    { schema, values },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  try {
    const body = (await request.json()) as { entries?: { key: string; value: unknown }[] };
    const entries = (body.entries ?? []).slice(0, 60);
    if (!entries.length) {
      return NextResponse.json({ error: "لا توجد مفاتيح للحفظ" }, { status: 400 });
    }

    const { saved } = await saveSiteConfigEntries(entries, `admin:${guard.username}`);

    /* الانعكاس اللحظي: كاش التكوين + كل صفحات المنصة العامة عابرة للتطبيقات */
    revalidateTag("site-config");
    revalidatePath("/", "layout");
    await revalidatePublicPaths(["/"], undefined, true);

    await writeAudit({
      adminId: guard.adminId,
      action: "site_config.updated",
      entity: "SiteConfig",
      meta: { keys: saved },
      ip: getClientIp(request),
    });

    const values = await getSiteConfigMap();
    return NextResponse.json({ saved, values });
  } catch (err) {
    const message = err instanceof Error ? err.message : "خطأ داخلي";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
