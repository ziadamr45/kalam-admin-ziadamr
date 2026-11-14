/**
 * شعار لوحة التحكم السيادية — حرف الكاف الهندسي الأصلي + ترس الإعدادات.
 * SVG متجهي حاد لا يتأثر بكاش الصور ويحافظ على نفس المقاسات في كل موضع.
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
      <rect width="128" height="128" rx="28" fill="#0D1626" />
      {/* ترس الإعدادات في الزاوية اليسرى العليا */}
      <g transform="translate(31 34)" stroke="#B9832F" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="0" cy="0" r="6.2" fill="none" />
        <path d="M0 -11 L0 -8 M0 8 L0 11 M-11 0 L-8 0 M8 0 L11 0 M-7.8 -7.8 L-5.7 -5.7 M5.7 5.7 L7.8 7.8 M-7.8 7.8 L-5.7 5.7 M5.7 -5.7 L7.8 -7.8" />
      </g>
      {/* حرف الكاف الهندسي الأصلي بحواف مقطوعة */}
      <path
        d="M98 25 L98 37 L67 51 Q64 52.5 66 55 L82 81 Q87 95 72 95 L28 95 L28 84 L69 84 Q72 84 70 81 L55 56 Q49 44 61 39 Z"
        fill="#D9A441"
      />
      {/* خط اللازمة السفلي */}
      <path
        d="M81 118 L47 118"
        stroke="#D9A441"
        strokeWidth="4.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
