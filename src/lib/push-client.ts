"use client";

/**
 * أدوات المتصفح للاشتراك في إشعارات الويب الفورية (Web Push).
 * تُستخدم في جرس الإشعارات بالهيدر وبند الإشعارات بدرج الموبايل.
 */

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** تحويل مفتاح VAPID العام من Base64URL إلى Uint8Array كما يتطلب المتصفح */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export type SubscribeResult =
  | { ok: true; endpoint: string }
  | { ok: false; reason: "unsupported" | "denied" | "failed" };

/** طلب الإذن وإنشاء الاشتراك وحفظه في القاعدة مربوطًا بالحساب */
export async function subscribeToPush(): Promise<SubscribeResult> {
  if (!pushSupported()) return { ok: false, reason: "unsupported" };
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "denied" };
  try {
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!key) return { ok: false, reason: "failed" };
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    const sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      }));
    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { ok: false, reason: "failed" };
    }
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
    });
    if (!res.ok) return { ok: false, reason: "failed" };
    return { ok: true, endpoint: json.endpoint };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/** إلغاء الاشتراك من المتصفح ومن القاعدة */
export async function unsubscribeFromPush(): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) {
      await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      }).catch(() => {});
      await sub.unsubscribe();
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * مزامنة صامتة لاشتراك قائم — تُستدعى عند فتح الموقع:
 * تُحدّث الاشتراك في القاعدة إن تجدد أو انتقل الحساب لجهاز جديد،
 * وتنظف الاشتراك الميت من المتصفح إن كان القاعدة قد حذفته.
 */
export async function resyncExistingSubscription(): Promise<void> {
  if (!pushSupported()) return;
  try {
    if (Notification.permission !== "granted") return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (!sub) return;
    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
    }).catch(() => {});
  } catch {
    /* صامت */
  }
}
