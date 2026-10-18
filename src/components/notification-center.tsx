"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * مركز الإشعارات السيادية في لوحة الأدمن:
 * - جرس بالشريط العلوي بعداد أحداث السيادة غير المقروءة (SSE لحظي).
 * - شريط طوارئ علوي برتقالي/أحمر يبرز أحدث تنبيه إداري غير مقروء.
 * - قائمة منسدلة بثلاث تبويبات: إدارية | الكل | غير المقروءة،
 *   مع تعليم الكل كمقروء وأيقونات ملونة بطبيعة الحدث.
 */

type AdminNotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
  metadata?: { device?: string; location?: string; ip?: string | null; when?: string } | null;
};

type UrgentItem = { id: string; type: string; title: string; message: string; link: string | null } | null;

const ADMIN_TYPES = new Set([
  "ADMIN_NEW_USER",
  "ADMIN_NEW_COMMENT",
  "ADMIN_NEW_PROPOSAL",
  "ADMIN_COMMENT_REPORTED",
  "ADMIN_SYSTEM_ALERT",
]);

const rtf = new Intl.RelativeTimeFormat("ar", { numeric: "auto" });

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return rtf.format(-mins, "minute");
  const hours = Math.floor(mins / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  return rtf.format(-Math.floor(hours / 24), "day");
}

function typeColor(type: string): string {
  if (type === "ADMIN_SYSTEM_ALERT") return "#DC2626";
  if (type === "ADMIN_COMMENT_REPORTED") return "#EA580C";
  if (type === "ADMIN_NEW_PROPOSAL") return "#7C3AED";
  if (type === "ADMIN_NEW_USER") return "#0D9488";
  if (type === "ADMIN_NEW_COMMENT") return "#2563EB";
  if (type === "SECURITY_NEW_LOGIN") return "#DC2626";
  return "#64748B";
}

function useAdminNotifications() {
  const [items, setItems] = useState<AdminNotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [unreadAdmin, setUnreadAdmin] = useState(0);
  const [urgent, setUrgent] = useState<UrgentItem>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch("/api/admin/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        items: AdminNotificationItem[];
        unread: number;
        unreadAdmin: number;
        urgent: UrgentItem;
      };
      setItems(data.items ?? []);
      setUnread(data.unread ?? 0);
      setUnreadAdmin(data.unreadAdmin ?? 0);
      setUrgent(data.urgent ?? null);
    } catch {
      /* الشبكة متقطعة — الدورة التالية تعيد المحاولة */
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 90_000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);

    let es: EventSource | null = null;
    let reconnect: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;
    const connect = (): void => {
      if (disposed) return;
      try {
        es = new EventSource("/api/admin/notifications/stream");
        es.onmessage = (ev: MessageEvent<string>) => {
          try {
            const data = JSON.parse(ev.data) as {
              unreadAdmin?: number;
              isNewItem?: boolean;
              heartbeat?: boolean;
            };
            if (typeof data.unreadAdmin === "number") setUnreadAdmin(data.unreadAdmin);
            if (data.isNewItem) load();
          } catch {
            /* نبض تالف */
          }
        };
        es.onerror = () => {
          es?.close();
          es = null;
          if (!disposed) reconnect = setTimeout(connect, 5_000);
        };
      } catch {
        /* SSE غير مدعوم */
      }
    };
    connect();

    return () => {
      disposed = true;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      es?.close();
      if (reconnect) clearTimeout(reconnect);
    };
  }, [load]);

  const markAll = useCallback(
    async (adminOnly = false): Promise<void> => {
      setItems((prev) => prev.map((n) => (n.isRead || !adminOnly || ADMIN_TYPES.has(n.type) ? { ...n, isRead: true } : n)));
      setUnread(0);
      setUnreadAdmin(0);
      setUrgent(null);
      await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true, adminOnly }),
      }).catch(() => {});
    },
    [],
  );

  const markOne = useCallback(async (id: string): Promise<void> => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    setUrgent((u) => (u?.id === id ? null : u));
    setUnreadAdmin((v) => Math.max(0, v - 1));
    await fetch("/api/admin/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  }, []);

  /** الإخفاء النهائي — حذف تفاؤلي من القائمة + dismissedAt في قاعدة البيانات */
  const dismiss = useCallback(async (item: AdminNotificationItem): Promise<void> => {
    setItems((prev) => prev.filter((n) => n.id !== item.id));
    setUrgent((u) => (u?.id === item.id ? null : u));
    if (!item.isRead) {
      setUnread((v) => Math.max(0, v - 1));
      if (item.type.startsWith("ADMIN_")) setUnreadAdmin((v) => Math.max(0, v - 1));
    }
    await fetch("/api/admin/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, action: "dismiss" }),
    }).catch(() => {});
  }, []);

  const [detail, setDetail] = useState<AdminNotificationItem | null>(null);
  const openDetail = useCallback(
    (item: AdminNotificationItem): void => {
      setDetail(item);
      if (!item.isRead) void markOne(item.id);
    },
    [markOne],
  );

  return { items, unread, unreadAdmin, urgent, detail, load, markAll, markOne, dismiss, openDetail, closeDetail: () => setDetail(null) };
}

