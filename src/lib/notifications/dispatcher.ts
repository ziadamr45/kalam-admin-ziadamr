import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { pushAdmins, pushUsers } from "@/lib/push";
import type { NotificationChannel, NotificationType } from "@prisma/client";

/**
 * المرسل المركزي الموحد لمنظومة الإشعارات السيادية (Central Notification Service).
 * كل إشعار في المنظومة الرقمية بالكامل — المنصة العامة ولوحة الأدمن — يمر من هنا وحده:
 *
 *   1) إنشاء السجل الموحد في جدول Notification (جرس داخل الموقع).
 *   2) بث ويب فوري عبر الاشتراكات المسجلة (Web Push).
 *   3) بريد إلكتروني معاملاتي عبر Gmail SMTP (Nodemailer) بقالب خفيف
 *      متعدد الأجزاء (HTML + Plain Text) لتفادي فلاتر السبام.
 *   4) رنين هواتف الإدارة لأحداث السيادة الإدارية.
 */

export const OWNER_EMAIL = "ziad90216@gmail.com";
export const PLATFORM_EMAIL = "kalamlaholazma@gmail.com";

export type DispatchChannels = "IN_APP" | "WEB_PUSH" | "EMAIL" | "ALL";

export type DispatchInput = {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string | null;
  metadata?: Record<string, unknown> | null;
  channels?: DispatchChannels;
  pushTag?: string;
  adminDevicePush?: boolean;
  emailHtml?: string | null;
  forceInApp?: boolean;
  forceEmail?: boolean;
};

export type DispatchResult = {
  inApp: boolean;
  pushSent: boolean;
  emailSent: boolean;
  adminPushed: boolean;
};

const IMPACT_PREF_TYPES = new Set<string>([
  "IMPACT_POINTS_EARNED",
  "COMMENT_REPLY",
  "COMMENT_APPROVED",
  "COMMENT_FEATURED",
  "COMMENT_UNFEATURED",
  "COMMENT_LIKED",
]);

const ARTICLE_PUSH_TYPES = new Set<string>(["ARTICLE_PUBLISHED", "BROADCAST"]);

type UserPrefs = {
  email: string | null;
  banned: boolean;
  pushNewArticles: boolean;
  impactAndReplies: boolean;
};

