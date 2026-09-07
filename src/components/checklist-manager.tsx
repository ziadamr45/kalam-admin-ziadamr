"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Toggle, useToast } from "@/components/ui";

type Item = { id: string; text: string };

export function ChecklistManager({
  initial,
  autoApprove,
  requireChecklist,
}: {
  initial: Item[];
  autoApprove: boolean;
  requireChecklist: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [items, setItems] = useState<Item[]>(initial);
  const [newText, setNewText] = useState("");
  const [autoApproveState, setAutoApproveState] = useState(autoApprove);
  const [requireChecklistState, setRequireChecklistState] = useState(requireChecklist);
  const [busy, setBusy] = useState(false);

  const persist = async (nextItems: Item[], settings?: { AUTO_APPROVE_COMMENTS?: boolean; REQUIRE_CHECKLIST?: boolean }) => {
    setBusy(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checklist: nextItems, settings }),
      });
      if (res.ok) {
        toast("حُفظت الإعدادات");
        router.refresh();
      } else {
        toast("تعذر الحفظ", "error");
      }
    } finally {
      setBusy(false);
    }
  };

  const move = (index: number, dir: -1 | 1) => {
    const next = [...items];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
    persist(next);
  };

  const rename = (id: string, text: string) => {
    const next = items.map((it) => (it.id === id ? { ...it, text } : it));
    setItems(next);
  };

  const remove = (id: string) => {
    const next = items.filter((it) => it.id !== id);
    setItems(next);
    persist(next);
  };

  const addItem = () => {
    if (!newText.trim()) return;
    const next = [...items, { id: `c${Date.now().toString(36)}`, text: newText.trim() }];
    setItems(next);
    setNewText("");
    persist(next);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-steel-900">معايير النشر — قائمة الفحص الأخلاقي</h1>
        <p className="mt-1 text-sm leading-7 text-steel-500">
          هذه المعايير هي قلب فلتر «له لازمة»: لا يُنشر أي مقال قبل اجتيازها كاملة
          (إن كان فرضها مفعّلًا أدناه). عدّلها ب حرص.. فبهذا تُعرف المنصة.
        </p>
      </div>

      {/* إعدادات التشغيل */}
      <Card className="space-y-4 p-6">
        <h3 className="text-sm font-bold text-steel-800">إعدادات التشغيل</h3>
        <div className="flex items-center justify-between rounded-xl border border-steel-100 p-4">
          <div>
            <p className="text-sm font-bold text-steel-800">فرض قائمة الفحص قبل النشر</p>
            <p className="mt-0.5 text-xs text-steel-500">منع نشر أي مقال دون اجتياز كل المعايير</p>
          </div>
          <Toggle
            checked={requireChecklistState}
            onChange={(v) => {
              setRequireChecklistState(v);
              persist(items, { REQUIRE_CHECKLIST: v });
            }}
            label=""
          />
        </div>
        <div className="flex items-center justify-between rounded-xl border border-steel-100 p-4">
          <div>
            <p className="text-sm font-bold text-steel-800">اعتماد التعليقات تلقائيًا</p>
            <p className="mt-0.5 text-xs text-steel-500">
              عند الإيقاف (الموصى به): كل تعليق يمر بمراجعتك أولًا
            </p>
          </div>
          <Toggle
            checked={autoApproveState}
            onChange={(v) => {
              setAutoApproveState(v);
              persist(items, { AUTO_APPROVE_COMMENTS: v });
            }}
            label=""
          />
        </div>
      </Card>

      {/* المعايير */}
      <Card className="p-6">
        <h3 className="mb-4 text-sm font-bold text-steel-800">المعايير ({items.length})</h3>
        <ul className="space-y-3">
          {items.map((item, i) => (
            <li key={item.id} className="flex items-start gap-2 rounded-xl border border-steel-100 p-3">
              <span className="mt-2 text-xs font-bold text-copper-700">{new Intl.NumberFormat("ar-EG").format(i + 1)}.</span>
              <textarea
                value={item.text}
                onChange={(e) => rename(item.id, e.target.value)}
                rows={2}
                className="field min-h-0 flex-1 resize-none border-transparent p-1 text-sm leading-7 hover:border-steel-200"
              />
              <div className="mt-1 flex flex-col gap-1">
                <button onClick={() => move(i, -1)} className="rounded p-1 text-steel-400 hover:bg-steel-100" aria-label="أعلى">
                  ▲
                </button>
                <button onClick={() => move(i, 1)} className="rounded p-1 text-steel-400 hover:bg-steel-100" aria-label="أسفل">
                  ▼
                </button>
              </div>
              <button
                onClick={() => remove(item.id)}
                className="mt-1 rounded p-1.5 text-danger-500 hover:bg-danger-400/10"
                aria-label="حذف المعيار"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-5 flex gap-2">
          <input
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="معيار جديد.. مثال: هل الفكرة قابلة للسرد في لمح البصر؟"
            className="field flex-1"
            onKeyDown={(e) => e.key === "Enter" && addItem()}
          />
          <Button onClick={addItem} disabled={!newText.trim()}>إضافة</Button>
        </div>

        <div className="mt-4">
          <Button onClick={() => persist(items)} disabled={busy} variant="outline">
            حفظ التعديلات النصية
          </Button>
        </div>
      </Card>
    </div>
  );
}
