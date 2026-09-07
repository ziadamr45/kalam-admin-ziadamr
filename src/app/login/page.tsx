"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { computeDeviceFingerprint } from "@/components/ui";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";

  const [step, setStep] = useState<"credentials" | "totp">("credentials");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [lockInfo, setLockInfo] = useState("");

  /* بصمة الجهاز تُحسب مسبقًا وتُرفض الأجهزة غير المعتمدة إن كان الحظر مفعلًا */
  const [fingerprint, setFingerprint] = useState("");
  useEffect(() => {
    computeDeviceFingerprint().then(setFingerprint).catch(() => {});
  }, []);

  const submitCredentials = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");
      setLockInfo("");
      setBusy(true);
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password, fingerprint }),
        });
        const data = await res.json();
        if (res.status === 429) {
          setLockInfo(data.error || "تم حظر المحاولات مؤقتًا.. انتظر ثم أعد المحاولة");
          return;
        }
        if (!res.ok) {
          setError(data.error || "بيانات الدخول غير صحيحة");
          return;
        }
        if (data.next === "setup2fa") {
          router.push("/setup/2fa");
          return;
        }
        if (data.next === "totp") {
          setStep("totp");
          setPassword("");
          return;
        }
      } catch {
        setError("تعذر الاتصال بالخادم");
      } finally {
        setBusy(false);
      }
    },
    [fingerprint, password, router, username],
  );

  const submitTotp = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");
      setBusy(true);
      try {
        const res = await fetch("/api/auth/verify-2fa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, fingerprint, trustDevice: true }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "الرمز غير صحيح");
          return;
        }
        router.push(next);
        router.refresh();
      } catch {
        setError("تعذر الاتصال بالخادم");
      } finally {
        setBusy(false);
      }
    },
    [code, fingerprint, next, router],
  );

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-steel-900 via-steel-800 to-steel-950 p-4">
      <div className="w-full max-w-sm">
        {/* الهوية */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-copper-500/15 text-2xl font-bold text-copper-400 shadow-lift">
            ك
          </div>
          <h1 className="text-xl font-bold text-white">لوحة التحكم السيادية</h1>
          <p className="mt-1 text-xs text-steel-300">كلام له لازمة — دخول محمي بطبقتين</p>
        </div>

        <div className="rounded-2xl border border-steel-700 bg-steel-800/80 p-6 shadow-lift backdrop-blur">
          {step === "credentials" ? (
            <form onSubmit={submitCredentials} className="space-y-4">
              <div>
                <label htmlFor="username" className="mb-1.5 block text-xs font-bold text-steel-200">
                  اسم المستخدم
                </label>
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="field bg-steel-900/60 text-steel-50 placeholder:text-steel-400"
                  placeholder="اسم المالك"
                />
              </div>
              <div>
                <label htmlFor="password" className="mb-1.5 block text-xs font-bold text-steel-200">
                  كلمة المرور
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="field bg-steel-900/60 text-steel-50 placeholder:text-steel-400"
                  placeholder="••••••••••••"
                />
              </div>

              {error && <p className="text-xs font-bold text-danger-400">{error}</p>}
              {lockInfo && (
                <p className="rounded-xl bg-danger-600/15 p-3 text-xs font-bold text-danger-400">
                  {lockInfo}
                </p>
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-xl bg-copper-600 py-3 text-sm font-bold text-white shadow-soft transition-all hover:bg-copper-500 disabled:opacity-50"
              >
                {busy ? "جارٍ التحقق.." : "متابعة"}
              </button>
            </form>
          ) : (
            <form onSubmit={submitTotp} className="space-y-4">
              <div className="rounded-xl bg-steel-900/60 p-4 text-center">
                <p className="text-xs font-bold text-steel-200">
                  أدخل الرمز السري المتغير اللحظي
                </p>
                <p className="mt-1 text-[11px] leading-5 text-steel-300">
                  من تطبيق Google Authenticator أو 1Password — لا يمكن الدخول بدون هذا الرمز حتى لو كُشفت كلمة المرور.
                </p>
              </div>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="field bg-steel-900/60 text-center text-2xl font-bold tracking-[0.5em] text-steel-50"
                placeholder="––––––"
                dir="ltr"
                autoFocus
              />

              {error && <p className="text-xs font-bold text-danger-400">{error}</p>}

              <button
                type="submit"
                disabled={busy || code.length !== 6}
                className="w-full rounded-xl bg-copper-600 py-3 text-sm font-bold text-white shadow-soft transition-all hover:bg-copper-500 disabled:opacity-50"
              >
                {busy ? "جارٍ التحقق.." : "فتح اللوحة"}
              </button>
              <button
                type="button"
                onClick={() => setStep("credentials")}
                className="w-full text-center text-xs text-steel-300 transition-colors hover:text-steel-100"
              >
                رجوع لتغيير بيانات الدخول
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-[10px] leading-5 text-steel-400">
          كل محاولة دخول تُسجَّل وتُرصد: IP، جهاز، وقت — والدخول من جهاز غير موثوق يطلق تنبيهًا أمنيًا فوريًا.
        </p>
      </div>
    </main>
  );
}
