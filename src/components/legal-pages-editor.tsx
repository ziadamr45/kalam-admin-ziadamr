"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, useToast } from "@/components/ui";

type PageKey = "privacy" | "terms" | "dialogue-ethics";

const PAGES: { key: PageKey; label: string; hint: string }[] = [
  { key: "privacy", label: "سياسة الخصوصية", hint: "كيف تُعامل بيانات الدخول بـ Google والكوكيز والتفضيلات" },
  { key: "terms", label: "شروط الاستخدام", hint: "حقوق الملكية الفكرية وقواعد التعليقات" },
  { key: "dialogue-ethics", label: "أخلاقيات الحوار والتعليق", hint: "أدب الحوار والقيم والمخالفات والعواقب" },
];

export function LegalPagesEditor() {
  const { toast } = useToast();
  const [active, setActive] = useState<PageKey>("privacy");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<Partial<Record<PageKey, boolean>>>({});
  /* تاريخ آخر تحديث الفعلي لكل صفحة — من قاعدة البيانات (يتجدد مع كل حفظ) أو تاريخ آخر تدقيق للنص الافتراضي */
  const [updatedAt, setUpdatedAt] = useState<Partial<Record<PageKey, string>>>({});

  const fmtDate = (iso?: string | null) =>
    iso
      ? new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso))
      : "";

  const load = useCallback(async (key: PageKey) => {
    setLoading(true);
    try {
      const res = await fetch("/api/legal-pages");
      const data = await res.json();
      const page = (data.pages ?? []).find((p: { slug: string }) => p.slug === key);
      setTitle(page?.title ?? PAGES.find((p) => p.key === key)!.label);
      setContent(page?.content ?? "");
      setUpdatedAt((prev) => ({ ...prev, [key]: page?.updatedAt ?? null }));
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    load(active);
  }, [active, load]);

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/legal-pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: active, title, content }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "تعذر الحفظ", "error");
        return;
      }
      setSaved((s) => ({ ...s, [active]: true }));
      /* التاريخ الديناميكي يُجدد فورًا من استجابة الخادم — ينعكس أسفل صفحة المنصة لحظةً */
      if (data.page?.updatedAt) {
        setUpdatedAt((prev) => ({ ...prev, [active]: data.page.updatedAt }));
      }
      toast("حُفظ النص وصار حيًّا على صفحة المنصة فورًا وتحدّث تاريخ الصفحة تلقائيًا", "success");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-steel-900">الصفحات القانونية</h1>
        <p className="mt-1 text-sm text-steel-500">
          عدّل نصوص صفحات المنصة الرسمية من هنا — دون مساس بالأكواد، ويظهر التعديل فورًا للقرّاء.
          غياب نص محفوظ يعني أن المنصة تعرض النص الافتراضي الرصين المعدّ مسبقًا.
        </p>
      </div>

      {/* تبويبات الصفحات */}
      <div className="flex flex-wrap gap-1.5">
        {PAGES.map((p) => (
          <button
            key={p.key}
            onClick={() => setActive(p.key)}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition-colors ${
              active === p.key ? "bg-copper-600 text-white" : "bg-steel-100 text-steel-600 hover:bg-steel-200"
            }`}
          >
            {p.label}
            {saved[p.key] && <span className="ms-1.5">✓</span>}
          </button>
        ))}
      </div>

      <Card className="space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs leading-6 text-steel-400">{PAGES.find((p) => p.key === active)?.hint}</p>
          {/* التاريخ الفعلي — نفس المصدر الذي يُعرض أسفل صفحة المنصة */}
          <p className="rounded-lg bg-steel-50 px-2.5 py-1 text-[11px] font-bold text-steel-500">
            {updatedAt[active]
              ? `آخر تحديث فعلي: ${fmtDate(updatedAt[active])}`
              : "النص الافتراضي معروض — عند أول حفظ يبدأ التاريخ بالتسجيل تلقائيًا"}
          </p>
        </div>

        {loading ? (
          <p className="py-10 text-center text-sm text-steel-400">جارٍ التحميل..</p>
        ) : (
          <>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-steel-700">عنوان الصفحة</label>
              <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
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
                value={content}
                onChange={(e) => setContent(e.target.value)}
                dir="rtl"
              />
              <p className="mt-1 text-[11px] text-steel-400">{content.length} حرف</p>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-[11px] text-steel-400">
                يُحفظ في قاعدة البيانات ويُعرض على المسار العام فورًا بعد الحفظ.
              </p>
              <Button onClick={save} disabled={busy}>
                {busy ? "جارٍ الحفظ.." : "حفظ ونشر النص"}
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
