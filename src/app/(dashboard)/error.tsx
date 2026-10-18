"use client";

/*
 * حدود أخطاء لوحة التحكم — أي عطل في أي صفحة يظهر كبطاقة نظيفة
 * بدل انهيار التخطيط. النصوص كلها قابلة للالتفاف حتى لا يتمدد
 * العرض أفقيًا على الجوال (سبب "وضع الكمبيوتر" المفاجئ سابقًا).
 */

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-steel-200 bg-white p-8 text-center shadow-soft">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-danger-400/15 text-xl font-bold text-danger-600">
          !
        </div>
        <h1 className="text-lg font-bold text-steel-800">حدث عطل في هذه اللوحة</h1>
        <p className="mt-3 text-sm leading-7 text-steel-500">
          لم يكن بإمكاننا عرض هذا القسم لحظةً.. جرّب إعادة المحاولة،
          <br />
          وإن تكرر فالبقية من اللوحة تعمل بشكل طبيعي.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-xl bg-copper-600 px-5 py-2.5 text-sm font-bold text-white shadow-soft transition-all hover:bg-copper-500"
          >
            إعادة المحاولة
          </button>
          <a
            href="/"
            className="rounded-xl border border-steel-200 px-5 py-2.5 text-sm font-bold text-steel-600 transition-colors hover:bg-steel-50"
          >
            الصفحة الرئيسية
          </a>
        </div>
        {error?.digest ? (
          <p className="mt-5 text-[10px] text-steel-300" style={{ overflowWrap: "anywhere" }}>
            رمز التتبع: {error.digest}
          </p>
        ) : null}
      </div>
    </main>
  );
}
