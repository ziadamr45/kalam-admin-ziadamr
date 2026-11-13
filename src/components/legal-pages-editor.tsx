"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, useToast } from "@/components/ui";

/**
 * ============================================================
 * محرر الصفحات القانونية — تحرير كامل للنص المعروض على الموقع
 * ============================================================
 * يفتح دائمًا على النص المعروض فعليًا على المنصة (المخصص المحفوظ
 * أو الافتراضي الرصين) فلا يكتب المحرر من الصفر أبدًا. الحفظ صريح
 * بزر واحد مع تأكيد قبل النشر، وأي تعديل غير محفوظ يُحرس: تنبيه
 * عند التبديل بين الصفحات وعند مغادرة النافذة قبل أن يضيع الجهد.
 */

type PageKey = "privacy" | "terms" | "dialogue-ethics";

const PAGES: { key: PageKey; label: string; hint: string }[] = [
  { key: "privacy", label: "سياسة الخصوصية", hint: "كيف تُعامل بيانات الدخول بـ Google والكوكيز والتفضيلات" },
  { key: "terms", label: "شروط الاستخدام", hint: "حقوق الملكية الفكرية وقواعد التعليقات" },
  { key: "dialogue-ethics", label: "أخلاقيات الحوار والتعليق", hint: "أدب الحوار والقيم والمخالفات والعواقب" },
];

type Draft = { title: string; content: string };
type Baseline = Draft & { updatedAt: string | null; isCustom: boolean };

