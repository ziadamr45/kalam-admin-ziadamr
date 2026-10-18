"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui";

/**
 * مركز الإشعارات الجماهيرية — لوحة تحكم الأدمن السيادية (المحور الرابع):
 * - إشعار عام لكافة المستخدمين (Broadcast to All Users).
 * - إشعار مخصص لمستخدم بعينه بالبحث باسمه أو بريده الإلكتروني.
 * - تحديد قناة الإرسال بضغطة زر: إشعار ويب فوري + جرس الإشعارات الداخلي.
 * - توثيق اختياري في سجل تحديثات المنصة (PlatformUpdate).
 */

type UserHit = { id: string; name: string | null; email: string | null; image: string | null; banned: boolean };

type PlatformUpdate = {
  id: string;
  title: string;
  details: string;
  kind: string;
  createdAt: string;
};

const KIND_OPTIONS = [
  { value: "FEATURE", label: "ميزة جديدة" },
  { value: "MAINTENANCE", label: "صيانة" },
  { value: "INTELLECTUAL", label: "ترقية فكرية" },
  { value: "ALERT", label: "تنبيه عام" },
];

const KIND_STYLES: Record<string, string> = {
  FEATURE: "bg-success-400/10 text-success-600 border-success-400/30",
  MAINTENANCE: "bg-steel-400/10 text-steel-600 border-steel-400/30",
  INTELLECTUAL: "bg-copper-500/10 text-copper-600 border-copper-500/30",
  ALERT: "bg-danger-400/10 text-danger-600 border-danger-400/30",
};

const KIND_LABELS: Record<string, string> = {
  FEATURE: "ميزة جديدة",
  MAINTENANCE: "صيانة",
  INTELLECTUAL: "ترقية فكرية",
  ALERT: "تنبيه عام",
};

const inputCls =
  "w-full rounded-xl border border-steel-200 bg-white px-4 py-2.5 text-sm text-steel-900 outline-none transition-colors focus:border-copper-500";

