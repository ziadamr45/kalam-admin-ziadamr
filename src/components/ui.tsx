"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

/* =================== عناصر واجهة مصغرة موحدة =================== */

export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline" | "danger" | "success";
  size?: "sm" | "md";
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-all duration-300 ease-fluid hover:-translate-y-px active:translate-y-0 disabled:opacity-50 disabled:pointer-events-none";
  const sizes = size === "sm" ? "px-3 py-1.5 text-xs" : "px-5 py-2.5 text-sm";
  const variants = {
    primary: "bg-copper-600 text-white shadow-soft hover:bg-copper-700",
    ghost: "text-steel-500 hover:bg-steel-100",
    outline: "border border-steel-200 text-steel-700 hover:border-copper-500 hover:text-copper-700",
    danger: "bg-danger-600 text-white shadow-soft hover:bg-danger-500",
    success: "bg-success-600 text-white shadow-soft hover:bg-success-500",
  };
  return (
    <button className={`${base} ${sizes} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warn" | "danger" | "copper" | "steel";
}) {
  const tones = {
    neutral: "bg-steel-100 text-steel-600",
    success: "bg-success-400/15 text-success-600",
    warn: "bg-warn-400/15 text-warn-500",
    danger: "bg-danger-400/15 text-danger-600",
    copper: "bg-copper-100 text-copper-700",
    steel: "bg-steel-800 text-steel-100",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-steel-100 bg-white shadow-soft ${className}`}>
      {children}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-steel-950/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white p-6 shadow-lift animate-fade-up ${wide ? "max-w-3xl" : "max-w-lg"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-steel-900">{title}</h3>
          <button onClick={onClose} aria-label="إغلاق" className="rounded-full p-2 text-steel-400 transition-colors hover:bg-steel-100">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-3"
    >
      <span className={`relative inline-block h-6 w-11 shrink-0 rounded-full transition-colors duration-300 ${checked ? "bg-success-500" : "bg-steel-200"}`}>
        <span
          className="absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-all duration-300 ease-fluid"
          style={{ right: checked ? "4px" : "24px" }}
        />
      </span>
      <span className="text-sm font-semibold text-steel-800">{label}</span>
    </button>
  );
}

/* =================== نظام التنبيهات (Toast) =================== */

type Toast = { id: number; message: string; tone: "success" | "error" | "info" };
const ToastContext = createContext<{ toast: (message: string, tone?: Toast["tone"]) => void }>({
  toast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, tone: Toast["tone"] = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4200);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-6 left-6 z-[70] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-xl px-5 py-3 text-sm font-bold text-white shadow-lift animate-fade-up ${
              t.tone === "success" ? "bg-success-600" : t.tone === "error" ? "bg-danger-600" : "bg-steel-800"
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* =================== بصمة الجهاز (Client) =================== */

export async function computeDeviceFingerprint(): Promise<string> {
  const parts: string[] = [
    navigator.userAgent,
    navigator.language,
    String(screen.width),
    String(screen.height),
    String(screen.colorDepth),
    String(new Date().getTimezoneOffset()),
    String(navigator.hardwareConcurrency || 0),
    String(navigator.maxTouchPoints || 0),
  ];

  // بصمة Canvas خفيفة
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 40;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.textBaseline = "top";
      ctx.font = "16px 'Readex Pro', sans-serif";
      ctx.fillStyle = "#a16a1f";
      ctx.fillText("كلام له لازمة ٢٠٢٦", 2, 2);
      ctx.strokeStyle = "rgba(13,22,38,0.4)";
      ctx.arc(50, 20, 12, 0, Math.PI * 2);
      ctx.stroke();
      parts.push(canvas.toDataURL().slice(-64));
    }
  } catch {}

  const raw = parts.join("|||");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* محرك وقت القراءة المبسط للمعاينة الحية في المحرر */
export function previewReadingTime(text: string): string {
  const stripped = (text || "").replace(/[\u064B-\u0652\u0670\u0640]/g, "");
  const words = stripped.split(/\s+/).filter(Boolean).length;
  const seconds = Math.max(30, Math.round((words / 190) * 60));
  const minutes = Math.max(1, Math.round(seconds / 60));
  const fmt = (n: number) => new Intl.NumberFormat("ar-EG").format(n);
  if (minutes === 1) return "دقيقة واحدة مركزة";
  if (minutes === 2) return "دقيقتان مركزتان";
  if (minutes <= 10) return `${fmt(minutes)} دقائق مركزة`;
  return `${fmt(minutes)} دقيقة مركزة`;
}

export function previewWordCount(text: string): number {
  return (text || "").replace(/[\u064B-\u0652\u0670\u0640]/g, "").split(/\s+/).filter(Boolean).length;
}
