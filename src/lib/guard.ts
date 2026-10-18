import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { pushAdmins } from "@/lib/push";

/* خنق الإشعارات الأمنية الفورية: كل نوع تنبيه مرة كل دقيقتين كحد أقصى،
   والحالات الحرجة (CRITICAL) تُبث دائمًا دون خنق */
const alertPushAt = new Map<string, number>();
const ALERT_PUSH_THROTTLE_MS = 2 * 60_000;

/**
 * حرس المسارات والـ API — طبقة الدفاع الثانية (بعد الـ middleware)
 * كل مسار API إداري يستدعي requireSession وrequireCsrf قبل أي عمل
 */

export type GuardedContext = {
  adminId: string;
  username: string;
  ip: string;
};

/** استخراج IP الحقيقي من ترويسات Vercel/البروكسي */
export function getClientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

export function getUserAgent(request: Request): string {
  return request.headers.get("user-agent") || "unknown";
}

/** حماية CSRF: التحقق من تطابق Origin مع المضيف */
export function requireCsrf(request: Request): NextResponse | null {
  const method = request.method;
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return null;

  const origin = request.headers.get("origin");
  if (!origin) return null; // sendBeacon/same-origin fetch يرسل Origin دائمًا

  try {
    const originHost = new URL(origin).host;
    const host = request.headers.get("host");
    const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL;
    const allowed = host ? originHost === host : false;
    const allowedAdminUrl = adminUrl ? originHost === new URL(adminUrl).host : false;
    if (!allowed && !allowedAdminUrl) {
      return NextResponse.json({ error: "طلب مرفوض (CSRF)" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "طلب مرفوض (CSRF)" }, { status: 403 });
  }
  return null;
}

/** يتطلب جلسة إدارية صالحة — يعيد الاستجابة أم سياق الجلسة */
export async function requireSession(request: Request): Promise<GuardedContext | NextResponse> {
  const csrf = requireCsrf(request);
  if (csrf) return csrf;

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "جلسة غير صالحة — أعد تسجيل الدخول" }, { status: 401 });
  }

  return { adminId: session.adminId, username: session.username, ip: getClientIp(request) };
}

/** دالة مساعدة: هل النتيجة استجابة رفض؟ */
export function isRejected(result: unknown): result is NextResponse {
  return result instanceof NextResponse || (typeof result === "object" && result !== null && "status" in result && "json" in result);
}

/** سجل التدقيق */
export async function writeAudit(entry: {
  adminId?: string | null;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  meta?: Record<string, unknown>;
  ip?: string | null;
}): Promise<void> {
  await prisma.auditLog
    .create({
      data: {
        adminId: entry.adminId ?? null,
        action: entry.action,
        entity: entry.entity ?? null,
        entityId: entry.entityId ?? null,
        meta: (entry.meta ?? undefined) as never,
        ip: entry.ip ?? null,
      },
    })
    .catch(() => {});
}

/** تنبيه أمني — يُسجَّل في القاعدة ثم يُبث فورًا لهاتف صاحب المنصة وحاسوبه */
export async function raiseAlert(alert: {
  type: string;
  severity?: "INFO" | "WARN" | "CRITICAL";
  message: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  await prisma.securityAlert
    .create({
      data: {
        type: alert.type,
        severity: alert.severity ?? "INFO",
        message: alert.message,
        meta: (alert.meta ?? undefined) as never,
      },
    })
    .catch(() => {});

  /* الإشعار الفوري — طبقة تزيين لا تعطل مسار الأمن أبدًا */
  try {
    const now = Date.now();
    const critical = (alert.severity ?? "INFO") === "CRITICAL";
    if (!critical && (alertPushAt.get(alert.type) ?? 0) > now - ALERT_PUSH_THROTTLE_MS) return;
    alertPushAt.set(alert.type, now);
    void pushAdmins({
      title: "تنبيه أمني: رصد محاولة دخول غير مصرح بها",
      body: alert.message.slice(0, 160),
      url: "/security",
      tag: `security-${alert.type}`,
    });
  } catch {
    /* صامت */
  }
}
