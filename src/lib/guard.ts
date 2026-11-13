import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { pushAdmins } from "@/lib/push";
import { writeTrail, sanitizeAuditMeta } from "@/lib/audit-trail";
import { currentChannel } from "@/lib/audit-channel";
import type { TrailCategory } from "@/lib/audit-trail";

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

/* ==================== المرآة السيادية: writeAudit → AuditTrail ====================

   كل فعل مغيّر يُسجَّل في AuditLog التقني يُنسخ تلقائيًا إلى «السجل
   السيادي» (AuditTrail) بالتصنيف والمصدر والوصف العربي — تغطية فورية
   لكل مواقع writeAudit (~173 موقعًا) دون تعديلها واحدًا واحدًا.
   الأفعال القرائية (دخول/عرض/جلسة) لا تُنسخ، وقنوات MCP وCLI يملك
   كلٌّ منهما كاتبه المتخصص (مسار القيد الموحد في نقطة التنفيذ) فتُستثنى
   من المرآة لتجنب ازدواج القيود. */

/** بادئات الأفعال غير المغيّرة — تُبقى في AuditLog التقني فقط */
const NON_MUTATING_PREFIXES = [
  "login",
  "logout",
  "session",
  "mcp.", // قناة MCP تملك كاتبها الموحد في نقطة التنفيذ
  "cli.", // قناة CLI تملك كاتبها الموحد في نقطة التنفيذ
  "view",
  "read.",
  "health",
  "ping",
];

/** تجاوزات دقيقة قبل قواعد البادئات — أفعال خاصة بموضعها الرقابي */
const ACTION_OVERRIDES: Record<string, { category: TrailCategory; verb: string } | null> = {
  "notifications.read": null, // قراءة الصندوق — ليست فعلًا مغيّرًا
  "cron.published": { category: "CONTENT_CHANGE", verb: "نشر تلقائي مجدول" },
  "email-channel.test": { category: "SYSTEM_CONFIG_CHANGE", verb: "اختبار قناة بريد" },
  "test": null,
};

/** تصنيف الفعل: بادئة → (تصنيف السجل السيادي، فعل عربي للوصف) */
const ACTION_CLASSIFICATION: Array<{
  prefixes: string[];
  category: TrailCategory;
  verb: string;
}> = [
  { prefixes: ["article", "section", "category", "cover", "audio", "media", "upload", "cloudinary", "legal", "broadcast", "content"], category: "CONTENT_CHANGE", verb: "تغيير محتوى" },
  { prefixes: ["comment", "proposal", "moderation", "ban", "user", "message"], category: "ADMIN_MODERATION", verb: "إجراء رقابي" },
  { prefixes: ["vip", "verify", "rank", "badge", "role", "privilege"], category: "ADMIN_VIP_CHANGE", verb: "تعديل توثيق ورُتب" },
  { prefixes: ["settings", "setting", "config", "site", "security", "auth", "password", "email-channel", "notification", "push"], category: "SYSTEM_CONFIG_CHANGE", verb: "تعديل إعدادات" },
  { prefixes: ["gh", "github", "vercel", "deploy", "db", "cache", "maintenance", "infra", "domain", "env"], category: "INFRASTRUCTURE_CHANGE", verb: "تغيير بنية تحتية" },
];

function classifyAction(action: string): { category: TrailCategory; verb: string } | null {
  if (NON_MUTATING_PREFIXES.some((p) => action.startsWith(p))) return null;
  const override = ACTION_OVERRIDES[action];
  if (override !== undefined) return override;
  for (const rule of ACTION_CLASSIFICATION) {
    if (rule.prefixes.some((p) => action.startsWith(p))) return { category: rule.category, verb: rule.verb };
  }
  /* الفشل نحو التسجيل: أي فعل غير مصنف يُعد مغيّرًا افتراضيًا */
  return { category: "SYSTEM_CONFIG_CHANGE", verb: "تنفيذ إجراء" };
}

/** ذاكرة هوية الأدمن — تمنع استعلام هوية لكل قيد (5 دقائق) */
const adminIdentityCache = new Map<string, { email: string; role: string }>();
const ADMIN_CACHE_MS = 5 * 60_000;

async function resolveAdminIdentity(adminId: string): Promise<{ email: string; role: string }> {
  const cached = adminIdentityCache.get(adminId);
  if (cached) return cached;
  /* أدمن واحد سيادي (OWNER) — يُجلب اسمه فقط، الدور ثابت بالتصميم */
  const admin = await prisma.adminUser
    .findUnique({ where: { id: adminId }, select: { username: true } })
    .catch(() => null);
  const identity = {
    email: admin ? `${admin.username}@sovereign.admin` : `admin:${adminId}`,
    role: "OWNER",
  };
  adminIdentityCache.set(adminId, identity);
  setTimeout(() => adminIdentityCache.delete(adminId), ADMIN_CACHE_MS).unref?.();
  return identity;
}

/** سجل التدقيق — يكتب الجدول التقني ثم ينسخ الفعل المغيّر للسجل السيادي */
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

  /* المرآة السيادية — الفشل صامت أبدًا ولا يعطل المسار */
  const classification = classifyAction(entry.action);
  if (!classification) return;
  try {
    const channel = currentChannel();
    const isAdmin = Boolean(entry.adminId);
    const identity = isAdmin
      ? await resolveAdminIdentity(entry.adminId as string)
      : { email: `${channel.channel}:${channel.label ?? "قناة خارجية"}`, role: "SYSTEM" };
    const reason = typeof entry.meta?.reason === "string" ? (entry.meta.reason as string) : null;
    await writeTrail({
      actorId: entry.adminId ?? `${channel.channel}`,
      actorEmail: identity.email,
      actorRole: identity.role,
      actionCategory: classification.category,
      actionType: entry.action.toUpperCase(),
      description: `${classification.verb}${entry.entity ? ` — ${entry.entity}` : ""}${entry.entityId ? ` (${entry.entityId.slice(0, 18)})` : ""}`,
      reason,
      targetId: entry.entityId ?? null,
      targetEmail: typeof entry.meta?.email === "string" ? (entry.meta.email as string) : null,
      metadata: {
        ip: entry.ip ?? null,
        action: entry.action,
        ...(sanitizeAuditMeta(entry.meta) ?? {}),
      },
    });
  } catch {
    /* صامت — السجل الرقابي لا يعطل الإجراء أبدًا */
  }
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
