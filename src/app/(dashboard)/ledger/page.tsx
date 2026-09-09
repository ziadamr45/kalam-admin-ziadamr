"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, Modal } from "@/components/ui";

/**
 * ============================================================
 * السجل السيادي — سجل التدقيق والامتثال (Master Audit Ledger)
 * ============================================================
 * شاشة الرقابة الدائمة: كل إجراء حساس في المنصة بقيد غير قابل
 * للتلاعب — الفاعل والدور والتصنيف والسبب والدليل المصور. ترشيح
 * زمني (اليوم/٧ أيام/شهر/تخصيص) وبالتصنيف، أرقام تنفيذية، وتصدير
 * تقرير PDF فاخر بأسبوعي/شهري/مخصص.
 */

type TrailEntry = {
  id: string;
  actorEmail: string;
  actorRole: string;
  actionCategory: string;
  actionType: string;
  targetEmail: string | null;
  reason: string | null;
  evidenceUrl: string | null;
  createdAt: string;
};

type Summary = {
  hardDeletes: number;
  bans: number;
  featured: number;
  vipChanges: number;
  configChanges: number;
  total: number;
};

const CATEGORY_META: Record<string, { label: string; bg: string; text: string }> = {
  USER_SELF_ACTION: { label: "إجراء ذاتي للمستخدم", bg: "bg-sky-100", text: "text-sky-700" },
  ADMIN_MODERATION: { label: "إشراف ورقابة", bg: "bg-red-100", text: "text-red-700" },
  ADMIN_VIP_CHANGE: { label: "توثيق ورُتب", bg: "bg-amber-100", text: "text-amber-700" },
  SYSTEM_CONFIG_CHANGE: { label: "إعدادات المنصة", bg: "bg-lime-100", text: "text-lime-700" },
};

const ACTION_LABELS: Record<string, string> = {
  USER_HARD_DELETE: "محو سيادي شامل لحساب",
  USER_SELF_HARD_DELETE: "حذف ذاتي شامل للحساب",
  ACCOUNT_BANNED: "حظر حساب",
  ACCOUNT_UNBANNED: "رفع حظر حساب",
  COMMENT_FEATURED: "تمييز تعليق",
  COMMENT_UNFEATURED: "إلغاء تمييز تعليق",
  VIP_GRANTED: "منح توثيق وتمييز",
  VIP_REVOKED: "سحب توثيق وتمييز",
};

const CATEGORY_OPTIONS = [
  { value: "ALL", label: "كل التصنيفات" },
  { value: "USER_SELF_ACTION", label: "إجراء ذاتي للمستخدم" },
  { value: "ADMIN_MODERATION", label: "إشراف ورقابة" },
  { value: "ADMIN_VIP_CHANGE", label: "توثيق ورُتب" },
  { value: "SYSTEM_CONFIG_CHANGE", label: "إعدادات المنصة" },
];

const DATE_PRESETS = [
  { value: "1", label: "اليوم" },
  { value: "7", label: "آخر ٧ أيام" },
  { value: "30", label: "آخر شهر" },
  { value: "custom", label: "تخصيص يدوي" },
];

function eastern(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
}

function fmtTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ar-EG", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function LedgerPage() {
  const [days, setDays] = useState("7");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [category, setCategory] = useState("ALL");
  const [entries, setEntries] = useState<TrailEntry[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rangeLabel, setRangeLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [evidence, setEvidence] = useState<TrailEntry | null>(null);
  const [exporting, setExporting] = useState(false);

  const query = useMemo(() => {
    const p = new URLSearchParams({ category });
    if (days === "custom") {
      if (customFrom) p.set("from", customFrom);
      if (customTo) p.set("to", customTo);
    } else {
      p.set("days", days);
    }
    return p.toString();
  }, [days, customFrom, customTo, category]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/audit/trail?${query}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setEntries(data.entries ?? []);
        setSummary(data.summary ?? null);
        setRangeLabel(data.range?.label ?? "");
      } else {
        setError(data.error ?? "تعذر تحميل السجل السيادي");
      }
    } catch {
      setError("تعذر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  const exportPdf = (range: "weekly" | "monthly" | "custom") => {
    setExporting(true);
    try {
      const p = new URLSearchParams({ range, category });
      if (range === "custom") {
        if (customFrom) p.set("from", customFrom);
        if (customTo) p.set("to", customTo);
      }
      window.open(`/api/audit/pdf?${p.toString()}`, "_blank");
    } finally {
      setTimeout(() => setExporting(false), 1200);
    }
  };

  const stats = summary
    ? [
        { n: summary.hardDeletes, label: "محو حسابات شامل", tone: "text-danger-600" },
        { n: summary.bans, label: "حظر حسابات", tone: "text-danger-500" },
        { n: summary.featured, label: "تمييز تعليقات", tone: "text-copper-700" },
        { n: summary.vipChanges, label: "توثيق ورُتب", tone: "text-amber-600" },
        { n: summary.configChanges, label: "تعديلات إعدادات", tone: "text-lime-600" },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-steel-900">السجل السيادي — سجل التدقيق والامتثال</h1>
          <p className="mt-1 text-sm text-steel-500">
            كل إجراء حساس بقيد رقابي دائم لا يُحذف ولا يُعدّل — الفاعل والسبب والدليل المصوّر، شفافية كاملة
            أمام أصحاب المنصة وقيد امتثال قانوني غير معرّف بعد محو الحسابات.
          </p>
        </div>

        {/* تصدير التقرير الرقابي PDF */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-steel-100 bg-white p-2.5">
          <span className="px-1 text-xs font-bold text-steel-600">تصدير التقرير الرقابي PDF:</span>
          <button
            onClick={() => exportPdf("weekly")}
            disabled={exporting}
            className="rounded-lg bg-steel-900 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-steel-700 disabled:opacity-50"
          >
            أسبوعي
          </button>
          <button
            onClick={() => exportPdf("monthly")}
            disabled={exporting}
            className="rounded-lg bg-steel-900 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-steel-700 disabled:opacity-50"
          >
            شهري
          </button>
          <button
            onClick={() => exportPdf("custom")}
            disabled={exporting || !customFrom || !customTo}
            title={customFrom && customTo ? "تصدير النطاق المخصص الحالي" : "حدد نطاقًا مخصصًا أولًا من المرشحات"}
            className="rounded-lg bg-copper-700 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-copper-600 disabled:opacity-40"
          >
            مخصص
          </button>
        </div>
      </div>

      {/* المرشحات */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-xl bg-steel-100 p-1">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => setDays(p.value)}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
                  days === p.value ? "bg-white text-steel-900 shadow-sm" : "text-steel-500 hover:text-steel-700"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {days === "custom" && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="field w-40 text-xs"
                aria-label="من تاريخ"
              />
              <span className="text-xs text-steel-400">←</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="field w-40 text-xs"
                aria-label="إلى تاريخ"
              />
            </div>
          )}

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="field w-48 text-xs"
            dir="rtl"
          >
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>

          <button
            onClick={load}
            className="ms-auto rounded-lg border border-steel-200 px-3 py-1.5 text-xs font-bold text-steel-600 transition-colors hover:bg-steel-50"
          >
            تحديث
          </button>
        </div>
      </Card>

      {/* الملخص التنفيذي */}
      {summary && (
        <div className="grid grid-cols-3 gap-3 lg:grid-cols-6">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl border border-steel-100 bg-white p-4 text-center">
              <p className={`text-2xl font-bold tabular-nums ${s.tone}`}>{eastern(s.n)}</p>
              <p className="mt-1 text-[10px] text-steel-400">{s.label}</p>
            </div>
          ))}
          <div className="rounded-xl border-2 border-copper-200 bg-copper-50 p-4 text-center">
            <p className="text-2xl font-bold tabular-nums text-copper-700">{eastern(summary.total)}</p>
            <p className="mt-1 text-[10px] font-bold text-copper-700">إجمالي القيود</p>
          </div>
        </div>
      )}

      {/* بطاقات القيود */}
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold text-steel-800">
            قيود الفترة {rangeLabel && <span className="text-steel-400">— {rangeLabel}</span>}
          </h2>
          {summary && (
            <span className="text-xs text-steel-400">{eastern(summary.total)} قيدًا رقابيًا</span>
          )}
        </div>

        {loading ? (
          <p className="py-10 text-center text-sm text-steel-400">جارٍ تحميل السجل السيادي..</p>
        ) : error ? (
          <p className="py-10 text-center text-sm text-danger-600">{error}</p>
        ) : entries.length === 0 ? (
          <p className="py-10 text-center text-xs text-steel-400">
            لا قيود في هذه الفترة والتصنيف — سلامة كاملة بلا إجراءات حساسة.
          </p>
        ) : (
          <ul className="max-h-[62vh] space-y-2.5 overflow-y-auto pe-1">
            {entries.map((e) => {
              const meta = CATEGORY_META[e.actionCategory] ?? { label: e.actionCategory, bg: "bg-steel-100", text: "text-steel-600" };
              return (
                <li key={e.id} className="rounded-xl border border-steel-100 p-4 transition-colors hover:bg-steel-50/60">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-md px-2 py-1 text-[10px] font-bold ${meta.bg} ${meta.text}`}>
                      {meta.label}
                    </span>
                    <span className="text-xs font-bold text-steel-900">
                      {ACTION_LABELS[e.actionType] ?? e.actionType}
                    </span>
                    <span className="ms-auto text-[10px] text-steel-400">{fmtTime(e.createdAt)}</span>
                  </div>

                  <div className="mt-2.5 grid gap-x-6 gap-y-1.5 text-[11px] leading-6 sm:grid-cols-2">
                    <p className="text-steel-500">
                      <span className="font-bold text-steel-700">الفاعل:</span>{" "}
                      <span dir="ltr">{e.actorEmail}</span>{" "}
                      <span className="rounded bg-steel-100 px-1.5 py-0.5 text-[9px] font-bold text-steel-500">{e.actorRole}</span>
                    </p>
                    <p className="text-steel-500">
                      <span className="font-bold text-steel-700">المستهدف:</span>{" "}
                      {e.targetEmail ? <span dir="ltr">{e.targetEmail}</span> : "—"}
                    </p>
                  </div>

                  {e.reason && (
                    <p className="mt-1.5 border-t border-steel-100 pt-2 text-[11px] leading-6 text-steel-600">
                      <span className="font-bold text-steel-700">السبب:</span> {e.reason}
                    </p>
                  )}

                  {e.evidenceUrl && (
                    <button
                      onClick={() => setEvidence(e)}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-sky-50 px-2.5 py-1 text-[10px] font-bold text-sky-700 transition-colors hover:bg-sky-100"
                    >
                      📎 عرض الدليل المصوّر
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* مودال معاينة الدليل */}
      <Modal open={Boolean(evidence)} onClose={() => setEvidence(null)} title="الدليل المصوّر — قيد التدقيق">
        {evidence && (
          <div className="space-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={evidence.evidenceUrl ?? ""}
              alt="لقطة الشاشة الدليلية"
              className="max-h-[55vh] w-full rounded-xl border border-steel-200 object-contain"
            />
            <div className="rounded-xl bg-steel-50 p-3 text-[11px] leading-6 text-steel-600">
              <p><span className="font-bold text-steel-800">الإجراء:</span> {ACTION_LABELS[evidence.actionType] ?? evidence.actionType}</p>
              <p><span className="font-bold text-steel-800">الفاعل:</span> <span dir="ltr">{evidence.actorEmail}</span> — {fmtTime(evidence.createdAt)}</p>
              {evidence.reason && <p><span className="font-bold text-steel-800">السبب:</span> {evidence.reason}</p>}
              <p className="mt-1 break-all border-t border-steel-200 pt-1.5 text-[10px] text-steel-400" dir="ltr">
                {evidence.evidenceUrl}
              </p>
            </div>
            <a
              href={evidence.evidenceUrl ?? "#"}
              target="_blank"
              rel="noreferrer"
              className="inline-block rounded-lg bg-steel-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-steel-700"
            >
              فتح الصورة الأصلية ↗
            </a>
          </div>
        )}
      </Modal>
    </div>
  );
}