async function loadPrefs(userId: string): Promise<UserPrefs> {
  const fallback: UserPrefs = {
    email: null,
    banned: false,
    pushNewArticles: true,
    impactAndReplies: true,
  };
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, banned: true, notificationPrefs: true },
    });
    if (!user) return fallback;
    const raw = (user.notificationPrefs ?? null) as {
      pushNewArticles?: boolean;
      impactAndReplies?: boolean;
    } | null;
    return {
      email: user.email ?? null,
      banned: user.banned,
      pushNewArticles: raw?.pushNewArticles !== false,
      impactAndReplies: raw?.impactAndReplies !== false,
    };
  } catch {
    return fallback;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function emailThemeFor(type?: string): {
  badge: string;
  accent: string;
  softBg: string;
  headerBg: string;
  ctaLabel: string;
} {
  if (type === "SECURITY_NEW_LOGIN") {
    return {
      badge: "تنبيه أمني",
      accent: "#DC2626",
      softBg: "#FEF2F2",
      headerBg: "#18181B",
      ctaLabel: "مراجعة الأجهزة والجلسات",
    };
  }
  if (
    type === "USER_VERIFIED" ||
    type === "AHL_AL_KALIMA_UNLOCKED" ||
    type === "VIP_UPGRADE_GRANTED"
  ) {
    return {
      badge: "توثيق وتمييز",
      accent: "#A16A1F",
      softBg: "#FDF8EE",
      headerBg: "#1E293B",
      ctaLabel: "عرض بطاقتك الفكرية",
    };
  }
  if (type === "VIP_REVOKED" || type?.startsWith("ADMIN_")) {
    return {
      badge: type?.startsWith("ADMIN_") ? "إشعار إداري" : "تحديث الحساب",
      accent: "#475569",
      softBg: "#F1F5F9",
      headerBg: "#0F172A",
      ctaLabel: "عرض التفاصيل",
    };
  }
  if (type === "COMMENT_FEATURED" || type === "IMPACT_POINTS_EARNED" || type === "COMMENT_APPROVED") {
    return {
      badge: "أثر وتفاعل",
      accent: "#3C7A4E",
      softBg: "#F0FDF4",
      headerBg: "#1E293B",
      ctaLabel: "الانتقال إلى المنصة",
    };
  }
  return {
    badge: "إشعار من المنصة",
    accent: "#A16A1F",
    softBg: "#FAF6EE",
    headerBg: "#1E293B",
    ctaLabel: "فتح في المنصة",
  };
}

/**
 * قالب البريد المعاملاتي الموحد — خفيف جدًا (~3KB)، متوافق مع كل عملاء البريد،
 * بهوية «كلام له لازمة» الورقية الدافئة مع تثبيت RTL على كل عنصر داخلي.
 */
export function notificationEmailHtml(
  title: string,
  message: string,
  link: string | null,
  type?: string,
): string {
  const theme = emailThemeFor(type);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://kalam-ziadamr.vercel.app";
  const logoUrl = `${siteUrl}/icons/icon-192.png`;
  const targetUrl = link
    ? link.startsWith("http")
      ? link
      : `${siteUrl}${link.startsWith("/") ? link : `/${link}`}`
    : null;

  const lines = message
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map(
      (l) =>
        `<p dir="rtl" style="margin:0 0 12px;line-height:1.95;color:#2B241A;font-size:15px;direction:rtl;text-align:right;">${escapeHtml(l)}</p>`,
    )
    .join("");

  return `<!DOCTYPE html><html dir="rtl" lang="ar"><body style="margin:0;padding:24px 12px;background:#F5EFE4;font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;text-align:right;">
<div dir="rtl" style="direction:rtl;text-align:right;">
<table dir="rtl" align="center" role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #E7DEC9;border-radius:16px;overflow:hidden;direction:rtl;text-align:right;">
  <tr>
    <td dir="rtl" align="right" style="background:${theme.headerBg};padding:18px 24px;border-bottom:3px solid ${theme.accent};direction:rtl;text-align:right;">
      <table dir="rtl" role="presentation" width="100%" cellspacing="0" cellpadding="0" style="direction:rtl;text-align:right;">
        <tr>
          <td style="vertical-align:middle;width:44px;">
            <img src="${logoUrl}" width="40" height="40" alt="كلام له لازمة" style="display:block;border-radius:10px;border:1px solid rgba(255,255,255,0.18);"/>
          </td>
          <td dir="rtl" align="right" style="vertical-align:middle;padding-right:12px;direction:rtl;text-align:right;">
            <div style="color:#FAF6EE;font-size:17px;font-weight:700;line-height:1.3;text-align:right;">كلام له لازمة</div>
            <div style="color:#CBD5E1;font-size:11.5px;margin-top:2px;text-align:right;">مش كل كلام لازم يتقال.. بس فيه كلام له لازمة.</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td dir="rtl" align="right" style="padding:26px 24px 22px;direction:rtl;text-align:right;">
      <div style="display:inline-block;padding:4px 12px;border-radius:999px;background:${theme.softBg};color:${theme.accent};font-size:11.5px;font-weight:700;margin-bottom:14px;border:1px solid ${theme.accent}33;">${theme.badge}</div>
      <h1 dir="rtl" style="margin:0 0 16px;font-size:19px;color:#1F1A14;line-height:1.6;direction:rtl;text-align:right;">${escapeHtml(title)}</h1>
      ${lines}
      ${
        targetUrl
          ? `<div dir="rtl" style="margin-top:20px;text-align:right;"><a href="${targetUrl}" style="display:inline-block;background:${theme.accent};color:#FFFFFF;text-decoration:none;padding:11px 24px;border-radius:999px;font-size:14px;font-weight:700;">${theme.ctaLabel}</a></div>`
          : ""
      }
    </td>
  </tr>
  <tr>
    <td dir="rtl" align="right" style="padding:15px 24px;background:#FAF6EE;border-top:1px solid #E7DEC9;color:#6B5F4D;font-size:11.5px;line-height:1.85;direction:rtl;text-align:right;">
      تصلك هذه الرسالة من منصة <a href="${siteUrl}" style="color:#A16A1F;text-decoration:none;font-weight:700;">كلام له لازمة</a> لتنبيهك بشأن حسابك. رسائل الأمان إلزامية لحماية الحساب، ويمكنك ضبط بقية التفضيلات من <a href="${siteUrl}/profile" style="color:#A16A1F;text-decoration:none;">ملفك الشخصي</a>.
    </td>
  </tr>
</table>
</div>
</body></html>`;
}

export type EmailConfig = {
  user: string | null;
  pass: string | null;
  key: string | null;
  from: string;
};

export async function resolveEmailConfig(): Promise<EmailConfig> {
  let user = process.env.SMTP_USER?.trim() || null;
  let pass = process.env.SMTP_PASS?.trim().replace(/\s+/g, "") || null;
  let from = process.env.SECURITY_EMAIL_FROM?.trim() || null;

  if (!user || !pass || !from) {
    try {
      const rows = await prisma.systemSetting.findMany({
        where: { key: { in: ["SMTP_USER", "SMTP_PASS", "SECURITY_EMAIL_FROM"] } },
        select: { key: true, value: true },
      });
      for (const row of rows) {
        const raw = row.value as unknown;
        const val =
          typeof raw === "string"
            ? raw.trim()
            : ((raw as { value?: string })?.value ?? "").toString().trim();
        if (!val) continue;
        if (row.key === "SMTP_USER" && !user) user = val;
        if (row.key === "SMTP_PASS" && !pass) pass = val.replace(/\s+/g, "");
        if (row.key === "SECURITY_EMAIL_FROM" && !from) from = val;
      }
    } catch {
      /* قاعدة البيانات غائبة — البيئة تكفي إن وجدت */
    }
  }

  const effectiveUser = user ?? (pass ? PLATFORM_EMAIL : null);
  return {
    user: effectiveUser,
    pass,
    key: pass,
    from: from ?? `كلام له لازمة <${effectiveUser ?? PLATFORM_EMAIL}>`,
  };
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h1|h2|h3|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function sendRawEmail(input: {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string;
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const { user, pass, from } = await resolveEmailConfig();
  if (!user || !pass) {
    return { ok: false, error: "قناة البريد غير مهيأة (SMTP_USER / SMTP_PASS)" };
  }
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass },
    });
    const plainText =
      input.text ?? (input.html ? stripHtmlToText(input.html) : undefined);
    const info = await transporter.sendMail({
      from: input.from ?? from,
      to: Array.isArray(input.to) ? input.to.join(", ") : input.to,
      subject: input.subject,
      replyTo: input.replyTo ?? user,
      ...(input.html ? { html: input.html } : {}),
      ...(plainText ? { text: plainText } : {}),
    });
    try {
      const { bumpApiUsage } = await import("@/lib/api-usage");
      void bumpApiUsage("RESEND_EMAIL");
    } catch {
      /* عداد رقابي اختياري */
    }
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function sendEmail(input: {
  to: string;
  title: string;
  message: string;
  link: string | null;
  html?: string | null;
  type?: string;
}): Promise<boolean> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://kalam-ziadamr.vercel.app";
  const linkLine = input.link
    ? `\n\nفتح في المنصة: ${input.link.startsWith("http") ? input.link : `${siteUrl}${input.link.startsWith("/") ? input.link : `/${input.link}`}`}`
    : "";
  const res = await sendRawEmail({
    to: input.to,
    subject: input.title,
    text: `${input.title}\n\n${input.message}${linkLine}\n\n—\nكلام له لازمة`,
    html: input.html ?? notificationEmailHtml(input.title, input.message, input.link, input.type),
  });
  return res.ok;
}

