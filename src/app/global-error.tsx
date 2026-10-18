"use client";

/* آخر خط دفاع — خطأ خارج التخطيط الجذري كليًا. واجهة مستقلة بسيطة تعمل دائمًا */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          background: "#0D1626",
          margin: 0,
          color: "#e2e8f0",
        }}
      >
        <main
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
        >
          <div style={{ textAlign: "center", maxWidth: "28rem" }}>
            <h1 style={{ fontSize: "1.4rem", fontWeight: 700 }}>حدث عطل لحظي</h1>
            <p style={{ marginTop: "1rem", lineHeight: 2, color: "#94a3b8" }}>
              جرّب إعادة المحاولة.. وإن تكرر فتواصل مع صاحب المنصة.
            </p>
            <button
              onClick={reset}
              style={{
                marginTop: "1.5rem",
                borderRadius: "0.75rem",
                padding: "0.75rem 1.5rem",
                fontSize: "0.875rem",
                fontWeight: 700,
                background: "#b45309",
                color: "#fff",
                border: "none",
                cursor: "pointer",
              }}
            >
              إعادة المحاولة
            </button>
            {error?.digest ? (
              <p style={{ marginTop: "1.25rem", fontSize: "0.65rem", color: "#64748b", overflowWrap: "anywhere" }}>
                رمز التتبع: {error.digest}
              </p>
            ) : null}
          </div>
        </main>
      </body>
    </html>
  );
}
