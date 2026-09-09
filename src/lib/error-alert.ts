/**
 * ============================================================
 * منظومة تنبيه أخطاء الخادم 500 — السجل + التجميع + البث الفوري
 * ============================================================
 * نقطة واحدة مركزية تخدم قناتين: onRequestError في instrumentation
 * (الأخطاء غير الملتقطة) وكتل catch في المسارات (الأخطاء الملتقطة
 * التي ترد 500 للقارئ).
 *
 * السلوك الثلاثي لكل خطأ:
 *  1. توثيق في ServerErrorLog بتجميع ذكي — البصمة المتكررة خلال
 *     30 دقيقة تُحدَّث (count+1, lastSeenAt) بدل إغراق الجدول.
 *  2. بث Push فوري لهواتف الإدارة عند أول ظهور للبصمة فقط —
 *     بلا تكرار مزعج، ومشروط بعلم التكوين ERROR_ALERTS_ENABLED.
 *  3. ربط بسجل الحركة عبر معرف الارتباط x-kalam-rid.
 *
 * كل شيء صامت تمامًا: المنبه لا يرفع خطأ أبدًا ولا يبطئ المسار.
 */

import { createHash } from "crypto";

const DEDUPE_WINDOW_MS = 30 * 60_000;

/** كاش علم التكوين — دقيقة واحدة حتى لا يُسأل الجدول مع كل خطأ */
let flagCache: { value: boolean; at: number } | null = null;

async function alertsEnabled(): Promise<boolean> {
  if (flagCache && Date.now() - flagCache.at < 60_000) return flagCache.value;
  try {
    const { prisma } = await import("@/lib/prisma");
    const row = await prisma.siteConfig.findUnique({ where: { key: "ERROR_ALERTS_ENABLED" } });
    const value = row ? row.value !== false : true;
    flagCache = { value, at: Date.now() };
    return value;
  } catch {
    return true;
  }
}

/** بصمة الخطأ: رسالة + أعلى ثلاثة أسطر من الستاك + المسار */
function digestOf(message: string, stack: string | null, path: string | null): string {
  const top = (stack ?? "").split("\n").slice(0, 3).join("|");
  return createHash("sha256")
    .update(`${message}\n${top}\n${path ?? ""}`)
    .digest("hex")
    .slice(0, 32);
}

export type ServerErrorInput = {
  err: unknown;
  app: "PUBLIC" | "ADMIN";
  path?: string | null;
  method?: string | null;
  routeType?: string | null;
  requestId?: string | null;
  /** تُستخدم للبث: رابط الزر داخل الإشعار */
  url?: string;
};

/**
 * تسجيل خطأ خادم + بث تنبيه فوري عند أول ظهور له.
 * آمن للاستدعاء من أي مكان — لا يرمي أبدًا.
 */
export async function recordServerError(input: ServerErrorInput): Promise<void> {
  try {
    const { prisma } = await import("@/lib/prisma");

    const message = input.err instanceof Error ? input.err.message : String(input.err ?? "خطأ غير معروف");
    const stack = input.err instanceof Error ? (input.err.stack ?? null) : null;
    const digest = digestOf(message, stack, input.path ?? null);
    const now = new Date();
    const windowStart = new Date(now.getTime() - DEDUPE_WINDOW_MS);

    /* تجميع ذكي: البصمة الحية خلال 30 دقيقة تُحدَّث بدل صف جديد */
    const existing = await prisma.serverErrorLog.findFirst({
      where: { digest, app: input.app, createdAt: { gte: windowStart } },
      select: { id: true },
    });

    let isNew = false;
    if (existing) {
      await prisma.serverErrorLog.update({
        where: { id: existing.id },
        data: { count: { increment: 1 }, lastSeenAt: now },
      });
    } else {
      await prisma.serverErrorLog.create({
        data: {
          digest,
          message: message.slice(0, 2000),
          stack: stack?.slice(0, 8000) ?? null,
          path: input.path ?? null,
          method: input.method ?? null,
          routeType: input.routeType ?? null,
          requestId: input.requestId ?? null,
          app: input.app,
        },
      });
      isNew = true;
    }

    /* ربط سجل الحركة بمعرف الارتباط */
    if (input.requestId) {
      await prisma.requestLog
        .updateMany({
          where: { requestId: input.requestId },
          data: { status: 500, isError: true },
        })
        .catch(() => {});
    }

    /* التنبيه السيادي عبر المرسل المركزي: سجل موحد لحساب المالك + رنين هواتف
       الإدارة + بريد طوارئ — أول ظهور فقط + العلم مفعل + بيئة إنتاج */
    if (
      isNew &&
      process.env.NODE_ENV === "production" &&
      (await alertsEnabled())
    ) {
      const { dispatchAdminEvent } = await import("@/lib/notifications/dispatcher");
      const appLabel = input.app === "ADMIN" ? "لوحة التحكم" : "المنصة العامة";
      await dispatchAdminEvent({
        type: "ADMIN_SYSTEM_ALERT",
        title: `تنبيه تقني: خطأ 500 جديد — ${appLabel}`,
        message: `${message.slice(0, 140)}${message.length > 140 ? "…" : ""}${
          input.path ? ` — المسار: ${input.path}` : ""
        }`,
        link: input.url ?? "/system?tab=errors",
        pushTag: `server-error-${digest.slice(0, 10)}`,
        metadata: { digest, app: input.app, path: input.path ?? null },
        emergencyEmail: true,
      }).catch(() => {});
    }
  } catch {
    /* المنبه لا يرفع الأخطاء أبدًا */
  }
}

/** استخراج معرف الارتباط من ترويسات الطلب بأي صيغة */
export function ridFromHeaders(headers: unknown): string | null {
  try {
    if (headers && typeof (headers as Headers).get === "function") {
      return (headers as Headers).get("x-kalam-rid");
    }
    if (headers && typeof headers === "object") {
      const rec = headers as Record<string, string | string[] | undefined>;
      const v = rec["x-kalam-rid"] ?? rec["X-Kalam-Rid"];
      return Array.isArray(v) ? v[0] : (v ?? null);
    }
  } catch {}
  return null;
}
