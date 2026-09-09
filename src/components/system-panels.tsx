"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Card, useToast } from "@/components/ui";
import { deviceLabelAr } from "@/lib/traffic";

/**
 * ============================================================
 * مرصد النظام الحي — شاشات المقاييس والصحة والحركة والأخطاء والحصص
 * ============================================================
 * نبض لحظي باستقصاء دوري: صحة Neon، معدل الحركة، الأخطاء التشغيلية
 * بـ Stack Trace كامل، وحصص الواجهات الخارجية — كل ذلك دون مغادرة اللوحة.
 */

type Tab = "pulse" | "traffic" | "errors" | "quotas";

type DbHealth = {
  ok: boolean;
  latencyMs: number;
  version: string;
  activeConnections: number;
  maxConnections: number;
  sizeBytes: number;
  startedAt: string | null;
};

type TrafficSnapshot = {
  windowMinutes: number;
  total: number;
  errors: number;
  perMinute: number;
  topPaths: { path: string; count: number }[];
  devices: { device: string; count: number }[];
  countries: { country: string; count: number }[];
};

type ProviderQuota = {
  provider: string;
  label: string;
  configured: boolean;
  today: number;
  last7Days: { day: string; count: number }[];
  extra?: Record<string, unknown>;
};

type Telemetry = {
  db: DbHealth;
  traffic: TrafficSnapshot;
  quotas: { geminiChat: ProviderQuota; geminiTts: ProviderQuota; resend: ProviderQuota; cloudinary: ProviderQuota };
  errors: ServerErrorRow[];
  checkedAt: string;
};

type RequestRow = {
  id: string;
  app: string;
  method: string;
  path: string;
  status: number | null;
  durationMs: number | null;
  ip: string | null;
  device: string | null;
  userEmail: string | null;
  country: string | null;
  isError: boolean;
  createdAt: string;
};

type ServerErrorRow = {
  id: string;
  digest: string;
  message: string;
  stack: string | null;
  path: string | null;
  method: string | null;
  routeType: string | null;
  app: string;
  count: number;
  lastSeenAt: string;
};

function fmtBytes(n: number): string {
  if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(2)} GB`;
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  return `${(n / 1024).toFixed(1)} KB`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ar-EG", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/* =================== مؤشر الحالة =================== */

function PulseDot({ ok }: { ok: boolean }) {
  return (
    <span className={`relative inline-flex h-2.5 w-2.5 shrink-0 ${ok ? "" : "opacity-90"}`}>
      {ok && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success-500 opacity-60" />}
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${ok ? "bg-success-500" : "bg-danger-500"}`} />
    </span>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: "neutral" | "ok" | "warn" | "bad";
}) {
  const tones = {
    neutral: "text-steel-800",
    ok: "text-success-600",
    warn: "text-warn-500",
    bad: "text-danger-600",
  };
  return (
    <Card className="p-4">
      <p className="text-xs font-bold text-steel-400">{label}</p>
      <p className={`mt-1 text-2xl font-black tabular-nums ${tones[tone]}`}>{value}</p>
      {sub && <p className="mt-1 text-[11px] text-steel-400">{sub}</p>}
    </Card>
  );
}

/* =================== اللوحة الرئيسية =================== */

