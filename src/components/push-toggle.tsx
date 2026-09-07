"use client";

import { useCallback, useEffect, useState } from "react";
import { pushSupported, subscribeToPush, resyncExistingSubscription } from "@/lib/push-client";

/**
 * تفعيل إشعارات المنصة الفورية — في الشريط العلوي للوحة التحكم.
 * عند الموافقة ينشئ المتصفح كائن الاشتراك (PushSubscription) ويحفظه
 * في جدول AdminPushSubscription عبر واجهة محمية بالجلسة السيادية،
 * ليصلك الإشعار الفوري على هاتفك (أندرويد / iOS كـ PWA) وحاسوبك
 * دون الحاجة لإبقاء اللوحة مفتوحة.
 */

type State = "checking" | "unsupported" | "denied" | "off" | "on" | "enabling" | "failed";

export function PushToggle() {
  const [state, setState] = useState<State>("checking");

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      if (!pushSupported()) {
        if (!cancelled) setState("unsupported");
        return;
      }
      try {
        if (Notification.permission === "denied") {
          if (!cancelled) setState("denied");
          return;
        }
        if (Notification.permission !== "granted") {
          if (!cancelled) setState("off");
          return;
        }
        /* الإذن ممنوح: مزامنة صامتة — تجديد الاشتراك أو جهاز جديد */
        const reg = await navigator.serviceWorker.register("/sw.js");
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await resyncExistingSubscription();
          if (!cancelled) setState("on");
        } else {
          if (!cancelled) setState("off");
        }
      } catch {
        if (!cancelled) setState("off");
      }
    };
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async () => {
    setState("enabling");
    const result = await subscribeToPush();
    if (result.ok) setState("on");
    else if (result.reason === "denied") setState("denied");
    else if (result.reason === "unsupported") setState("unsupported");
    else setState("failed");
  }, []);

  if (state === "checking" || state === "unsupported") {
    return null; /* لا شيء يُعرض قبل التهيئة أو في المتصفحات غير الداعمة */
  }

  if (state === "on") {
    return (
      <span
        className="flex items-center gap-2 rounded-xl border border-success-400/30 bg-success-400/10 px-3 py-1.5 text-xs font-bold text-success-600"
        title="إشعارات المنصة الفورية مفعّلة على هذا الجهاز — ستصلك فورًا حتى مع إغلاق اللوحة"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        الإشعارات الفورية مفعّلة
      </span>
    );
  }

  if (state === "denied") {
    return (
      <span
        className="flex items-center gap-2 rounded-xl border border-danger-400/30 bg-danger-400/10 px-3 py-1.5 text-xs font-bold text-danger-600"
        title="فعّل الإشعارات من إعدادات الموقع في المتصفح لتصلك التنبيهات على هاتفك"
      >
        الإشعارات محجوبة من المتصفح
      </span>
    );
  }

  return (
    <button
      onClick={enable}
      disabled={state === "enabling"}
      className="flex items-center gap-2 rounded-xl bg-copper-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-copper-500 active:scale-[0.97] disabled:opacity-60"
      title="فعّل الإشعارات الفورية لتصلك التنبيهات على هاتفك وحاسوبك فور حدوث أي نشاط"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {state === "enabling" ? "جارٍ التفعيل.." : "تفعيل إشعارات المنصة الفورية"}
    </button>
  );
}
