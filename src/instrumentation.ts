/**
 * instrumentation لوحة التحكم — onRequestError يلتقط كل خطأ تشغيلي
 * (Route Handlers و Server Actions والرندر) لحظة وقوعه مع Stack Trace
 * الكامل، ويوثقه في ServerErrorLog ويربطه بسجل الحركة بمعرف الارتباط.
 * app = ADMIN
 */

export async function register() {
  /* لا تهيئة دورية — الالتقاط حصريًا عبر onRequestError */
}

/** Web Crypto (متاحة في Node 18+ وعلى الحافة) — بلا اعتماد node:crypto */
async function digestOf(message: string, stack: string | null): Promise<string> {
  const top = (stack ?? "").split("\n").slice(0, 3).join("|");
  try {
    const data = new TextEncoder().encode(`${message}\n${top}`);
    const buf = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 32);
  } catch {
    return `${message.length}`.padEnd(32, "0");
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
    const { prisma } = await import("@/lib/prisma");
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? (err.stack ?? null) : null;
    const digest = await digestOf(message, stack);
    const requestId = headerOf(request?.headers, "x-kalam-rid");

    await prisma.serverErrorLog.create({
      data: {
        digest,
        message: message.slice(0, 2000),
        stack: stack?.slice(0, 8000) ?? null,
        path: request?.path ?? null,
        method: request?.method ?? null,
        routeType: context?.routeType ?? context?.routerKind ?? null,
        requestId,
        app: "ADMIN",
      },
    });

    if (requestId) {
      await prisma.requestLog.updateMany({
        where: { requestId },
        data: { status: 500, isError: true },
      });
    }
  } catch {
    /* التوثيق لا يرفع الأخطاء أبدًا */
  }
}
