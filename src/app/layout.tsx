import type { Metadata, Viewport } from "next";
import {
  Readex_Pro,
  Amiri,
  Amiri_Quran,
  Noto_Naskh_Arabic,
} from "next/font/google";
import "./globals.css";

const readex = Readex_Pro({
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-ui",
  display: "swap",
});

/* خطوط المعاينة الحية: أميري للنصوص، أميري قرآن للآيات، نسخ للأحاديث */
const amiri = Amiri({
  subsets: ["arabic", "latin"],
  weight: ["400", "700"],
  variable: "--font-body",
  display: "swap",
});

const amiriQuran = Amiri_Quran({
  weight: "400",
  subsets: ["arabic"],
  variable: "--font-quran",
  display: "swap",
});

const naskh = Noto_Naskh_Arabic({
  weight: ["400", "700"],
  subsets: ["arabic"],
  variable: "--font-naskh",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "لوحة التحكم | كلام له لازمة",
    template: "%s | كلام له لازمة",
  },
  description: "لوحة التحكم السيادية لمنصة كلام له لازمة",
  robots: { index: false, follow: false },
  /* PWA — شرط إشعارات iOS Safari: إضافة اللوحة للشاشة الرئيسية */
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0D1626",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${readex.variable} ${amiri.variable} ${amiriQuran.variable} ${naskh.variable}`}
    >
      <body className="font-ui">{children}</body>
    </html>
  );
}