export function LegalPagesEditor() {
  const { toast } = useToast();
  const [active, setActive] = useState<PageKey>("privacy");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [savedFlash, setSavedFlash] = useState<Partial<Record<PageKey, boolean>>>({});
  /* خط الأساس: ما يُعرض فعليًا على الموقع الآن (مخصص محفوظ أو افتراضي) */
  const [baseline, setBaseline] = useState<Partial<Record<PageKey, Baseline>>>({});
  /* مسودة التحرير الجارية لكل صفحة — تبقى محفوظة في الذاكرة بين التبويبات */
  const [drafts, setDrafts] = useState<Partial<Record<PageKey, Draft>>>({});
  const [defaultsMap, setDefaultsMap] = useState<Record<string, { title: string; content: string }>>({});
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;

  const fmtDate = (iso?: string | null) =>
    iso
      ? new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso))
      : "";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/legal-pages");
      const data = await res.json();
      setDefaultsMap(data.defaults ?? {});
      const nextBaseline: Partial<Record<PageKey, Baseline>> = {};
      const nextDrafts: Partial<Record<PageKey, Draft>> = {};
      for (const { key, label } of PAGES) {
        const saved = (data.pages ?? []).find((p: { slug: string }) => p.slug === key);
        const def = (data.defaults ?? {})[key];
        /* ما يُعرض على الموقع فعليًا: النص المحفوظ إن وُجد وإلا الافتراضي */
        nextBaseline[key] = saved
          ? { title: saved.title, content: saved.content, updatedAt: saved.updatedAt, isCustom: true }
          : { title: def?.title ?? label, content: def?.content ?? "", updatedAt: def?.updatedAt ?? null, isCustom: false };
        /* المحرر يفتح على النص المعروض حاليًا — لا كتابة من الصفر أبدًا */
        nextDrafts[key] = { title: nextBaseline[key]!.title, content: nextBaseline[key]!.content };
      }
      setBaseline(nextBaseline);
      setDrafts(nextDrafts);
    } catch {
      /* الشاشة تبقى فارغة مع زر إعادة المحاولة */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const draft = drafts[active];
  const base = baseline[active];
  const isDirty = useMemo(() => {
    if (!draft || !base) return false;
    return draft.title !== base.title || draft.content !== base.content;
  }, [draft, base]);

  /* حرس الخروج: تعديلات غير محفوظة ستضيع — تنبيه المتصفح عند مغادرة النافذة */
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const switchTab = (key: PageKey) => {
    if (key === active) return;
    if (isDirty && !confirm(`لديك تعديلات غير محفوظة في «${PAGES.find((p) => p.key === active)!.label}» — التنقل الآن سيتركها دون حفظ. متابعة؟`)) {
      return;
    }
    setActive(key);
  };

  const pullDisplayed = () => {
    if (!base) return;
    setDrafts((d) => ({ ...d, [active]: { title: base.title, content: base.content } }));
    toast("سُحب النص المعروض حاليًا على الموقع إلى المحرر", "info");
  };

  const restoreDefault = () => {
    const def = defaultsMap[active];
    if (!def) return;
    if (isDirty && !confirm("استعادة النص الافتراضي ستستبدل ما في المحرر الآن (قبل الحفظ) — متابعة؟")) return;
    setDrafts((d) => ({ ...d, [active]: { title: def.title, content: def.content } }));
    toast("استُعيد النص الافتراضي إلى المحرر — اضغط «حفظ ونشر» ليصبح هو المعروض", "info");
  };

  const save = async () => {
    if (!draft) return;
    if (!confirm("سيُنشر النص فورًا على صفحة المنصة العامة ويُحدَّث تاريخ الصفحة تلقائيًا — متابعة النشر؟")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/legal-pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: active, title: draft.title, content: draft.content }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "تعذر الحفظ", "error");
        return;
      }
      /* خط الأساس الجديد = ما حُفظ للتو — التعديلات أصبحت منشورة */
      setBaseline((b) => ({
        ...b,
        [active]: { title: draft.title, content: draft.content, updatedAt: data.page?.updatedAt ?? new Date().toISOString(), isCustom: true },
      }));
      setSavedFlash((s) => ({ ...s, [active]: true }));
      setTimeout(() => setSavedFlash((s) => ({ ...s, [active]: false })), 3000);
      toast("حُفظ النص وصار حيًّا على صفحة المنصة فورًا وتحدّث تاريخ الصفحة تلقائيًا", "success");
    } finally {
      setBusy(false);
    }
  };

  const patchDraft = (patch: Partial<Draft>) => {
    setDrafts((d) => ({ ...d, [active]: { ...(d[active] as Draft), ...patch } }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-steel-900">الصفحات القانونية</h1>
        <p className="mt-1 text-sm text-steel-500">
          المحرر يفتح على النص المعروض فعليًا على المنصة — عدّل أي كلمة ثم انشر بزر واحد، والتعديلات
          غير المحفوظة محروس عند التنقل أو مغادرة الصفحة.
        </p>
      </div>

      {/* تبويبات الصفحات — مع وسم حالة كل صفحة وعلامة التعديلات غير المحفوظة */}
      <div className="flex flex-wrap gap-1.5">
        {PAGES.map((p) => {
          const d = drafts[p.key];
          const b = baseline[p.key];
          const tabDirty = Boolean(d && b && (d.title !== b.title || d.content !== b.content));
          return (
            <button
              key={p.key}
              onClick={() => switchTab(p.key)}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition-colors ${
                active === p.key ? "bg-copper-600 text-white" : "bg-steel-100 text-steel-600 hover:bg-steel-200"
              }`}
            >
              {p.label}
              {tabDirty && <span className="ms-1.5 rounded-full bg-amber-400 px-1.5 text-[9px] font-black text-amber-950">●</span>}
              {savedFlash[p.key] && <span className="ms-1.5">✓</span>}
            </button>
          );
        })}
      </div>

      <Card className="space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <p className="text-xs leading-6 text-steel-400">{PAGES.find((p) => p.key === active)?.hint}</p>
            {/* وسم المصدر: ماذا يُعرض على الموقع الآن لهذه الصفحة */}
            {base?.isCustom ? (
              <span className="rounded-md bg-sky-100 px-2 py-1 text-[10px] font-bold text-sky-700">نص مخصص محفوظ يُعرض حاليًا</span>
            ) : (
              <span className="rounded-md bg-steel-100 px-2 py-1 text-[10px] font-bold text-steel-600">النص الافتراضي معروض — لم يُحفظ نص مخصص بعد</span>
            )}
          </div>
          {/* التاريخ الفعلي — نفس المصدر الذي يُعرض أسفل صفحة المنصة */}
          <p className="rounded-lg bg-steel-50 px-2.5 py-1 text-[11px] font-bold text-steel-500">
            {base?.updatedAt ? `آخر تحديث فعلي: ${fmtDate(base.updatedAt)}` : "النص الافتراضي معروض — عند أول حفظ يبدأ التاريخ بالتسجيل تلقائيًا"}
          </p>
        </div>

        {loading ? (
          <p className="py-10 text-center text-sm text-steel-400">جارٍ التحميل..</p>
        ) : (
          !draft ? (
            <div className="py-10 text-center">
              <p className="mb-3 text-sm text-steel-400">تعذر تحميل النصوص — تحقق من الاتصال</p>
              <Button onClick={load} variant="outline">إعادة المحاولة</Button>
            </div>
          ) : (
            <>
              {/* أزرار السحب والاستعادة — بجانب وسم التعديلات غير المحفوظة */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-steel-100 pb-3">
                <div className="flex flex-wrap gap-2">
                  <Button onClick={pullDisplayed} variant="outline" className="!px-3 !py-1.5 !text-xs">
                    ↩ سحب النص المعروض حاليًا على الموقع
                  </Button>
                  <Button onClick={restoreDefault} variant="outline" className="!px-3 !py-1.5 !text-xs">
                    ⟲ استعادة النص الافتراضي
                  </Button>
                </div>
                {isDirty && (
                  <span className="rounded-md bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-700">
                    تعديلات غير محفوظة — لن تُنشر حتى تضغط «حفظ ونشر النص»
                  </span>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-steel-700">عنوان الصفحة</label>
                <input className="field" value={draft.title} onChange={(e) => patchDraft({ title: e.target.value })} maxLength={120} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-steel-700">
                  محتوى الصفحة
                  <span className="ms-2 font-normal text-steel-400">
                    (التنسيق: «## » لعنوان فرعي، «- » لقائمة، والفقرات بسطر فارغ)
                  </span>
                </label>
                <textarea
                  className="field resize-y font-body leading-9"
                  rows={20}
                  value={draft.content}
                  onChange={(e) => patchDraft({ content: e.target.value })}
                  dir="rtl"
                />
                <p className="mt-1 text-[11px] text-steel-400">{draft.content.length} حرف</p>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-[11px] text-steel-400">
                  يُحفظ في قاعدة البيانات ويُعرض على المسار العام فورًا بعد الحفظ — التعديل وحده لا يُنشر شيئًا.
                </p>
                <Button onClick={save} disabled={busy || !isDirty}>
                  {busy ? "جارٍ الحفظ.." : isDirty ? "حفظ ونشر النص" : "لا تعديلات لحفظها"}
                </Button>
              </div>
            </>
          )
        )}
      </Card>
    </div>
  );
}
