import { NextResponse } from "next/server";
import { recordServerError } from "@/lib/error-alert";

/**
 * بوابة استقبال أخطاء الخادم من instrumentation — محمية بالسر الداخلي.
 * لماذا fetch وليس استدعاءً مباشرًا؟ لأن instrumentation يُجمَّع لبيئة
 * الحافة أيضًا، ومحرك التنبيه يحمل web-push (Node-only) — فالتقسيم
 * المعماري: instrumentation يوصل الرسالة، والمسار الداخلي (Node runtime
 * حصريًا) ينفذ التجميع والبث.
 *
 * صمام الانحصار: هذا المسار لا يردّ 500 أبدًا — وإلا لأدار حلقة
 * أخطاء لا نهائية مع onRequestError.
 */

export async function POST(request: Request) {
  try {
    const secret = request.headers.get("x-traffic-secret");
    if (!secret || secret !== (process.env.REVALIDATE_SECRET ?? "")) {
      return NextResponse.json({ ok: false }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as {
      message?: string;
      stack?: string | null;
      path?: string | null;
      method?: string | null;
      routeType?: string | null;
      requestId?: string | null;
      url?: string;
      app?: "PUBLIC" | "ADMIN";
    } | null;

    if (body?.message) {
      const e = new Error(body.message.slice(0, 2000));
      if (body.stack) e.stack = body.stack.slice(0, 8000);
      await recordServerError({
        err: e,
        app: body.app === "ADMIN" ? "ADMIN" : "PUBLIC",
        path: body.path ?? null,
        method: body.method ?? null,
        routeType: body.routeType ?? null,
        requestId: body.requestId ?? null,
        url: body.url,
      });
    }

    return NextResponse.json({ ok: true });
  } catch {
    /* لا 500 هنا إطلاقًا — صمام الانحصار المضاد للحلقات */
    return NextResponse.json({ ok: true });
  }
}
