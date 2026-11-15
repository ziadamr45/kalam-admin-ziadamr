/**
 * شعار لوحة التحكم السيادية — حرف الكاف الهندسي الأصلي المحدد + ترس الإعدادات.
 * SVG متجهي حاد بحواف squircle ناعمة مطابقة للشعار المعتمد.
 */
export function AdminBrandMark({ className = "h-10 w-10 rounded-xl" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 128 128"
      fill="none"
      className={className}
      role="img"
      aria-label="شعار لوحة التحكم — كلام له لازمة"
    >
      <path
        d="M64 0 C110 0 128 18 128 64 C128 110 110 128 64 128 C18 128 0 110 0 64 C0 18 18 0 64 0 Z"
        fill="#0D1626"
      />
      {/* ترس الإعدادات في الزاوية اليسرى العليا */}
      <g transform="translate(29 33)" stroke="#B9832F" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="0" cy="0" r="6.2" fill="none" />
        <path d="M0 -11 L0 -8 M0 8 L0 11 M-11 0 L-8 0 M8 0 L11 0 M-7.8 -7.8 L-5.7 -5.7 M5.7 5.7 L7.8 7.8 M-7.8 7.8 L-5.7 5.7 M5.7 -5.7 L7.8 -7.8" />
      </g>
      {/* حرف الكاف الهندسي الأصلي المحدد — مقرب وواضح */}
      <g transform="translate(64 64) scale(1.12) translate(-64 -64)" style={{ filter: "drop-shadow(0 1.5px 2px rgba(0, 0, 0, 0.35))" }}>
        <path
          d="M98 25.5 L98 36.8 L72 48 C68.2 49.8 68.5 52.8 71.8 57.2 L83.5 72.5 C87.8 78.2 86 95 74 95 L28 95 L28 84.3 L70.8 84.3 C75.5 84.3 76.2 78.8 72.8 74 L60.2 56.8 C55.8 50.6 57.2 42.5 65 39 Z"
          fill="#D9A441"
        />
        <path
          d="M80.5 120.5 L46.5 120.5"
          stroke="#D9A441"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
