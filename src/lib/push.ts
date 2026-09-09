import "server-only";
import webpush from "web-push";
import { prisma } from "@/lib/prisma";

/**
 * محرك إشعارات الويب الفورية — معيار Web Push القياسي موقّعًا بمفاتيح VAPID.
 * يُستخدم لإبلاغ صاحب المنصة فورًا (تعليق جديد، رسالة تواصل، تنبيه أمني، خطأ بالسيرفر)
 * وللبث الجماهيري للمستخدمين المسجلين.
 *
 * مبدأ صارم: الإشعارات طبقة تزيين — أي عطل فيها لا يعطل أبدًا المسار الأساسي
 * (حفظ التعليق، إرسال الرسالة، تسجيل الخطأ)؛ لذا كل النداءات محمية والفشل صامت.
 */

const VAPID_SUBJECT = "mailto:ziad90216@gmail.com";

let vapidReady = false;

function ensureVapid(): boolean {
  if (vapidReady) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, publicKey, privateKey);
    vapidReady = true;
    return true;
  } catch {
    return false;
  }
}

export type PushPayload = {
  /** عنوان الإشعار — عربي صريح */
  title: string;
  /** ملخص الحدث */
  body: string;
  /** المسار الذي يفتح عند النقر (نسبي للمنصة أو مطلق للوحة التحكم) */
  url?: string;
  /** وسوم التجميع: الإشعارات المتشابهة تستبدل بعضها بدل التراكم */
  tag?: string;
};

type SubscriptionRow = { id: string; endpoint: string; p256dh: string; auth: string };

/** إرسال لاشتراك واحد — يعيد حالته ليُحذف تلقائيًا إن مات */
async function sendOne(sub: SubscriptionRow, payload: PushPayload): Promise<"ok" | "gone" | "failed"> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 24 * 3600 },
    );
    return "ok";
  } catch (err) {
    const status = (err as { statusCode?: number })?.statusCode;
    /* 404/410: الاشتراك منتهٍ أو ملغى — يُنظف من القاعدة */
    if (status === 404 || status === 410) return "gone";
    return "failed";
  }
}

async function dispatch(
  subs: SubscriptionRow[],
  payload: PushPayload,
  remove: (id: string) => Promise<unknown>,
): Promise<number> {
  if (subs.length === 0) return 0;
  const results = await Promise.allSettled(subs.map((s) => sendOne(s, payload)));
  await Promise.allSettled(
    results.map((r, i) =>
      r.status === "fulfilled" && r.value === "gone" ? remove(subs[i].id) : Promise.resolve(null),
    ),
  );
  return results.filter((r) => r.status === "fulfilled" && r.value === "ok").length;
}

/**
 * إشعار فوري لصاحب المنصة — يشمل كل أجهزته المسجلة (هاتف + حاسوب).
 * يُستدعى من المنصة العامة عند: تعليق جديد، رسالة تواصل، خطأ بالسيرفر.
 */
export async function pushAdmins(payload: PushPayload): Promise<void> {
  if (!ensureVapid()) return;
  try {
    const subs = await prisma.adminPushSubscription.findMany({
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
    await dispatch(subs, payload, (id) =>
      prisma.adminPushSubscription.delete({ where: { id } }).catch(() => null),
    );
  } catch {
    /* صامت — الإشعار لا يعطل المسار الأساسي */
  }
}

/**
 * إشعار ويب لمجموعة مستخدمين (أو الجميع) — للبث الجماهيري والإشعارات المخصصة.
 * يعيد عدد الإرسالات الناجحة.
 */
export async function pushUsers(
  payload: PushPayload,
  opts?: { userIds?: string[] },
): Promise<number> {
  if (!ensureVapid()) return 0;
  try {
    const subs = await prisma.userPushSubscription.findMany({
      where: opts?.userIds ? { userId: { in: opts.userIds } } : {},
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
    return await dispatch(subs, payload, (id) =>
      prisma.userPushSubscription.delete({ where: { id } }).catch(() => null),
    );
  } catch {
    return 0;
  }
}