export async function getOwnerUserId(): Promise<string | null> {
  try {
    const owner = await prisma.user.findUnique({
      where: { email: OWNER_EMAIL },
      select: { id: true },
    });
    return owner?.id ?? null;
  } catch {
    return null;
  }
}

export async function dispatchNotification(input: DispatchInput): Promise<DispatchResult> {
  const result: DispatchResult = {
    inApp: false,
    pushSent: false,
    emailSent: false,
    adminPushed: false,
  };
  const channels: DispatchChannels = input.channels ?? "ALL";
  const prefs = await loadPrefs(input.userId);
  if (prefs.banned) return result;

  const wantInApp = channels === "ALL" || channels === "IN_APP";
  const wantPush = channels === "ALL" || channels === "WEB_PUSH";
  const wantEmail = channels === "ALL" || channels === "EMAIL";

  const suppressImpact = !input.forceInApp && IMPACT_PREF_TYPES.has(input.type) && !prefs.impactAndReplies;
  const suppressArticlePush = ARTICLE_PUSH_TYPES.has(input.type) && !prefs.pushNewArticles;

  const link = input.link ?? null;

  /* 1) السجل الموحد — جرس داخل الموقع */
  if (wantInApp && !suppressImpact) {
    try {
      await prisma.notification.create({
        data: {
          userId: input.userId,
          type: input.type,
          title: input.title.slice(0, 200),
          message: input.message,
          link,
          metadata: (input.metadata ?? undefined) as never,
          channel: channels as NotificationChannel,
        },
      });
      result.inApp = true;
    } catch {
      /* منع الانهيار — بقية القنوات تُكمل */
    }
  }

  /* 2) بث الويب الفوري */
  if (wantPush && !suppressImpact && !suppressArticlePush) {
    try {
      const sent = await pushUsers(
        {
          title: input.title.slice(0, 120),
          body: input.message.slice(0, 180),
          url: link ?? "/",
          tag: input.pushTag ?? input.type.toLowerCase(),
        },
        { userIds: [input.userId] },
      );
      result.pushSent = sent > 0;
    } catch {
      /* صامت */
    }
  }

  /* 3) البريد المعاملاتي عبر Gmail SMTP (معزول كليًا عن الجرس والـ Push) */
  if (wantEmail && (input.forceEmail || !suppressImpact) && prefs.email) {
    result.emailSent = await sendEmail({
      to: prefs.email,
      title: input.title,
      message: input.message,
      link,
      html: input.emailHtml,
      type: input.type,
    });
  }

  /* 4) رنين هواتف الإدارة لأحداث السيادة */
  if (input.adminDevicePush) {
    try {
      await pushAdmins({
        title: input.title.slice(0, 120),
        body: input.message.slice(0, 160),
        url: link ?? "/",
        tag: input.pushTag ? `admin-${input.pushTag}` : `admin-${input.type.toLowerCase()}`,
      });
      result.adminPushed = true;
    } catch {
      /* صامت */
    }
  }

  try {
    await prisma.auditEvent.create({
      data: {
        type: "NOTIFICATION_DISPATCHED",
        actorType: "SYSTEM",
        actorId: input.userId,
        message: input.title.slice(0, 200),
        meta: {
          notificationType: input.type,
          channels: result,
          link,
        } as never,
      },
    });
  } catch {
    /* صامت */
  }

  return result;
}