export function BroadcastConsole() {
  const { toast } = useToast();

  /* الإحصاءات والسجل */
  const [users, setUsers] = useState(0);
  const [pushSubs, setPushSubs] = useState(0);
  const [updates, setUpdates] = useState<PlatformUpdate[]>([]);

  /* نموذج الإرسال */
  const [target, setTarget] = useState<"all" | "user">("all");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<UserHit[]>([]);
  const [selected, setSelected] = useState<UserHit | null>(null);
  const [searching, setSearching] = useState(false);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState("FEATURE");
  const [asUpdate, setAsUpdate] = useState(true);
  const [chPush, setChPush] = useState(true);
  const [chInApp, setChInApp] = useState(true);
  const [sending, setSending] = useState(false);

  const loadOverview = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/broadcast", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setUsers(data.users ?? 0);
      setPushSubs(data.pushSubs ?? 0);
      setUpdates(data.updates ?? []);
    } catch {}
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  /* البحث عن المستخدمين — مؤجّل 350ms */
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (target !== "user") return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (query.trim().length < 2) {
      setHits([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/notifications/users?q=${encodeURIComponent(query.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setHits(data.items ?? []);
        }
      } catch {} finally {
        setSearching(false);
      }
    }, 350);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [query, target]);

  const send = async () => {
    if (sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/notifications/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          details,
          url,
          kind,
          asPlatformUpdate: asUpdate,
          channels: { push: chPush, inApp: chInApp },
          target: { type: target, userId: selected?.id },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data?.error ?? "فشل إرسال الإشعار", "error");
        return;
      }
      const parts: string[] = [`وصل إلى ${data.recipients} مستخدم`];
      if (chInApp) parts.push(`جرس: ${data.inApp}`);
      if (chPush) parts.push(`إشعارات فورية: ${data.push}`);
      toast(`تم الإرسال — ${parts.join(" | ")}`, "success");
      setTitle("");
      setDetails("");
      setUrl("");
      setSelected(null);
      setQuery("");
      loadOverview();
    } catch {
      toast("انقطع الاتصال — جرّب مرة أخرى", "error");
    } finally {
      setSending(false);
    }
  };

  const channelReady = chPush || chInApp;
  const targetReady = target === "all" || Boolean(selected);
  const formReady = title.trim().length >= 3 && details.trim().length >= 3 && channelReady && targetReady;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* الترويسة */}
      <header>
        <h1 className="text-2xl font-bold text-steel-900">مركز الإشعارات الجماهيرية</h1>
        <p className="mt-1 text-sm text-steel-500">
          بث فوري لكل المستخدمين أو لمستخدم بعينه — إشعار ويب يصل لهاتفه وقفل شاشته،
          وإشعار داخلي في جرس المنصة. التحديثات الموثقة تبقى في السجل الزمني.
        </p>
      </header>

      {/* الإحصاءات */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-steel-200 bg-white p-4">
          <p className="text-xs font-bold text-steel-500">المستخدمون المسجلون</p>
          <p className="mt-1 text-2xl font-bold text-steel-900">{users}</p>
        </div>
        <div className="rounded-2xl border border-steel-200 bg-white p-4">
          <p className="text-xs font-bold text-steel-500">اشتراكات الإشعارات الفورية</p>
          <p className="mt-1 text-2xl font-bold text-steel-900">{pushSubs}</p>
        </div>
        <div className="rounded-2xl border border-steel-200 bg-white p-4">
          <p className="text-xs font-bold text-steel-500">تحديثات موثقة في السجل</p>
          <p className="mt-1 text-2xl font-bold text-steel-900">{updates.length}</p>
        </div>
      </div>

      {/* نموذج الإرسال */}
      <section className="rounded-3xl border border-steel-200 bg-white p-5 sm:p-7">
        <h2 className="text-base font-bold text-steel-900">إرسال إشعار جديد</h2>

        {/* المستهدف */}
        <div className="mt-5">
          <p className="mb-2 text-xs font-bold text-steel-600">المستهدف</p>
          <div className="inline-flex rounded-xl border border-steel-200 bg-steel-50 p-1">
            <button
              onClick={() => {
                setTarget("all");
                setSelected(null);
              }}
              className={`rounded-lg px-4 py-2 text-xs font-bold transition-all ${
                target === "all" ? "bg-steel-900 text-white shadow-sm" : "text-steel-600 hover:text-steel-900"
              }`}
            >
              جميع المستخدمين
            </button>
            <button
              onClick={() => setTarget("user")}
              className={`rounded-lg px-4 py-2 text-xs font-bold transition-all ${
                target === "user" ? "bg-steel-900 text-white shadow-sm" : "text-steel-600 hover:text-steel-900"
              }`}
            >
              مستخدم بعينه
            </button>
          </div>

          {target === "user" && (
            <div className="mt-3">
              {selected ? (
                <div className="flex items-center justify-between rounded-xl border border-copper-500/40 bg-copper-500/5 px-4 py-3">
                  <div className="flex items-center gap-3">
                    {selected.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={selected.image} alt="" className="h-9 w-9 rounded-full" referrerPolicy="no-referrer" />
                    ) : (
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-steel-200 text-sm font-bold text-steel-600">
                        {(selected.name ?? "?").charAt(0)}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-steel-900">{selected.name ?? "بدون اسم"}</p>
                      <p className="truncate text-xs text-steel-500" dir="ltr">
                        {selected.email ?? "—"}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelected(null)}
                    className="rounded-lg px-3 py-1.5 text-xs font-bold text-danger-600 hover:bg-danger-400/10"
                  >
                    تغيير
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className={inputCls}
                    placeholder="ابحث بالاسم أو البريد الإلكتروني.."
                  />
                  {searching && (
                    <p className="absolute left-4 top-3 text-xs text-steel-400">جارٍ البحث..</p>
                  )}
                  {hits.length > 0 && (
                    <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-60 overflow-y-auto rounded-xl border border-steel-200 bg-white shadow-lift">
                      {hits.map((u) => (
                        <li key={u.id}>
                          <button
                            onClick={() => {
                              setSelected(u);
                              setHits([]);
                              setQuery("");
                            }}
                            className="flex w-full items-center gap-3 px-4 py-2.5 text-right transition-colors hover:bg-steel-50"
                          >
                            {u.image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={u.image} alt="" className="h-8 w-8 rounded-full" referrerPolicy="no-referrer" />
                            ) : (
                              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-steel-200 text-xs font-bold text-steel-600">
                                {(u.name ?? "?").charAt(0)}
                              </span>
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-bold text-steel-900">
                                {u.name ?? "بدون اسم"} {u.banned && <span className="text-xs font-bold text-danger-600">(محظور)</span>}
                              </span>
                              <span className="block truncate text-xs text-steel-500" dir="ltr">
                                {u.email ?? "—"}
                              </span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* الحقول */}
        <div className="mt-5 grid gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-steel-700">عنوان الإشعار *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              className={inputCls}
              placeholder="مثال: مقال جديد يهتمك — أو مبروك التحديث الجديد"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold text-steel-700">التفاصيل *</label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={4}
              maxLength={2000}
              className={`${inputCls} resize-none`}
              placeholder="ما الذي تريد إبلاغه به المستخدمين تحديدًا؟"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-bold text-steel-700">الرابط عند النقر (اختياري)</label>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                maxLength={300}
                dir="ltr"
                className={inputCls}
                placeholder="/article/slug-here"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-steel-700">نوع التحديث</label>
              <select value={kind} onChange={(e) => setKind(e.target.value)} className={inputCls}>
                {KIND_OPTIONS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* القنوات والتوثيق */}
        <div className="mt-5 space-y-2.5 rounded-2xl border border-steel-200 bg-steel-50 p-4">
          <p className="text-xs font-bold text-steel-600">قنوات الإرسال</p>
          <label className="flex cursor-pointer items-center gap-3">
            <input type="checkbox" checked={chPush} onChange={(e) => setChPush(e.target.checked)} className="h-4 w-4 accent-copper-600" />
            <span className="text-sm font-semibold text-steel-800">
              إشعار ويب فوري (Push) — يصل للهاتف وقفل الشاشة حتى مع إغلاق المنصة
            </span>
          </label>
          <label className="flex cursor-pointer items-center gap-3">
            <input type="checkbox" checked={chInApp} onChange={(e) => setChInApp(e.target.checked)} className="h-4 w-4 accent-copper-600" />
            <span className="text-sm font-semibold text-steel-800">
              إشعار داخلي (In-App Bell) — يظهر في جرس الإشعارات داخل المنصة
            </span>
          </label>
          <label className="flex cursor-pointer items-center gap-3 border-t border-steel-200 pt-2.5">
            <input type="checkbox" checked={asUpdate} onChange={(e) => setAsUpdate(e.target.checked)} className="h-4 w-4 accent-copper-600" />
            <span className="text-sm font-semibold text-steel-800">
              توثيق في سجل تحديثات المنصة (PlatformUpdate) — بالتاريخ واليوم وما تم إنجازه
            </span>
          </label>
        </div>

        <button
          onClick={send}
          disabled={!formReady || sending}
          className="mt-5 w-full rounded-2xl bg-copper-600 px-6 py-3.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-copper-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? "جارٍ البث.." : "إرسال الإشعار الآن"}
        </button>
      </section>

      {/* سجل التحديثات */}
      <section className="rounded-3xl border border-steel-200 bg-white p-5 sm:p-7">
        <h2 className="text-base font-bold text-steel-900">سجل تحديثات المنصة الموثقة</h2>
        {updates.length === 0 ? (
          <p className="mt-4 text-sm leading-7 text-steel-500">
            لا تحديثات موثقة بعد — كل تحديث تفعّله خيار «توثيق في سجل تحديثات المنصة»
            سيظهر هنا بتاريخه ونوعه ليكون مرجعًا زمنيًا دائمًا.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {updates.map((u) => (
              <li key={u.id} className="rounded-2xl border border-steel-100 bg-steel-50/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold ${KIND_STYLES[u.kind] ?? KIND_STYLES.MAINTENANCE}`}>
                    {KIND_LABELS[u.kind] ?? u.kind}
                  </span>
                  <time className="text-xs text-steel-500" dateTime={u.createdAt}>
                    {new Intl.DateTimeFormat("ar-EG", { dateStyle: "long", timeStyle: "short" }).format(new Date(u.createdAt))}
                  </time>
                </div>
                <p className="mt-2 text-sm font-bold text-steel-900">{u.title}</p>
                <p className="mt-1 whitespace-pre-wrap text-xs leading-6 text-steel-600">{u.details}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
