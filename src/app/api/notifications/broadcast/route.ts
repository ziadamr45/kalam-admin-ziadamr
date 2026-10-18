import { NextResponse } from "next/server";
import { isRejected, requireSession, writeAudit, getClientIp } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { pushUsers, type PushPayload } from "@/lib/push";

/**
 * محرك البث الجماهيري — قلب «مركز الإشعارات الجماهيرية» (المحور الرابع).
 *
 * إشعار عام لكل المستخدمين (Broadcast to All Users) لإعلان مقال استثنائي
 * أو تنبيه عام أو تحديث جديد، أو إشعار مخصص لمستخدم بعينه
 * (Targeted User Notification) بالبحث باسمه أو بريده.
 *
 * قناتا الإرسال بضغطة زر:
 * - إشعار ويب فوري (Push Notification) عبر UserPushSubscription.
 * - إشعار داخلي (In-App Bell) عبر جدول UserNotification.
 *
 * مع توثيق اختياري في سجل تحديثات المنصة (PlatformUpdate) —
 * والمستخدمون المسجلون بعد لحظة البث لا يستلمون إشعاراته (دورة الحياة
 * مربوطة بتاريخ تسجيلهم تلقائيًا لأن البث يُنشئ الإشعارات لحظيًا).
 */

export const maxDuration = 60;

const KINDS = ["FEATURE", "MAINTENANCE", "INTELLECTUAL", "ALERT"] as const;
type Kind = (typeof KINDS)[number];

const KIND_LABELS: Record<string, string> = {
  FEATURE: "ميزة جديدة",
  MAINTENANCE: "صيانة",
  INTELLECTUAL: "ترقية فكرية",
  ALERT: "تنبيه عام",
};

/* GET: آخر تحديثات المنصة الموثقة + إحصاء سريع للاشتراكات */
export async function GET(request: Request) {
  const ctx = await requireSession(request);
  if (isRejected(ctx)) return ctx;

  const [updates, users, pushSubs] = await Promise.all([
    prisma.platformUpdate.findMany({ orderBy: { createdAt: "desc" }, take: 12 }),
    prisma.user.count(),
    prisma.userPushSubscription.count(),
  ]);

  return NextResponse.json({ updates, users, pushSubs, kindLabels: KIND_LABELS });
}

export async function POST(request: Request) {
  const ctx = await requireSession(request);
  if (isRejected(ctx)) return ctx;

  try {
    const body = (await request.json().catch(() => null)) as {
      title?: string;
      details?: string;
      url?: string;
      kind?: Kind;
      asPlatformUpdate?: boolean;
      channels?: { push?: boolean; inApp?: boolean };
      target?: { type?: "all" | "user"; userId?: string };
    } | null;

    const title = body?.title?.trim() ?? "";
    const details = body?.details?.trim() ?? "";
    const url = body?.url?.trim() || null;
    const kind: Kind = KINDS.includes(body?.kind as Kind) ? (body!.kind as Kind) : "FEATURE";
    const channels = {
      push: body?.channels?.push !== false,
      inApp: body?.channels?.inApp !== false,
    };
    const targetType = body?.target?.type === "user" ? "user" : "all";
    const targetUserId = body?.target?.userId?.trim() || null;

    if (title.length < 3 || details.length < 3) {
      return NextResponse.json(
        { error: "العنوان والتفاصيل حقلان إلزاميان (3 أحرف على الأقل لكل منهما)" },
        { status: 400 },
      );
    }
    if (!channels.push && !channels.inApp) {
      return NextResponse.json(
        { error: "اختر قناة إرسال واحدة على الأقل: إشعار ويب فوري أو جرس الإشعارات" },
        { status: 400 },
      );
    }
    if (targetType === "user" && !targetUserId) {
      return NextResponse.json({ error: "اختر المستخدم المستهدف أولًا" }, { status: 400 });
    }

    /* التحقق من المستخدم المستهدف إن كان الإشعار مخصصًا */
    if (targetType === "user") {
      const exists = await prisma.user.findUnique({
        where: { id: targetUserId! },
        select: { id: true },
      });
      if (!exists) {
        return NextResponse.json({ error: "المستخدم المستهدف غير موجود" }, { status: 404 });
      }
    }

    /* 1) التوثيق في سجل تحديثات المنصة إن طُلب */
    let updateId: string | null = null;
    if (body?.asPlatformUpdate) {
      const update = await prisma.platformUpdate.create({
        data: { title: title.slice(0, 200), details: details.slice(0, 5000), kind },
      });
      updateId = update.id;
    }

    /* 2) المفهرسون المستهدفون — الجميع (غير المحظورين) أو مستخدم بعينه */
    const targetIds =
      targetType === "user"
        ? [targetUserId!]
        : (await prisma.user.findMany({ where: { banned: false }, select: { id: true } })).map(
            (u) => u.id,
          );

    const notificationKind =
      targetType === "user" ? "TARGETED" : body?.asPlatformUpdate ? "UPDATE" : "BROADCAST";

    /* 3) الإشعار الداخلي — جرس المستخدم (fan-out) */
    let inAppSent = 0;
    if (channels.inApp && targetIds.length > 0) {
      await prisma.userNotification.createMany({
        data: targetIds.map((userId) => ({
          userId,
          title: title.slice(0, 200),
          body: details.slice(0, 2000),
          url,
          kind: notificationKind,
          updateId,
        })),
      });
      inAppSent = targetIds.length;
    }

    /* 4) إشعار الويب الفوري — عبر الاشتراكات المسجلة */
    let pushSent = 0;
    if (channels.push) {
      const payload: PushPayload = {
        title: `${title.slice(0, 120)}`,
        body: details.slice(0, 180),
        url: url ?? "/",
        tag: `platform-${kind.toLowerCase()}`,
      };
      pushSent = await pushUsers(payload, { userIds: targetIds });
    }

    await writeAudit({
      adminId: ctx.adminId,
      action: "notifications.broadcast",
      entity: updateId ? "PlatformUpdate" : "UserNotification",
      entityId: updateId,
      meta: {
        title: title.slice(0, 100),
        kind,
        target: targetType,
        recipients: targetIds.length,
        inApp: inAppSent,
        push: pushSent,
        asPlatformUpdate: Boolean(body?.asPlatformUpdate),
      },
      ip: ctx.ip || getClientIp(request),
    });

    return NextResponse.json({
      ok: true,
      recipients: targetIds.length,
      inApp: inAppSent,
      push: pushSent,
      updateId,
    });
  } catch {
    return NextResponse.json({ error: "فشل إرسال الإشعار" }, { status: 500 });
  }
}