export async function dispatchBroadcast(input: {
  type: NotificationType;
  title: string;
  message: string;
  link?: string | null;
  userIds?: string[];
  channels?: DispatchChannels;
  pushTag?: string;
  metadata?: Record<string, unknown> | null;
}): Promise<{ inApp: number; pushSent: number }> {
  const channels: DispatchChannels = input.channels ?? "ALL";
  const wantInApp = channels === "ALL" || channels === "IN_APP";
  const wantPush = channels === "ALL" || channels === "WEB_PUSH";
  const suppressArticlePush = ARTICLE_PUSH_TYPES.has(input.type);

  try {
    const users = await prisma.user.findMany({
      where: {
        banned: false,
        ...(input.userIds?.length ? { id: { in: input.userIds } } : {}),
      },
      select: { id: true, notificationPrefs: true },
    });
    if (users.length === 0) return { inApp: 0, pushSent: 0 };

    const pushUserIds: string[] = [];
    for (const u of users) {
      const raw = (u.notificationPrefs ?? null) as { pushNewArticles?: boolean } | null;
      const allowsPush = suppressArticlePush ? raw?.pushNewArticles !== false : true;
      if (wantPush && !suppressArticlePush && allowsPush) pushUserIds.push(u.id);
    }

    let inApp = 0;
    if (wantInApp) {
      await prisma.notification.createMany({
        data: users.map((u) => ({
          userId: u.id,
          type: input.type,
          title: input.title.slice(0, 200),
          message: input.message,
          link: input.link ?? null,
          metadata: (input.metadata ?? undefined) as never,
          channel: channels as NotificationChannel,
        })),
      });
      inApp = users.length;
    }

    let pushSent = 0;
    if (wantPush && !suppressArticlePush && pushUserIds.length > 0) {
      pushSent = await pushUsers(
        {
          title: input.title.slice(0, 120),
          body: input.message.slice(0, 180),
          url: input.link ?? "/",
          tag: input.pushTag ?? input.type.toLowerCase(),
        },
        { userIds: pushUserIds },
      );
    }

    try {
      await prisma.auditEvent.create({
        data: {
          type: "NOTIFICATION_DISPATCHED",
          actorType: "SYSTEM",
          message: input.title.slice(0, 200),
          meta: {
            notificationType: input.type,
            broadcast: true,
            recipients: users.length,
            channels: { inApp, pushSent },
          } as never,
        },
      });
    } catch {
      /* صامت */
    }

    return { inApp, pushSent };
  } catch {
    return { inApp: 0, pushSent: 0 };
  }
}

export async function dispatchAdminEvent(input: {
  type: NotificationType;
  title: string;
  message: string;
  link?: string | null;
  metadata?: Record<string, unknown> | null;
  pushTag?: string;
  emergencyEmail?: boolean;
}): Promise<void> {
  const ownerId = await getOwnerUserId();
  if (ownerId) {
    await dispatchNotification({
      userId: ownerId,
      type: input.type,
      title: input.title,
      message: input.message,
      link: input.link,
      metadata: input.metadata,
      channels: input.emergencyEmail ? "ALL" : "IN_APP",
      pushTag: input.pushTag,
      forceInApp: true,
      forceEmail: input.emergencyEmail,
    }).catch(() => {});
  }
  try {
    await pushAdmins({
      title: input.title.slice(0, 120),
      body: input.message.slice(0, 160),
      url: link ?? "/",
      tag: input.pushTag ? `admin-${input.pushTag}` : `admin-${input.type.toLowerCase()}`,
    });
  } catch {
    /* صامت */
  }
}
