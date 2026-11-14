"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
      className="fixed inset-0 z-65 flex items-center justify-center bg-steel-950/60 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white p-4 shadow-lift animate-fade-up sm:p-6 ${wide ? "max-w-3xl" : "max-w-lg"}`}
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
          className="absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-300 ease-fluid"
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
      <div className="pointer-events-none fixed bottom-6 left-6 z-70 flex flex-col gap-2">
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

/* =================== نافذة التأكيد الموحدة (Confirm) ===================
   هوية اللوحة: الكحلي والنحاسي — بديل كامل لنوافذ المتصفح التقليدية:
   ممنوع window.confirm نهائيًا؛ كل تأكيد يمر من هنا عبر Promise،
   مرسومًا عبر createPortal بكشيدة نحاسية على سطح أبيض هادئ. */

type ConfirmTone = "copper" | "danger";

type ConfirmOptions = {
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
};

type ConfirmRequest = ConfirmOptions & { resolve: (ok: boolean) => void };

const ConfirmContext = createContext<(options: ConfirmOptions) => Promise<boolean>>(async () => false);

export function useConfirm() {
  /* نمط موحد مع useToast — تفكيك { confirm } في كل موضع استدعاء */
  const confirm = useContext(ConfirmContext);
  return { confirm };
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => setMounted(true), []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => setRequest({ ...options, resolve }));
  }, []);

  const settle = useCallback((ok: boolean) => {
    setRequest((r) => {
      r?.resolve(ok);
      return null;
    });
  }, []);

  /* Escape يلغي دائمًا — والتركيز الافتراضي للإلغاء في الخطر وللتأكيد في العادي */
  useEffect(() => {
    if (!request) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") settle(false);
    };
    document.addEventListener("keydown", onKey);
    const t = setTimeout(() => {
      if (request.tone === "danger") cancelBtnRef.current?.focus();
      else confirmBtnRef.current?.focus();
    }, 60);
    return () => {
      document.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [request, settle]);

  const isDanger = request?.tone === "danger";

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {mounted &&
        request &&
        createPortal(
          <div className="fixed inset-0 z-90 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={request.title}>
            <div className="absolute inset-0 animate-fade-in bg-[#0d1626]/72 backdrop-blur-sm" onClick={() => settle(false)} />
            <div className="relative flex max-h-[calc(100dvh_-_2rem)] w-full max-w-sm animate-fade-up flex-col overflow-hidden rounded-2xl border border-steel-200 bg-white shadow-lift">
              {/* الكشيدة النحاسية العلوية — توقيع الهوية الإدارية */}
              <div className="h-1 w-full shrink-0 bg-gradient-to-l from-copper-600 via-copper-500 to-copper-600" aria-hidden />

              <div className="flex-1 overflow-y-auto overscroll-contain px-6 pb-6 pt-7 text-center">
                <div
                  className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl"
                  style={{ background: isDanger ? "#FEE2E2" : "#F5EBD3", color: isDanger ? "#B91C1C" : "#84531B" }}
                  aria-hidden
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.2 3.8c-5.8.4-10.5 4-12.5 9.4L3 21l7.9-4.7c5.4-2 9-6.7 9.3-12.5Z" />
                    <path d="M6.5 17.5 13 11" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-steel-900">{request.title}</h3>
                <p className="mt-2 text-[13px] leading-7 text-steel-500">{request.body}</p>
                <div className="mt-5 flex items-center justify-center gap-3">
                  <button
                    ref={cancelBtnRef}
                    onClick={() => settle(false)}
                    className="rounded-xl bg-steel-100 px-5 py-2.5 text-xs font-bold text-steel-600 transition-all hover:bg-steel-200 active:translate-y-0"
                  >
                    {request.cancelLabel ?? "تراجع"}
                  </button>
                  <button
                    ref={confirmBtnRef}
                    onClick={() => settle(true)}
                    className={`rounded-xl px-5 py-2.5 text-xs font-bold text-white shadow-soft transition-all ${
                      isDanger ? "bg-danger-600 hover:bg-danger-500" : "bg-copper-600 hover:bg-copper-700"
                    }`}
                  >
                    {request.confirmLabel ?? "تأكيد"}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </ConfirmContext.Provider>
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