export function SystemPanels() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("pulse");
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [errors, setErrors] = useState<ServerErrorRow[]>([]);
  const [seconds, setSeconds] = useState(600);
  const [userIdFilter, setUserIdFilter] = useState("");
  const [errorOnly, setErrorOnly] = useState(false);
  const [openStack, setOpenStack] = useState<string | null>(null);
  const [live, setLive] = useState(true);
  const busy = useRef(false);

  const loadTelemetry = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const res = await fetch("/api/admin/system/telemetry", { cache: "no-store" });
      if (res.ok) setTelemetry(await res.json());
    } catch {} finally {
      busy.current = false;
    }
  }, []);

  const loadTraffic = useCallback(async () => {
    try {
      const params = new URLSearchParams({ seconds: String(seconds), limit: "120" });
      if (userIdFilter.trim()) params.set("userId", userIdFilter.trim());
      if (errorOnly) params.set("errorOnly", "1");
      const res = await fetch(`/api/admin/system/traffic?${params}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setRows(data.rows ?? []);
      }
    } catch {}
  }, [seconds, userIdFilter, errorOnly]);

  const loadErrors = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/system/errors?limit=60", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setErrors(data.rows ?? []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    void loadTelemetry();
    void loadErrors();
  }, [loadTelemetry, loadErrors]);

  useEffect(() => {
    if (tab === "traffic") void loadTraffic();
  }, [tab, loadTraffic]);

  /* الاستقصاء الحي — نبض 15ث، حركة 10ث، أخطاء 25ث */
  useEffect(() => {
    if (!live) return;
    const a = setInterval(() => void loadTelemetry(), 15_000);
    const b = setInterval(() => {
      if (tab === "traffic") void loadTraffic();
      if (tab === "errors") void loadErrors();
    }, 10_000);
    return () => {
      clearInterval(a);
      clearInterval(b);
    };
  }, [live, tab, loadTelemetry, loadTraffic, loadErrors]);

  const db = telemetry?.db;
  const latencyTone = !db ? "neutral" : db.latencyMs < 200 ? "ok" : db.latencyMs < 800 ? "warn" : "bad";

  return (
    <div className="space-y-6">
      {/* الترويسة */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-black text-steel-900">
            <PulseDot ok={(telemetry?.traffic.errors ?? 0) === 0} />
            مرصد النظام الحي
            <Badge tone="copper">Observability</Badge>
          </h1>
          <p className="mt-1 text-xs text-steel-400">
            {telemetry ? `آخر قياس ${fmtTime(telemetry.checkedAt)} — استقصاء تلقائي كل 15 ثانية` : "جارٍ القياس الأول…"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={live ? "success" : "outline"} size="sm" onClick={() => setLive((v) => !v)}>
            {live ? "البث الحي مفعّل" : "البث الحي متوقف"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void loadTelemetry();
              if (tab === "traffic") void loadTraffic();
              if (tab === "errors") void loadErrors();
              toast("جارٍ التحديث الفوري…", "info");
            }}
          >
            تحديث الآن
          </Button>
        </div>
      </div>

      {/* شرائط التبويب — تنزلق أفقيًا على الهاتف */}
      <div className="no-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {(
          [
            ["pulse", "النبض الحي"],
            ["traffic", "حركة الخادم"],
            ["errors", `أخطاء التشغيل${errors.length ? ` (${errors.length})` : ""}`],
            ["quotas", "الحصص الخارجية"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold transition-all ${
              tab === key
                ? "bg-copper-600 text-white shadow-soft"
                : "border border-steel-200 bg-white text-steel-500 hover:border-copper-400 hover:text-copper-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ================== النبض الحي ================== */}
      {tab === "pulse" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="استجابة Neon DB"
              value={db ? `${db.latencyMs}ms` : "—"}
              sub={db?.version}
              tone={latencyTone as "ok" | "warn" | "bad" | "neutral"}
            />
            <StatCard
              label="اتصالات نشطة"
              value={db ? `${db.activeConnections}/${db.maxConnections}` : "—"}
              sub="من سقف القاعدة الأقصى"
            />
            <StatCard label="حجم القاعدة" value={db ? fmtBytes(db.sizeBytes) : "—"} sub="pg_database_size" />
            <StatCard
              label="الحركة (60 دقيقة)"
              value={telemetry?.traffic.total ?? "—"}
              sub={`${telemetry?.traffic.perMinute ?? 0} طلب/دقيقة • ${telemetry?.traffic.errors ?? 0} خطأ`}
              tone={(telemetry?.traffic.errors ?? 0) > 0 ? "warn" : "ok"}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <p className="mb-3 text-sm font-black text-steel-700">أكثر المسارات مرورًا — آخر {telemetry?.traffic.windowMinutes ?? 60} دقيقة</p>
              <div className="space-y-2">
                {(telemetry?.traffic.topPaths ?? []).map((p) => (
                  <div key={p.path} className="flex items-center justify-between gap-3 text-xs">
                    <span className="truncate font-mono text-steel-600" dir="ltr">{p.path}</span>
                    <Badge tone="steel">{p.count}</Badge>
                  </div>
                ))}
                {!telemetry?.traffic.topPaths.length && <p className="text-xs text-steel-400">لا حركة مرصودة بعد.</p>}
              </div>
            </Card>

            <Card className="p-4">
              <p className="mb-3 text-sm font-black text-steel-700">توزيع الأجهزة والدول</p>
              <div className="flex flex-wrap gap-2">
                {(telemetry?.traffic.devices ?? []).map((d) => (
                  <Badge key={d.device} tone="copper">
                    {deviceLabelAr(d.device)}: {d.count}
                  </Badge>
                ))}
                {(telemetry?.traffic.countries ?? []).map((c) => (
                  <Badge key={c.country} tone="neutral">
                    {c.country}: {c.count}
                  </Badge>
                ))}
              </div>
              <p className="mt-4 text-sm font-black text-steel-700">آخر خطأ مرصود</p>
              {telemetry?.errors.length ? (
                <p className="mt-1 line-clamp-2 font-mono text-[11px] text-danger-600" dir="ltr">
                  {telemetry.errors[0].message}
                </p>
              ) : (
                <p className="mt-1 text-xs text-success-600">صفر أخطاء — النظام صافٍ.</p>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* ================== حركة الخادم ================== */}
      {tab === "traffic" && (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-end gap-3 border-b border-steel-100 p-4">
            <div>
              <label className="text-[11px] font-bold text-steel-400">النافذة الزمنية</label>
              <select
                value={seconds}
                onChange={(e) => setSeconds(Number(e.target.value))}
                className="mt-1 block rounded-xl border border-steel-200 px-3 py-2 text-xs font-bold text-steel-700"
              >
                <option value={60}>آخر دقيقة</option>
                <option value={600}>آخر 10 دقائق</option>
                <option value={3600}>آخر ساعة</option>
                <option value={86400}>آخر 24 ساعة</option>
              </select>
            </div>
            <div className="min-w-52 flex-1">
              <label className="text-[11px] font-bold text-steel-400">تصفية بمعرف المستخدم أو بريده</label>
              <input
                value={userIdFilter}
                onChange={(e) => setUserIdFilter(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void loadTraffic()}
                placeholder="cmxyz… أو name@mail.com"
                className="mt-1 w-full rounded-xl border border-steel-200 px-3 py-2 text-xs"
                dir="ltr"
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-steel-600">
              <input type="checkbox" checked={errorOnly} onChange={(e) => setErrorOnly(e.target.checked)} className="accent-copper-600" />
              الأخطاء فقط
            </label>
            <Button size="sm" onClick={() => void loadTraffic()}>استعلام</Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-xs">
              <thead>
                <tr className="bg-steel-50 text-right text-[11px] font-black text-steel-400">
                  <th className="px-3 py-2.5">الوقت</th>
                  <th className="px-3 py-2.5">التطبيق</th>
                  <th className="px-3 py-2.5">الطريقة</th>
                  <th className="px-3 py-2.5">المسار</th>
                  <th className="px-3 py-2.5">الكود</th>
                  <th className="px-3 py-2.5">الجهاز</th>
                  <th className="px-3 py-2.5">IP</th>
                  <th className="px-3 py-2.5">القارئ</th>
                  <th className="px-3 py-2.5">المدة</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={`border-t border-steel-50 ${r.isError ? "bg-danger-400/5" : ""}`}>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-steel-400">{fmtTime(r.createdAt)}</td>
                    <td className="px-3 py-2"><Badge tone={r.app === "ADMIN" ? "copper" : "neutral"}>{r.app === "ADMIN" ? "لوحة" : "عام"}</Badge></td>
                    <td className="px-3 py-2 font-mono font-bold text-steel-600">{r.method}</td>
                    <td className="max-w-56 truncate px-3 py-2 font-mono text-steel-700" dir="ltr" title={r.path}>{r.path}</td>
                    <td className="px-3 py-2">
                      {r.status === null ? (
                        <span className="text-steel-300">—</span>
                      ) : (
                        <Badge tone={r.status >= 500 ? "danger" : r.status >= 400 ? "warn" : "success"}>{r.status}</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-steel-500">{deviceLabelAr(r.device)}</td>
                    <td className="px-3 py-2 font-mono text-[10px] text-steel-400" dir="ltr">{r.ip ?? "—"}</td>
                    <td className="max-w-40 truncate px-3 py-2 text-steel-500" dir="ltr">{r.userEmail ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-steel-400">{r.durationMs != null ? `${r.durationMs}ms` : "—"}</td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={9} className="px-3 py-10 text-center text-steel-400">
                      لا سجلات في هذه النافذة — الوسيط يبني السجل لحظة بلحظة.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ================== أخطاء التشغيل ================== */}
      {tab === "errors" && (
        <div className="space-y-3">
          {!errors.length && (
            <Card className="p-10 text-center">
              <p className="text-sm font-bold text-success-600">صفر أخطاء تشغيلية موثقة — السيرفر صافٍ تمامًا.</p>
            </Card>
          )}
          {errors.map((e) => (
            <Card key={e.id} className="overflow-hidden">
              <button
                onClick={() => setOpenStack(openStack === e.id ? null : e.id)}
                className="flex w-full flex-col gap-2 p-4 text-right transition-colors hover:bg-steel-50 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-xs font-black text-danger-600">
                    <Badge tone="danger">×{e.count}</Badge>
                    <Badge tone="neutral">{e.app === "ADMIN" ? "لوحة" : "عام"}</Badge>
                    <span className="font-mono text-[10px] text-steel-400" dir="ltr">{e.routeType ?? "?"} {e.path ?? ""}</span>
                  </p>
                  <p className="mt-1 truncate font-mono text-xs text-steel-700" dir="ltr">{e.message}</p>
                </div>
                <span className="shrink-0 text-[11px] text-steel-400">{fmtTime(e.lastSeenAt)}</span>
              </button>
              {openStack === e.id && (
                <div className="border-t border-steel-100 bg-steel-900 p-4">
                  <p className="mb-2 text-[10px] font-bold text-steel-400">بصمة التجميع: <span className="font-mono" dir="ltr">{e.digest}</span></p>
                  <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-steel-200" dir="ltr">
                    {e.stack ?? "(بلا Stack متاح)"}
                  </pre>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* ================== الحصص الخارجية ================== */}
      {tab === "quotas" && telemetry && (
        <div className="grid gap-4 lg:grid-cols-2">
          {(
            [
              ["محاورة Gemini النصية", telemetry.quotas.geminiChat],
              ["توليد الصوت Gemini TTS", telemetry.quotas.geminiTts],
              ["تسليم البريد Resend", telemetry.quotas.resend],
              ["تخزين الوسائط Cloudinary", telemetry.quotas.cloudinary],
            ] as [string, ProviderQuota][]
          ).map(([title, q]) => (
            <Card key={q.provider} className="p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-black text-steel-700">{title}</p>
                <Badge tone={q.configured ? "success" : "warn"}>{q.configured ? "مهيأ" : "غير مهيأ في هذه البيئة"}</Badge>
              </div>
              <p className="mt-2 text-3xl font-black tabular-nums text-steel-900">
                {q.today}
                <span className="text-xs font-bold text-steel-400"> استدعاء اليوم</span>
              </p>
              {/* أشرطة آخر 7 أيام */}
              <div className="mt-3 flex h-16 items-end gap-1.5">
                {(() => {
                  const days = q.last7Days;
                  const max = Math.max(1, ...days.map((d) => d.count));
                  return days.map((d) => (
                    <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                      <div
                        className="w-full rounded-t bg-copper-500/70"
                        style={{ height: `${Math.max(6, (d.count / max) * 100)}%` }}
                        title={`${d.day}: ${d.count}`}
                      />
                      <span className="text-[9px] text-steel-400">{d.day.slice(8)}</span>
                    </div>
                  ));
                })()}
                {!q.last7Days.length && <p className="text-xs text-steel-400">لا استهلاك مسجل في آخر 7 أيام.</p>}
              </div>
              {Boolean(q.extra?.domains) && (
                <p className="mt-2 text-[11px] text-steel-500">
                  نطاقات البريد: {((q.extra?.domains as { name: string; status: string }[] | undefined) ?? []).map((d) => `${d.name} (${d.status})`).join(" • ") || "—"}
                </p>
              )}
              {q.provider === "CLOUDINARY_UPLOAD" && Boolean(q.extra?.plan) && (
                <p className="mt-2 text-[11px] text-steel-500">
                  الخطة: {String(q.extra?.plan)} | رصيد المستخدم {String(q.extra?.creditsUsed)}/{String(q.extra?.creditsLimit)} | تخزين {String(q.extra?.storageUsedMB)}MB | باندودث {String(q.extra?.bandwidthUsedMB)}MB | أصول {String(q.extra?.objects)}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
