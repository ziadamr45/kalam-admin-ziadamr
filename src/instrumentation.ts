/**
 * instrumentation لوحة التحكم — onRequestError يلتقط كل خطأ تشغيلي
 * (Route Handlers و Server Actions والرندر) لحظة وقوعه مع Stack Trace
 * الكامل، ويحوّله عبر fetch لمسار داخلي محمي بالسر ينفذ: التوثيق المجمّع
 * في ServerErrorLog + ربط سجل الحركة + بث Push فوري لهواتف الإدارة
 * عند أول ظهور لكل بصمة خطأ جديدة.
 * app = ADMIN
 *
 * لماذا fetch؟ instrumentation يُجمَّع لبيئة الحافة أيضًا ومحرك التنبيه
 * Node-only — التقسيم المعماري يبقي الحزمة نظيفة والمنبه حيًّا في القناتين.
 */

export async function register() {
  /* لا تهيئة دورية — الالتقاط حصريًا عبر onRequestError */
  /* البذر السيادي عند إقلاع الخادم: ضمان أن حساب صاحب المنصة سيادي
     كامل الصلاحيات (رتبة OWNER + توثيق + شارة المؤسس الذهبية + رصيد
     9999 + كل المفاتيح) — idempotent، لا كتابة إن كان مكتملًا */
  if (process.env.NEXT_RUNTIME === "nodejs") {
    import("@/lib/vip")
      .then(({ ensureOwnerSovereign }) => ensureOwnerSovereign())
      .catch(() => {});
  }
}

function headerOf(headers: unknown, name: string): string | null {
  try {
    if (headers && typeof (headers as Headers).get === "function") {
      return (headers as Headers).get(name);
    }
    if (headers && typeof headers === "object") {
      const rec = headers as Record<string, string | string[] | undefined>;
      const v = rec[name] ?? rec[name.toLowerCase()];
      return Array.isArray(v) ? v[0] : (v ?? null);
    }
  } catch {}
  return null;
}

export async function onRequestError(
  err: unknown,
  request: { path?: string; method?: string; headers?: unknown },
  context?: { routeType?: string; routePath?: string; routerKind?: string },
) {
  try {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? (err.stack ?? null) : null;

    const proto = headerOf(request?.headers, "x-forwarded-proto") ?? (process.env.NODE_ENV === "production" ? "https" : "http");
    const host = headerOf(request?.headers, "host");
    if (!host) return;

    await fetch(`${proto}://${host}/api/internal/error-alert`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-traffic-secret": process.env.REVALIDATE_SECRET ?? "",
      },
      body: JSON.stringify({
        app: "ADMIN",
        message,
        stack,
        path: request?.path ?? null,
        method: request?.method ?? null,
        routeType: context?.routeType ?? context?.routerKind ?? null,
        requestId: headerOf(request?.headers, "x-kalam-rid"),
        url: "/system?tab=errors",
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    /* التوثيق لا يرفع الأخطاء أبدًا */
  }
}
