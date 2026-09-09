"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, useToast } from "@/components/ui";

/**
 * ============================================================
 * استوديو التكوين السيادي — Visual Configuration Studio
 * ============================================================
 * تحرير أي نص أو علم أو معيار اقتصادي في المنصة وتطبيقه فورًا
 * على الإنتاج دون كتابة كود أو إعادة نشر (Zero-Deploy Runtime Updates).
 * التخزين: جدول SiteConfig (مفتاح/قيمة/تصنيف) — الانعكاس:
 * revalidateTag('site-config') + إعادة تحقق عابرة للتطبيقات.
 */

type Def = {
  key: string;
  category: "BRANDING" | "TEXTS" | "FLAGS" | "IMPACT";
  type: "string" | "text" | "boolean" | "number" | "json";
  label: string;
  hint?: string;
  default: unknown;
};

const CATEGORY_TABS: { key: Def["category"]; label: string; icon: string }[] = [
  { key: "BRANDING", label: "الهوية والعلامة", icon: "◈" },
  { key: "TEXTS", label: "النصوص والرسائل", icon: "✎" },
  { key: "FLAGS", label: "مفاتيح الميزات", icon: "⚑" },
  { key: "IMPACT", label: "اقتصاد الأثر", icon: "✦" },
];

const CATEGORY_DESC: Record<Def["category"], string> = {
  BRANDING: "اسم المنصة والوثائق والتذييل وروابط التواصل — كل ما يحمل هوية «كلام له لازمة».",
  TEXTS: "رسالة الترحيب وشرائح التهيئة وشارة المحاور وتنويهه الافتتاحي والثابت.",
  FLAGS: "مفاتيح تشغيل/إيقاف فورية: المحاورة الذكية، التعليقات، المشغل الصوتي، قناة أهل الكلمة.",
  IMPACT: "أوزان النقاط وعتبة «أهل الكلمة» — تُطبَّق على محرك الرصيد لحظة الحفظ.",
};