/* ===================== نافذة تفاصيل الإشعار — النص الكامل بلا اقتطاع ===================== */

const exactFmt = new Intl.DateTimeFormat("ar-EG", {
  dateStyle: "full",
  timeStyle: "short",
  timeZone: "Africa/Cairo",
});

function AdminNotificationDetailModal({
  item,
  onClose,
  onDismiss,
}: {
  item: AdminNotificationItem;
  onClose: () => void;
  onDismiss?: (item: AdminNotificationItem) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const color = typeColor(item.type);
  const meta = item.metadata ?? null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/45 p-4 backdrop-blur-[2px] sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={item.title}
    >
      <div
        className="w-full max-w-md animate-fade-in overflow-hidden rounded-2xl border border-steel-200 bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-steel-100 px-4 py-3">
          <span className="flex items-center gap-2">
            <span className="mt-0 h-2.5 w-2.5 rounded-full" style={{ background: color }} />
            <span
              className="rounded-full px-2.5 py-0.5 text-[10px] font-bold"
              style={{ background: `${color}18`, color }}
            >
              {item.type.startsWith("ADMIN_") ? "حدث سيادة إداري" : "إشعار"}
            </span>
            {!item.isRead && (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-700">جديد</span>
            )}
          </span>
          <button
            onClick={onClose}
            aria-label="إغلاق التفاصيل"
            className="rounded-full p-1.5 text-lg leading-none text-steel-400 transition-colors hover:bg-steel-100"
          >
            ✕
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto overscroll-contain px-4 py-4">
          <h3 className="text-base font-extrabold leading-8 text-steel-900">{item.title}</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-8 text-steel-600">{item.message}</p>

          {meta && (meta.device || meta.location || meta.ip || meta.when) && (
            <div className="mt-4 space-y-1.5 rounded-xl bg-steel-50 p-3 text-[11px] leading-6 text-steel-500">
              {meta.device && (
                <div>
                  <b className="text-steel-800">الجهاز:</b> {meta.device}
                </div>
              )}
              {meta.location && (
                <div>
                  <b className="text-steel-800">الموقع التقريبي:</b> {meta.location}
                </div>
              )}
              {meta.ip && (
                <div>
                  <b className="text-steel-800">عنوان الشبكة:</b> {meta.ip}
                </div>
              )}
              {meta.when && (
                <div>
                  <b className="text-steel-800">وقت الحدث:</b> {meta.when}
                </div>
              )}
            </div>
          )}

          <div className="mt-4 text-[11px] text-steel-400">{exactFmt.format(new Date(item.createdAt))}</div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-steel-100 px-4 py-3">
          {item.link ? (
            <Link
              href={item.link}
              onClick={onClose}
              className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white transition-transform active:scale-[0.98]"
            >
              الانتقال إلى الحدث
            </Link>
          ) : (
            <span />
          )}
          {onDismiss && (
            <button
              onClick={() => {
                onDismiss(item);
                onClose();
              }}
              className="text-xs font-bold text-steel-400 underline underline-offset-4 transition-opacity hover:opacity-70"
            >
              إخفاء هذا الإشعار نهائيًا
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ===================== شريط الطوارئ العلوي ===================== */

export function AdminUrgentBar() {
  const { urgent, markOne } = useAdminNotifications();
  if (!urgent) return null;
  const isAlert = urgent.type === "ADMIN_SYSTEM_ALERT";
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-xs font-bold lg:px-8"
      style={{
        background: isAlert ? "rgba(220,38,38,0.10)" : "rgba(234,88,12,0.10)",
        borderColor: isAlert ? "rgba(220,38,38,0.35)" : "rgba(234,88,12,0.35)",
        color: isAlert ? "#DC2626" : "#EA580C",
      }}
      role="alert"
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="inline-block h-2 w-2 shrink-0 animate-pulse rounded-full" style={{ background: isAlert ? "#DC2626" : "#EA580C" }} />
        <span className="truncate">
          {urgent.title} — {urgent.message.slice(0, 90)}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <Link href={urgent.link ?? "/system?tab=errors"} className="underline underline-offset-4 hover:opacity-80">
          فتح
        </Link>
        <button onClick={() => markOne(urgent.id)} className="underline underline-offset-4 hover:opacity-80">
          تمت المعالجة
        </button>
      </span>
    </div>
  );
}

/* ===================== جرس لوحة الأدمن ===================== */

function BellGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

export function AdminNotificationBell() {
  const { items, unread, unreadAdmin, markAll, dismiss, openDetail, detail, closeDetail } = useAdminNotifications();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"admin" | "all" | "unread">("admin");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const shown =
    tab === "admin"
      ? items.filter((n) => ADMIN_TYPES.has(n.type))
      : tab === "unread"
        ? items.filter((n) => !n.isRead)
        : items;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="مركز الإشعارات السيادية"
        aria-expanded={open}
        title="مركز الإشعارات السيادية"
        className="relative rounded-xl border border-steel-200 p-2 text-steel-500 transition-all hover:border-amber-400/50 hover:text-amber-600"
      >
        <BellGlyph />
        {unreadAdmin > 0 && (
          <span
            className="absolute -top-1 -left-1 flex h-[16px] min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none text-white"
            style={{ background: "#EA580C" }}
          >
            {unreadAdmin > 99 ? "+99" : unreadAdmin}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-96 max-w-[calc(100vw-2rem)] rounded-2xl border border-steel-200 bg-white p-2 shadow-lg">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-sm font-bold text-steel-700">مركز الإشعارات السيادية</span>
            {(unread > 0 || unreadAdmin > 0) && (
              <button
                onClick={() => markAll(false)}
                className="text-[11px] font-bold text-amber-600 transition-opacity hover:opacity-70"
              >
                تعليم الكل كمقروء
              </button>
            )}
          </div>

          <div className="mx-1 mb-1 grid grid-cols-3 gap-1 rounded-xl bg-steel-100 p-1" role="tablist">
            {(
              [
                ["admin", `إدارية (${unreadAdmin})`],
                ["all", `الكل (${items.length})`],
                ["unread", `غير المقروءة (${unread})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={`rounded-lg px-2 py-1.5 text-[11px] font-bold transition-all ${
                  tab === key ? "bg-white text-amber-600 shadow-sm" : "text-steel-500"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="max-h-96 overflow-y-auto overscroll-contain">
            {shown.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs leading-6 text-steel-400">
                لا إشعارات هنا بعد — أحداث السيادة والبث تظهر لحظة وقوعها.
              </p>
            ) : (
              <ul className="space-y-1">
                {shown.map((n) => {
                  const color = typeColor(n.type);
                  return (
                    <li key={n.id} className="relative">
                      <button
                        onClick={() => openDetail(n)}
                        className="block w-full rounded-xl px-3 py-2.5 pl-8 text-right transition-colors hover:bg-steel-100"
                      >
                        <span className="flex items-start gap-2.5">
                          <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                          <span className="min-w-0 flex-1">
                            <span className={`block text-xs leading-5 ${n.isRead ? "font-semibold text-steel-500" : "font-bold text-steel-800"}`}>
                              {n.title}
                            </span>
                            <span className="mt-0.5 block truncate text-[11px] text-steel-400">{n.message}</span>
                            <span className="mt-1 block text-[10px] text-steel-300">{timeAgo(n.createdAt)}</span>
                          </span>
                        </span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void dismiss(n);
                        }}
                        aria-label={`إخفاء إشعار: ${n.title}`}
                        title="إخفاء نهائي"
                        className="absolute left-1.5 top-2 rounded-full p-1.5 text-[11px] leading-none text-steel-300 transition-colors hover:bg-steel-100 hover:text-steel-500"
                      >
                        ✕
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {detail && <AdminNotificationDetailModal item={detail} onClose={closeDetail} onDismiss={dismiss} />}
    </div>
  );
}
