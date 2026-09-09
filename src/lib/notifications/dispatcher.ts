import { prisma } from "@/lib/prisma";
import { pushAdmins, pushUsers } from "@/lib/push";
import type { NotificationChannel, NotificationType } from "@prisma/client";

/**
 * المرسل المركزي الموحد لمنظومة الإشعارات السيادية (Central Notification Service).
 * كل إشعار في المنظومة الرقمية بالكامل — المنصة العامة ولوحة الأدمن — يمر من هنا وحده:
 *
 *   1) إنشاء السجل الموحد في جدول Notification (جرس داخل الموقع).
 *   2) بث ويب فوري عبر الاشتراكات المسجلة (Web Push — البادج الأبيض المفرغ
 *      يحدده Service Worker لكل نطاق: badge-public للمنصة وbadge-admin للوحة).
 *   3) بريد إلكتروني معاملاتي عبر Resend عندما تتطلب القناة ذلك.
 *   4) رنين هواتف الإدارة (بادج اللوحة) لأحداث السيادة الإدارية.
 *
 * تحترم التفضيلات في User.notificationPrefs ما عدا الأمان (بريد الأمان إلزامي)،
 * وكل طبقة معزولة بـ catch خاص — فشل بريد لا يُسقط إشعارًا، والعكس.
 */

export const OWNER_EMAIL = "ziad90216@gmail.com";

export type DispatchChannels = "IN_APP" | "WEB_PUSH" | "EMAIL" | "ALL";

export type DispatchInput = {
  userId: string; // المستلم — قارئ أو حساب صاحب المنصة
  type: NotificationType;
  title: string;
  message: string;
  link?: string | null;
  metadata?: Record<string, unknown> | null;
  channels?: DispatchChannels; // الافتراضي ALL وفق مصفوفة الإرسال
  pushTag?: string;
  adminDevicePush?: boolean; // رنين إضافي لهواتف الإدارة (بادج اللوحة badge-admin)
  emailHtml?: string | null; // قالب بريد مخصص يغلف الرسالة
  forceInApp?: boolean; // إشعار لا يخضع لتفضيلات المستخدم (أمن، سيادة)
  forceEmail?: boolean; // بريد لا يُلغى بالإعدادات (الأمان)
};

export type DispatchResult = {
  inApp: boolean;
  pushSent: boolean;
  emailSent: boolean;
  adminPushed: boolean;
};

/** الأنواع التي يحكمها مفتاح «إشعارات الأثر والردود» في مركز التفضيلات */
const IMPACT_PREF_TYPES = new Set<string>([
  "IMPACT_POINTS_EARNED",
  "COMMENT_REPLY",
  "COMMENT_APPROVED",
  "COMMENT_FEATURED",
  "COMMENT_UNFEATURED",
  "COMMENT_LIKED",
]);

/** الأنواع التي يحكمها مفتاح «إشعارات المتصفح للمقالات الجديدة» */
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

/** قالب البريد المعاملاتي الموحد — عربي RTL فاخر ومتوافق مع عملاء البريد */
export function notificationEmailHtml(
  title: string,
  message: string,
  link: string | null,
): string {
  const lines = message
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `<p style="margin:0 0 12px;line-height:1.9;color:#3F3F46;font-size:15px;">${l}</p>`)
    .join("");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://kalam-ziadamr.vercel.app";
  return `<!DOCTYPE html><html dir="rtl" lang="ar"><body style="margin:0;padding:24px;background:#FAFAF9;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
<div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #E7E5E4;border-radius:16px;overflow:hidden;">
  <div style="background:#1E293B;padding:20px 24px;">
    <div style="color:#F5F5F4;font-size:18px;font-weight:700;">كلام له لازمة</div>
    <div style="color:#94A3B8;font-size:12px;margin-top:4px;">منظومة الإشعارات الرسمية</div>
  </div>
  <div style="padding:24px;">
    <h1 style="margin:0 0 16px;font-size:18px;color:#18181B;line-height:1.6;">${title}</h1>
    ${lines}
    ${
      link
        ? `<a href="${siteUrl}${link.startsWith("/") ? link : `/${link}`}" style="display:inline-block;margin-top:8px;background:#B45309;color:#FFFFFF;text-decoration:none;padding:10px 22px;border-radius:999px;font-size:14px;font-weight:700;">فتح في المنصة</a>`
        : ""
    }
  </div>
  <div style="padding:16px 24px;background:#FAFAF9;border-top:1px solid #E7E5E4;color:#A8A29E;font-size:11px;line-height:1.8;">
    وصلتك هذه الرسالة لأنك حساب موثق في منصة «كلام له لازمة». بريد التنبيهات الأمنية إلزامي ولا يمكن إلغاؤه؛ ويمكنك ضبط بقية التفضيلات من صفحة ملفك الشخصي.
  </div>
</div>
</body></html>`;
}