export function ConfigStudio() {
  const { toast } = useToast();
  const [schema, setSchema] = useState<Def[]>([]);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [tab, setTab] = useState<Def["category"]>("BRANDING");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/site-config", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setSchema(data.schema ?? []);
      setValues(data.values ?? {});
      setDraft({});
      setLoaded(true);
    } catch {
      toast("تعذر جلب التكوين", "error");
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const defs = useMemo(() => schema.filter((d) => d.category === tab), [schema, tab]);

  const currentOf = (d: Def): unknown =>
    d.key in draft ? draft[d.key] : (values[d.key] ?? d.default);

  const setField = (key: string, value: unknown) => setDraft((prev) => ({ ...prev, [key]: value }));

  const dirtyKeys = Object.keys(draft);

  const save = async () => {
    if (!dirtyKeys.length) return;
    setSaving(true);
    try {
      const entries = dirtyKeys.map((key) => {
        const def = schema.find((s) => s.key === key);
        if (def?.type === "json" && typeof draft[key] === "string") {
          return { key, value: draft[key] }; // نص خام — الخادم يتحقق ويعيد خطأً واضحًا
        }
        return { key, value: draft[key] };
      });
      const res = await fetch("/api/admin/site-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? "تعذر الحفظ", "error");
        return;
      }
      setValues(data.values ?? {});
      setDraft({});
      toast(`طُبِّق التعديل لحظيًا على المنصة: ${data.saved.join("، ")}`, "success");
    } catch {
      toast("تعذر الحفظ — خطأ في الشبكة", "error");
    } finally {
      setSaving(false);
    }
  };

  const revert = (key: string) =>
    setDraft((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

  if (!loaded) {
    return <p className="p-10 text-center text-sm text-steel-400">جارٍ فتح الاستوديو…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-black text-steel-900">
            استوديو التكوين السيادي
            <Badge tone="copper">Headless CMS</Badge>
          </h1>
          <p className="mt-1 text-xs text-steel-400">
            سيادة كاملة على الواجهة والميزات واقتصاد الأثر — الحفظ ينعكس على الإنتاج لحظيًا بلا إعادة نشر.
          </p>
        </div>
        {dirtyKeys.length > 0 && (
          <Button onClick={save} disabled={saving} className="animate-pulse">
            {saving ? "جارٍ التطبيق…" : `تطبيق ${dirtyKeys.length} تعديل على المنصة`}
          </Button>
        )}
      </div>

      {/* شرائط التصنيفات — تنزلق أفقيًا على الهاتف */}
      <div className="no-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {CATEGORY_TABS.map((c) => {
          const dirtyCount = defsOf(schema, c.key).filter((d) => d.key in draft).length;
          return (
            <button
              key={c.key}
              onClick={() => setTab(c.key)}
              className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold transition-all ${
                tab === c.key
                  ? "bg-copper-600 text-white shadow-soft"
                  : "border border-steel-200 bg-white text-steel-500 hover:border-copper-400 hover:text-copper-700"
              }`}
            >
              <span className="ml-1">{c.icon}</span>
              {c.label}
              {dirtyCount > 0 && <span className="mr-1 rounded-full bg-warn-400/20 px-1.5 text-[10px] text-warn-500">{dirtyCount}</span>}
            </button>
          );
        })}
      </div>

      <p className="text-xs leading-relaxed text-steel-400">{CATEGORY_DESC[tab]}</p>

      <div className="grid gap-4 lg:grid-cols-2">
        {defs.map((d) => {
          const val = currentOf(d);
          const isDirty = d.key in draft;
          return (
            <Card key={d.key} className={`p-4 transition-shadow ${isDirty ? "ring-2 ring-copper-500/40" : ""}`}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-black text-steel-800">{d.label}</p>
                  {d.hint && <p className="mt-0.5 text-[11px] text-steel-400">{d.hint}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Badge tone="neutral">{TYPE_AR[d.type]}</Badge>
                  {isDirty && (
                    <button onClick={() => revert(d.key)} className="rounded-lg px-2 py-0.5 text-[10px] font-bold text-warn-500 hover:bg-warn-400/10">
                      تراجع
                    </button>
                  )}
                </div>
              </div>

              {/* ===== حسب النوع ===== */}
              {d.type === "boolean" ? (
                <div className="flex gap-2">
                  {[
                    [true, "مفعّل"],
                    [false, "متوقف"],
                  ].map(([v, label]) => (
                    <button
                      key={String(v)}
                      onClick={() => setField(d.key, v)}
                      className={`flex-1 rounded-xl px-3 py-2.5 text-xs font-black transition-all ${
                        val === v
                          ? v
                            ? "bg-success-600 text-white"
                            : "bg-danger-600 text-white"
                          : "border border-steel-200 text-steel-500 hover:border-steel-300"
                      }`}
                    >
                      {label as string}
                    </button>
                  ))}
                </div>
              ) : d.type === "number" ? (
                <input
                  type="number"
                  value={Number(val ?? 0)}
                  onChange={(e) => setField(d.key, Number(e.target.value))}
                  className="w-40 rounded-xl border border-steel-200 px-3 py-2 text-sm font-black tabular-nums"
                />
              ) : d.type === "text" ? (
                <textarea
                  rows={3}
                  value={String(val ?? "")}
                  onChange={(e) => setField(d.key, e.target.value)}
                  className="w-full resize-y rounded-xl border border-steel-200 px-3 py-2 text-sm leading-relaxed"
                />
              ) : d.type === "json" ? (
                <textarea
                  rows={4}
                  value={typeof val === "string" ? val : JSON.stringify(val ?? [], null, 2)}
                  onChange={(e) => setField(d.key, e.target.value)}
                  className="w-full resize-y rounded-xl border border-steel-200 px-3 py-2 font-mono text-xs"
                  dir="ltr"
                />
              ) : (
                <input
                  value={String(val ?? "")}
                  onChange={(e) => setField(d.key, e.target.value)}
                  className="w-full rounded-xl border border-steel-200 px-3 py-2 text-sm"
                />
              )}

              <p className="mt-2 font-mono text-[10px] text-steel-300" dir="ltr">{d.key}</p>
            </Card>
          );
        })}
      </div>

      {dirtyKeys.length > 0 && (
        <div className="sticky bottom-4 z-10 flex justify-center">
          <Button onClick={save} disabled={saving} className="shadow-lift">
            {saving ? "جارٍ التطبيق…" : `حفظ وتطبيق فوري — ${dirtyKeys.length} مفتاح`}
          </Button>
        </div>
      )}
    </div>
  );
}

const TYPE_AR: Record<Def["type"], string> = {
  string: "نص",
  text: "نص طويل",
  boolean: "مفتاح",
  number: "رقم",
  json: "JSON",
};

function defsOf(schema: Def[], category: Def["category"]): Def[] {
  return schema.filter((d) => d.category === category);
}
