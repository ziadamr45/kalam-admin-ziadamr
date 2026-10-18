"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Toggle, useToast } from "@/components/ui";
import type { SiteConfig } from "@/lib/site-config";

export function SiteSettingsForm() {
  const { toast } = useToast();
  const [cfg, setCfg] = useState<SiteConfig | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/site-settings");
      const data = await res.json();
      setCfg(data.config);
    } catch {}
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!cfg) return;
    setBusy(true);
    try {
      const res = await fetch("/api/site-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "تعذر الحفظ", "error");
        return;
      }
      setCfg(data.config);
      toast("حُفظت الإعدادات وانعكس أثرها على المنصة العامة فورًا", "success");
    } finally {
      setBusy(false);
    }
  };

  if (!cfg) {
    return <Card className="p-10 text-center text-sm text-steel-400">جارٍ تحميل الإعدادات..</Card>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-steel-900">مركز تحكم الموقع العامة</h1>
        <p className="mt-1 text-sm text-steel-500">
          كل ما يظهر للقرّاء في المنصة تحت سيطرتك — بضغطة زر تنعكس فورًا دون نشر جديد.
        </p>
      </div>

      {/* الميتا */}
      <Card className="space-y-4 p-6">
        <h2 className="text-sm font-bold text-steel-800">الهوية البصرية في محركات البحث والروابط</h2>
        <div>
          <label className="mb-1.5 block text-xs font-bold text-steel-700">
            عنوان الموقع الوصفي (Meta Title)
          </label>
          <input
            className="field"
            value={cfg.SITE_META_TITLE}
            onChange={(e) => setCfg({ ...cfg, SITE_META_TITLE: e.target.value })}
            maxLength={120}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold text-steel-700">
            وصف الموقع (Meta Description)
          </label>
          <textarea
            className="field resize-none leading-7"
            rows={3}
            value={cfg.SITE_META_DESC}
            onChange={(e) => setCfg({ ...cfg, SITE_META_DESC: e.target.value })}
            maxLength={400}
          />
          <p className="mt-1 text-[11px] text-steel-400">{cfg.SITE_META_DESC.length} / 400 حرف</p>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold text-steel-700">نص أسفل الفوتر</label>
          <input
            className="field"
            value={cfg.FOOTER_TEXT}
            onChange={(e) => setCfg({ ...cfg, FOOTER_TEXT: e.target.value })}
            maxLength={300}
          />
        </div>
      </Card>

      {/* مفاتيح السيطرة */}
      <Card className="space-y-4 p-6">
        <h2 className="text-sm font-bold text-steel-800">مفاتيح السيطرة الفورية</h2>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-steel-100 p-4">
          <div className="min-w-0">
            <p className="text-sm font-bold text-steel-900">
              قسم التعليقات والحوار
            </p>
            <p className="mt-1 text-xs leading-6 text-steel-500">
              مفتاح الإيقاف الفوري (Kill Switch) — عند إيقافه يختفي نموذج التعليق من كل المقالات
              ويظهر إشعار لطيف للقرّاء، والتعليقات السابقة تُخفى حتى إعادة التفعيل.
            </p>
          </div>
          <Toggle
            checked={cfg.COMMENTS_ENABLED}
            onChange={(v) => setCfg({ ...cfg, COMMENTS_ENABLED: v })}
            label={cfg.COMMENTS_ENABLED ? "الحوار يعمل" : "الحوار متوقف"}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-steel-100 p-4">
          <div className="min-w-0">
            <p className="text-sm font-bold text-steel-900">وضع التشكيل عامًا</p>
            <p className="mt-1 text-xs leading-6 text-steel-500">
              عند إيقافه يختفي زر التشكيل من كل المقالات — ويمكنك أيضًا تعطيل التشكيل
              لمقال واحد على حدة من محرر المقالات.
            </p>
          </div>
          <Toggle
            checked={cfg.TASHKEEL_ENABLED}
            onChange={(v) => setCfg({ ...cfg, TASHKEEL_ENABLED: v })}
            label={cfg.TASHKEEL_ENABLED ? "متاح للقرّاء" : "معطل عامًا"}
          />
        </div>
      </Card>

      <div className="sticky bottom-4">
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-xs text-steel-400">
            تُطبق التغييرات على المنصة العامة لحظة الحفظ عبر إعادة التحقق الفوري.
          </p>
          <Button onClick={save} disabled={busy}>
            {busy ? "جارٍ الحفظ.." : "حفظ الإعدادات"}
          </Button>
        </Card>
      </div>
    </div>
  );
}
