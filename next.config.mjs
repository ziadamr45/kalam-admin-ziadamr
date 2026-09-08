/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    /* اكتشاف OAuth القياسي — يوجّه /.well-known/* إلى المسار الجامع */
    return [{ source: "/.well-known/:path*", destination: "/api/well-known/:path*" }];
  },
  async headers() {
    return [
      {
        /* كل المسارات ما عدا صفحة التفويض OAuth — الأشد صرامة */
        source: "/((?!api/mcp/oauth).*)",
        headers: securityHeaders,
      },
      {
        /* صفحة تفويض MCP: بلا X-Frame-Options كي يستطيع Gemini عرضها
           في نافذة/إطار الربط، مع CSP frame-ancestors مفتوح */
        source: "/api/mcp/oauth/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
        ],
      },
    ];
  },
};

export default nextConfig;
