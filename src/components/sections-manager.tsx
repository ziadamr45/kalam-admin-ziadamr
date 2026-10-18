"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Modal, Toggle, useToast } from "@/components/ui";

type SectionRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  sortOrder: number;
  active: boolean;
  _count: { articles: number };
};

type FormState = {
  name: string;
  slug: string;
  description: string;
  color: string;
  icon: string;
  sortOrder: number;
  active: boolean;
};

const EMPTY: FormState = {
  name: "",
  slug: "",
  slugTouched: false,
  description: "",
  color: "#A16A1F",
  icon: "",
  sortOrder: 0,
  active: true,
} as unknown as FormState;

export function SectionsManager() {
  const { toast } = useToast();
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<SectionRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SectionRow | null>(null);
  const [moveTo, setMoveTo] = useState("none");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sections");
      const data = await res.json();
      setSections(data.sections ?? []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setForm({ ...EMPTY });
    setSlugTouched(false);
    setCreating(true);
  };

  const openEdit = (s: SectionRow) => {
    setForm({
      name: s.name,
      slug: s.slug,
      description: s.description ?? "",
      color: s.color ?? "#A16A1F",
      icon: s.icon ?? "",
      sortOrder: s.sortOrder,
      active: s.active,
    });
    setSlugTouched(true);
    setEditing(s);
  };

  const autoSlug = (name: string) => {
    if (slugTouched) return;
    const slug = name
      .trim()
      .toLowerCase()
      .replace(/[^\u0621-\u064Aa-z0-9\s-]/g, "")
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60);
    setForm((f) => ({ ...f, slug }));
  };

  const submitForm = async () => {
    if (!form.name.trim()) {
      toast("اسم القسم إلزامي", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(editing ? `/api/sections/${editing.id}` : "/api/sections", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          slug: form.slug,
          description: form.description,
          color: form.color,
          icon: form.icon,
          sortOrder: Number(form.sortOrder) || 0,
          active: form.active,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "تعذر الحفظ", "error");
        return;
      }
      toast(editing ? "حُدِّث القسم وانعكس على المنصة فورًا" : "أُنشئ القسم وصار ظاهرًا في المنصة", "success");
      setEditing(null);
      setCreating(false);
      load();
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/sections/${deleteTarget.id}?moveTo=${encodeURIComponent(moveTo)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "تعذر الحذف", "error");
        return;
      }
      toast(
        data.movedCount > 0
          ? `حُذف القسم ونُقلت ${data.movedCount} مقالة بأمان — لا روابط مكسورة`
          : "حُذف القسم — لم تكن فيه مقالات",
        "success",
      );
      setDeleteTarget(null);
      setMoveTo("none");
      load();
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (s: SectionRow) => {
    try {
      const res = await fetch(`/api/sections/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !s.active }),
      });
      if (res.ok) {
        toast(!s.active ? `ظهر قسم «${s.name}» في المنصة` : `أُخفي قسم «${s.name}» من المنصة`, "success");
        load();
      }
    } catch {}
  };

  const inputCls = "field";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-steel-900">إدارة الأقسام والتصنيفات</h1>
          <p className="mt-1 text-sm text-steel-500">
            أقسام المنصة تُدار من هنا بالكامل — أي تغيير يظهر على الموقع العام لحظة اعتماده.
          </p>
        </div>
        <Button onClick={openCreate}>+ قسم جديد</Button>
      </div>

      {loading ? (
        <Card className="p-10 text-center text-sm text-steel-400">جارٍ التحميل..</Card>
      ) : sections.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-sm font-bold text-steel-700">لا أقسام بعد</p>
          <p className="mt-2 text-xs text-steel-400">أنشئ أول قسم وسيظهر في قائمة المنصة فورًا.</p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {sections.map((s) => (
            <Card key={s.id} className="flex flex-wrap items-center gap-4 p-4">
              {/* الأيقونة واللون */}
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl"
                style={{ background: `${s.color || "#A16A1F"}1A`, color: s.color || "#A16A1F" }}
              >
                {s.icon || "•"}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold text-steel-900">{s.name}</p>
                  <code className="rounded bg-steel-100 px-1.5 py-0.5 text-[10px] text-steel-500" dir="ltr">
                    /section/{s.slug}
                  </code>
                  {s.active ? <Badge tone="success">ظاهر</Badge> : <Badge tone="neutral">مخفي</Badge>}
                </div>
                {s.description && (
                  <p className="mt-1 truncate text-xs text-steel-500">{s.description}</p>
                )}
              </div>

              <div className="flex items-center gap-4">
                <div className="text-center">
                  <p className="text-sm font-bold text-copper-700">{s._count.articles}</p>
                  <p className="text-[10px] text-steel-400">مقالة</p>
                </div>
                <span className="text-center text-sm font-bold text-steel-400" title="ترتيب الظهور">
                  #{s.sortOrder}
                </span>

                <Toggle checked={s.active} onChange={() => toggleActive(s)} label="" />

                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => openEdit(s)}>
                    تعديل
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => setDeleteTarget(s)}>
                    حذف
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* مودال الإضافة/التعديل */}
      <Modal
        open={creating || Boolean(editing)}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        title={editing ? `تعديل قسم: ${editing.name}` : "إضافة قسم جديد"}
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-bold text-steel-700">اسم القسم *</label>
              <input
                className={inputCls}
                value={form.name}
                onChange={(e) => {
                  setForm((f) => ({ ...f, name: e.target.value }));
                  autoSlug(e.target.value);
                }}
                placeholder="مثال: أوراق الحياة"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-steel-700">
                الرابط الدلالي (slug)
              </label>
              <input
                className={inputCls}
                dir="ltr"
                value={form.slug}
                onChange={(e) => {
                  setForm((f) => ({ ...f, slug: e.target.value }));
                  setSlugTouched(true);
                }}
                placeholder="section-slug"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-steel-700">وصف القسم</label>
            <textarea
              className={`${inputCls} resize-none leading-7`}
              rows={2}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="سطر يعرّف به القسم للقارئ.. يظهر في قائمة الأقسام."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-bold text-steel-700">أيقونة (إيموجي)</label>
              <input
                className={inputCls}
                value={form.icon}
                onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                placeholder="🌱"
                maxLength={4}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-steel-700">لون القسم</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  className="h-10 w-12 cursor-pointer rounded-lg border border-steel-200"
                  value={/^#[0-9A-Fa-f]{6}$/.test(form.color) ? form.color : "#A16A1F"}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                />
                <input
                  className={inputCls}
                  dir="ltr"
                  value={form.color}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  placeholder="#A16A1F"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-steel-700">ترتيب الظهور</label>
              <input
                type="number"
                className={inputCls}
                value={form.sortOrder}
                onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))}
              />
            </div>
          </div>

          <div className="rounded-xl border border-steel-100 p-3">
            <Toggle
              checked={form.active}
              onChange={(v) => setForm((f) => ({ ...f, active: v }))}
              label="ظاهر في المنصة العامة"
            />
          </div>

          {/* معاينة حية */}
          <div className="rounded-xl bg-steel-50 p-4">
            <p className="mb-2 text-[11px] font-bold text-steel-400">معاينة كما سيظهر:</p>
            <div className="flex items-center gap-3">
              <span
                className="flex h-9 w-9 items-center justify-center rounded-xl text-lg"
                style={{ background: `${/^#[0-9A-Fa-f]{6}$/.test(form.color) ? form.color : "#A16A1F"}1A`, color: /^#[0-9A-Fa-f]{6}$/.test(form.color) ? form.color : "#A16A1F" }}
              >
                {form.icon || "•"}
              </span>
              <div>
                <p className="text-sm font-bold text-steel-900">{form.name || "اسم القسم"}</p>
                {form.description && <p className="text-xs text-steel-500">{form.description}</p>}
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button onClick={submitForm} disabled={busy}>
              {busy ? "جارٍ الحفظ.." : editing ? "حفظ التعديلات" : "إنشاء القسم"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setCreating(false);
                setEditing(null);
              }}
            >
              إلغاء
            </Button>
          </div>
        </div>
      </Modal>

      {/* مودال الحذف الآمن */}
      <Modal open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title={`حذف قسم: ${deleteTarget?.name ?? ""}`}>
        {deleteTarget && deleteTarget._count.articles > 0 ? (
          <div className="space-y-4">
            <p className="text-sm leading-7 text-steel-600">
              هذا القسم يحتوي <strong className="text-copper-700">{deleteTarget._count.articles} مقالة</strong>.
              لتجنب كسر الروابط — اختر وجهة المقالات قبل الحذف:
            </p>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-steel-700">نقل المقالات إلى</label>
              <select className={inputCls} value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                <option value="none">— اتركها غير مصنفة (تبقى حية بلا قسم) —</option>
                {sections
                  .filter((s) => s.id !== deleteTarget.id)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>
        ) : (
          <p className="text-sm leading-7 text-steel-600">
            هذا القسم فارغ — يمكن حذفه بأمان دون أي أثر على المقالات.
          </p>
        )}

        <div className="mt-5 flex gap-3">
          <Button variant="danger" onClick={confirmDelete} disabled={busy}>
            {busy ? "جارٍ الحذف.." : "تأكيد الحذف"}
          </Button>
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
            تراجع
          </Button>
        </div>
      </Modal>
    </div>
  );
}
