"use client";

/* حدود أخطاء صفحات الدخول والإعداد — بطاقة نظيفة متوافقة مع الجوال */

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-steel-900 via-steel-800 to-steel-950 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-steel-700 bg-steel-800/80 p-8 text-center shadow-lift backdrop-blur">
        <h1 className="text-lg font-bold text-white">حدث عطل لحظي</h1>
        <p className="mt-3 text-sm leading-7 text-steel-300">
          جرّب إعادة المحاولة.. وإن تكرر فتواصل مع صاحب المنصة.
        </p>
        <button
          onClick={reset}
          className="mt-6 w-full rounded-xl bg-copper-600 py-3 text-sm font-bold text-white shadow-soft transition-all hover:bg-copper-500"
        >
          إعادة المحاولة
        </button>
        {error?.digest ? (
          <p className="mt-4 text-[10px] text-steel-400" style={{ overflowWrap: "anywhere" }}>
            رمز التتبع: {error.digest}
          </p>
        ) : null}
      </div>
    </main>
  );
}
