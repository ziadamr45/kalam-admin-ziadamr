"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, useToast } from "@/components/ui";

/* ==================== سجل أحداث المنصة ==================== */

type AuditEvent = {
  id: string;
  type: string;
  actorType: string;
  actorLabel: string | null;
  message: string | null;
  ip: string | null;
  createdAt: string;
};

const EVENT_LABEL: Record<string, { text: string; tone: "success" | "warn" | "danger" | "copper" | "neutral" | "steel" }> = {
  AUTH_LOGIN_SUCCESS: { text: "دخول Google", tone: "success" },
  AUTH_LOGIN_BLOCKED: { text: "محاولة محظور", tone: "danger" },
  AUTH_SIGNOUT: { text: "خروج", tone: "neutral" },
  ACCOUNT_SELF_DELETED: { text: "حذف حساب ذاتي", tone: "warn" },
  COMMENT_SUBMITTED: { text: "تعليق جديد", tone: "copper" },
  COMMENT_REJECTED: { text: "تعليق مرفوض", tone: "warn" },
  VOTE: { text: "تصويت", tone: "neutral" },
  SAVE_ARTICLE: { text: "حفظ في مكتبة", tone: "neutral" },
  CONTACT_MESSAGE: { text: "رسالة تواصل", tone: "copper" },
  AVATAR_UPDATED: { text: "تحديث صورة", tone: "steel" },
  PAGE_ERROR: { text: "خطأ صفحة", tone: "danger" },
};

const EVENT_FILTERS = [
  { key: "all", label: "كل الأحداث" },
  { key: "auth", label: "الدخول والخروج" },
  { key: "COMMENT_SUBMITTED", label: "التعليقات" },
  { key: "VOTE", label: "التصويتات" },
  { key: "SAVE_ARTICLE", label: "المحفوظات" },
  { key: "CONTACT_MESSAGE", label: "الرسائل" },
];

function fmtTime(iso: string) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("ar-EG", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function AuditPanel() {
  const { toast } = useToast();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/audit?tab=events&filter=${encodeURIComponent(filter)}`);
      const data = await res.json();
      setEvents(data.events ?? []);
    } catch {}
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  /* مراقبة حية — تحديث كل 15 ثانية */
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [autoRefresh, load]);

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-steel-800">سجل أحداث المنصة الحي</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-colors ${
              autoRefresh ? "border-success-400/40 text-success-600" : "border-steel-200 text-steel-400"
            }`}
          >
            <span className={`me-1 inline-block h-1.5 w-1.5 rounded-full ${autoRefresh ? "bg-success-500" : "bg-steel-300"}`} />
            مراقبة حية {autoRefresh ? "تعمل" : "متوقفة"}
          </button>
          <Button size="sm" variant="ghost" onClick={load}>
            تحديث
          </Button>
        </div>
      </div>

      {/* فلاتر الأحداث */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {EVENT_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition-colors ${
              filter === f.key ? "bg-copper-600 text-white" : "bg-steel-100 text-steel-600 hover:bg-steel-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-steel-400">جارٍ التحميل..</p>
      ) : events.length === 0 ? (
        <p className="py-10 text-center text-sm text-steel-400">لا أحداث مسجلة بعد بهذا الفلتر.</p>
      ) : (
        <ul className="max-h-[520px] space-y-2 overflow-y-auto pe-1">
          {events.map((e) => {
            const label = EVENT_LABEL[e.type] ?? { text: e.type, tone: "neutral" as const };
            return (
              <li key={e.id} className="flex items-start gap-3 rounded-xl border border-steel-100 p-3">
                <Badge tone={label.tone}>{label.text}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-steel-800">
                    {e.message || label.text}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] text-steel-400">
                    {e.actorLabel || "زائر مجهول"} · {fmtTime(e.createdAt)}
                    {e.ip ? ` · ${e.ip}` : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/* ==================== الأخطاء اللحظية ==================== */

type ErrorRow = {
  id: string;
  message: string;
  path: string | null;
  count: number;
  lastSeenAt: string;
  stack: string | null;
};

export function ErrorsPanel() {
  const { toast } = useToast();
  const [errors, setErrors] = useState<ErrorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/audit?tab=errors");
      const data = await res.json();
      setErrors(data.errors ?? []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-bold text-steel-800">
          الأخطاء البرمجية اللحظية{" "}
          {errors.length > 0 && (
            <span className="ms-1 rounded-full bg-danger-400/15 px-2 py-0.5 text-[11px] font-bold text-danger-600">
              {errors.length} عطل
            </span>
          )}
        </h2>
        <Button size="sm" variant="ghost" onClick={load}>
          تحديث
        </Button>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-steel-400">جارٍ التحميل..</p>
      ) : errors.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-2xl">✓</p>
          <p className="mt-2 text-sm font-bold text-success-600">لا أعطال مسجلة — المنصة سليمة</p>
          <p className="mt-1 text-xs text-steel-400">أي خطأ يواجهه أي زائر يظهر هنا لحظة حدوثه.</p>
        </div>
      ) : (
        <ul className="max-h-[520px] space-y-2 overflow-y-auto pe-1">
          {errors.map((e) => (
            <li key={e.id} className="min-w-0 rounded-xl border border-steel-100 p-3">
              <button
                onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                className="w-full text-right"
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <p className="min-w-0 break-words text-xs font-bold text-danger-600">{e.message}</p>
                  <span className="shrink-0 rounded-full bg-danger-400/15 px-2 py-0.5 text-[10px] font-bold text-danger-600">
                    ×{e.count}
                  </span>
                </div>
                <p className="mt-1 text-[10px] text-steel-400" dir="ltr">
                  {e.path || "—"} · {fmtTime(e.lastSeenAt)}
                </p>
              </button>
              {expanded === e.id && e.stack && (
                <pre
                  className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-steel-900 p-3 text-[10px] leading-5 text-steel-200"
                  dir="ltr"
                >
                  {e.stack.slice(0, 2000)}
                </pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
