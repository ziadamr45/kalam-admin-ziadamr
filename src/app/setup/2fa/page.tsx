"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * تفعيل 2FA إلزامي عند أول دخول — لا جلسة كاملة قبل ربط
 * تطبيق توثيق (Google Authenticator / 1Password)
 */
export default function Setup2FAPage() {
  const router = useRouter();
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/setup")
      .then(async (res) => {
        if (!res.ok) {
          router.push("/login");
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data) {
          setQrDataUrl(data.qrDataUrl);
          setSecret(data.secret);
        }
      })
      .catch(() => router.push("/login"))
      .finally(() => setLoading(false));
  }, [router]);

  const enable = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");
      setBusy(true);
      try {
        const res = await fetch("/api/auth/setup/enable", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "الرمز غير صحيح.. تأكد من الوقت على جهازك");
          return;
        }
        router.push("/");
        router.refresh();
      } catch {
        setError("تعذر الاتصال");
      } finally {
        setBusy(false);
      }
    },
    [code, router],
  );

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-steel-900 via-steel-800 to-steel-950 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-bold text-white">تفعيل التحقق بخطوتين (إلزامي)</h1>
          <p className="mt-2 text-xs leading-6 text-steel-300">
            هذا الإجراء يُنفَّذ مرة واحدة. امسح رمز QR بتطبيق Google Authenticator أو 1Password،
            ثم أدخل الرمز المتغير الظاهر لتفعيل الدرع النهائي.
          </p>
        </div>

        <div className="rounded-2xl border border-steel-700 bg-steel-800/80 p-6 shadow-lift">
          {loading ? (
            <p className="py-8 text-center text-sm text-steel-300">جارٍ توليد المفتاح الآمن..</p>
          ) : (
            <form onSubmit={enable} className="space-y-5">
              {qrDataUrl && (
                <div className="flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrDataUrl} alt="QR Code لتفعيل 2FA" className="rounded-2xl bg-white p-3 shadow-lift" width={200} height={200} />
                </div>
              )}

              <div>
                <p className="mb-1.5 text-xs font-bold text-steel-200">
                  أو أدخل المفتاح يدويًا في التطبيق:
                </p>
                <code
                  dir="ltr"
                  className="block break-all rounded-xl bg-steel-900/70 p-3 text-[11px] tracking-wider text-copper-300"
                >
                  {secret}
                </code>
              </div>

              <input
                type="text"
                inputMode="numeric"
                required
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="field bg-steel-900/60 text-center text-2xl font-bold tracking-[0.5em] text-steel-50"
                placeholder="––––––"
                dir="ltr"
              />

              {error && <p className="text-xs font-bold text-danger-400">{error}</p>}

              <button
                type="submit"
                disabled={busy || code.length !== 6}
                className="w-full rounded-xl bg-copper-600 py-3 text-sm font-bold text-white shadow-soft transition-all hover:bg-copper-500 disabled:opacity-50"
              >
                {busy ? "جارٍ التفعيل.." : "تفعيل الدرع وفتح اللوحة"}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
