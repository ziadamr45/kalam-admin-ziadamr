"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui";

/**
 * رافع الصور الذكي — سحب وإفلات أو نقرة واحدة:
 * معاينة لحظية، رفع سحابي مباشر (السيرفر يحفظ سرّ Cloudinary)،
 * وتقديم بأحدث صيغ الويب (WebP/AVIF) تلقائيًا لتسريع المنصة.
 */
export function ImageUploader({
  value,
  onChange,
  folder = "articles",
  label = "صورة الغلاف",
  aspect = "aspect-video",
}: {
  value: string;
  onChange: (url: string) => void;
  folder?: "articles" | "section";
  label?: string;
  aspect?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteUrl, setPasteUrl] = useState("");

  const upload = async (file: File) => {
    setError("");
    if (!file.type.startsWith("image/")) {
      setError("تُقبل الصور فقط (JPG / PNG / WebP)");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("الصورة أكبر من 8MB — اختر صورة أخف");
      return;
    }

    setBusy(true);
    setProgress(10);

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("filename", file.name);
      form.append("folder", folder);

      setProgress(40);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      setProgress(95);
      if (!res.ok) throw new Error(data?.error || "فشل الرفع");

      onChange(data.url);
      setProgress(100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر رفع الصورة");
    } finally {
      setBusy(false);
      setTimeout(() => setProgress(0), 800);
    }
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-xs font-bold text-steel-700">{label}</label>
        <button
          type="button"
          onClick={() => setPasteMode((v) => !v)}
          className="text-[11px] font-semibold text-steel-400 transition-colors hover:text-copper-700"
        >
          {pasteMode ? "↩ رجوع للرفع السحابي" : "لصق رابط خارجي بدلًا من الرفع"}
        </button>
      </div>

      {pasteMode ? (
        <div className="space-y-2">
          <input
            className="field"
            dir="ltr"
            value={pasteUrl}
            onChange={(e) => setPasteUrl(e.target.value)}
            placeholder="https://res.cloudinary.com/.."
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              if (/^https?:\/\//.test(pasteUrl.trim())) {
                onChange(pasteUrl.trim());
                setPasteUrl("");
                setPasteMode(false);
              }
            }}
          >
            اعتماد الرابط
          </Button>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file) upload(file);
            }}
            disabled={busy}
            className={`group relative w-full overflow-hidden rounded-2xl border-2 border-dashed transition-all ${
              dragging ? "border-copper-500 bg-copper-50" : "border-steel-200 hover:border-copper-400"
            }`}
          >
            {value ? (
              <div className={`relative ${aspect} w-full`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={value} alt="معاينة الصورة" className="absolute inset-0 h-full w-full object-cover" />
                {/* غطاء التغيير يظهر عند المرور أو الرفع */}
                <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs font-bold text-white opacity-0 transition-opacity group-hover:opacity-100">
                  {busy ? "جارٍ الرفع.." : "اضغط أو أفلِت صورة جديدة للاستبدال"}
                </span>
              </div>
            ) : (
              <div className={`flex ${aspect} w-full flex-col items-center justify-center gap-2 p-6`}>
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-steel-300">
                  <rect x="3" y="3" width="18" height="18" rx="3" />
                  <circle cx="9" cy="9" r="2" />
                  <path d="m21 15-4.2-4.2a1.8 1.8 0 0 0-2.6 0L6 19" />
                </svg>
                <p className="text-xs font-bold text-steel-500">
                  {busy ? "جارٍ الرفع إلى التخزين السحابي.." : "اسحب الصورة هنا أو انقر للاختيار من جهازك"}
                </p>
                <p className="text-[10px] text-steel-400">
                  JPG / PNG / WebP — حتى 8MB · تُحسَّن تلقائيًا بأحدث صيغ الويب
                </p>
              </div>
            )}
          </button>

          {/* شريط التقدم */}
          {progress > 0 && (
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-steel-100">
              <div
                className="h-full rounded-full bg-copper-600 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          {/* زر إزالة */}
          {value && !busy && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="mt-2 text-[11px] font-bold text-danger-600 hover:underline"
            >
              إزالة الصورة
            </button>
          )}
        </>
      )}

      {error && <p className="mt-2 text-[11px] font-bold text-danger-600">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
