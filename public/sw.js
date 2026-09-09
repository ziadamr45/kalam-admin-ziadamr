/* ============================================================
   Service Worker لوحة التحكم السيادية — إشعارات الويب الفورية حصرًا
   بلا كاش إطلاقًا: لوحة التحكم يجب أن تبقى حية دائمًا.
   الأيقونة الملونة الخاصة بالأدمن داخل متن الإشعار، والبادج الإداري
   المستقل المفرّغ ألفا-فقط (درع + ترس، أبيض صافٍ على شفاف) لشريط
   حالة أندرويد — تمييز فوري عن إشعارات المنصة العامة.
   ============================================================ */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

const PUSH_ICON = "/icons/icon-192.png";
const PUSH_BADGE = "/badge-admin-96x96.png";

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "لوحة التحكم", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "كلام له لازمة";
  const options = {
    body: data.body || "",
    icon: data.icon || PUSH_ICON,
    badge: data.badge || PUSH_BADGE,
    tag: data.tag || "kalam-admin-notification",
    renotify: true,
    dir: "rtl",
    lang: "ar",
    vibrate: [100, 50, 100],
    data: { url: data.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = new URL(
    event.notification.data?.url || "/",
    self.location.origin,
  ).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        /* نافذة اللوحة مفتوحة على الهدف → تركيز فوري */
        for (const client of clientList) {
          if (client.url === target && "focus" in client) return client.focus();
        }
        /* نافذة اللوحة مفتوحة → تركيزها والتوجيه للحدث */
        for (const client of clientList) {
          if (
            new URL(client.url).origin === self.location.origin &&
            "focus" in client
          ) {
            client.focus();
            if ("navigate" in client) {
              return Promise.resolve(client.navigate(target)).catch(() =>
                self.clients.openWindow(target),
              );
            }
            return client.postMessage({ type: "NAVIGATE", url: target });
          }
        }
        /* لا نافذة مفتوحة → فتح صفحة الحدث مباشرة */
        return self.clients.openWindow(target);
      }),
  );
});