async function sendEmail(input: {
  to: string;
  title: string;
  message: string;
  link: string | null;
  html?: string | null;
}): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.SECURITY_EMAIL_FROM ?? "كلام له لازمة <onboarding@resend.dev>",
        to: [input.to],
        subject: input.title,
        html: input.html ?? notificationEmailHtml(input.title, input.message, input.link),
      }),
    });
    if (res.ok) {
      try {
        const { bumpApiUsage } = await import("@/lib/api-usage");
        void bumpApiUsage("RESEND_EMAIL");
      } catch {
        /* عداد رقابي اختياري */
      }
    }
    return res.ok;
  } catch {
    return false;
  }
}

/** معرف حساب صاحب المنصة السيادي — مستلم أحداث السيادة الإدارية */
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

/**
 * دالة الإرسال الموحدة — المعاملة المتزامنة الكاملة:
 * سجل موحد + بث ويب + بريد + رنين إداري اختياري، وكلها معزولة عن بعضها.
 */
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

  /* احترام مركز تفضيلات القارئ — الأمان والسيادة فوق التفضيلات دائمًا */
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

  /* 2) بث الويب الفوري — البادج يحدده Service Worker لكل نطاق */
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

  /* 3) البريد المعاملاتي عبر Resend */
  if (wantEmail && (input.forceEmail || !suppressImpact) && prefs.email) {
    result.emailSent = await sendEmail({
      to: prefs.email,
      title: input.title,
      message: input.message,
      link,
      html: input.emailHtml,
    });
  }

  /* 4) رنين هواتف الإدارة (بادج اللوحة) لأحداث السيادة */
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

  /* توثيق موحد في نشاط حي — زينة رقابية لا تعطل أبدًا */
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

/**
 * البث الجماهيري الموحد — لكل القراء غير المحظورين أو قائمة مستهدفين.
 * fan-out فعّال بـ createMany واحتواء تفضيلات بث المقالات لكل مستخدم.
 */
export async function dispatchBroadcast(input: {
  type: NotificationType;
  title: string;
  message: string;
  link?: string | null;
  userIds?: string[]; // فارغة = كل غير المحظورين
  channels?: DispatchChannels; // الافتراضي IN_APP + WEB_PUSH (البث لا يراسل بريدًا افتراضيًا)
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

/**
 * حدث سيادة إدارية — يستلمه حساب المالك جرسًا داخليًا في لوحة الأدمن
 * + رنين فوري لهواتف الإدارة (بادج اللوحة) + بريد طوارئ اختياري.
 */
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
  /* رنين هواتف الإدارة حتى لو غاب حساب المالك من جدول القراء */
  try {
    await pushAdmins({
      title: input.title.slice(0, 120),
      body: input.message.slice(0, 160),
      url: input.link ?? "/",
      tag: input.pushTag ?? `admin-${input.type.toLowerCase()}`,
    });
  } catch {
    /* صامت */
  }
}
