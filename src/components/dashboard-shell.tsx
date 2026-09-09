"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useState } from "react";
import { ToastProvider } from "@/components/ui";
import { PushToggle } from "@/components/push-toggle";
import { SovereignTerminal } from "@/components/sovereign-terminal";
import { AdminNotificationBell, AdminUrgentBar } from "@/components/notification-center";
import { SOCIAL_LINKS } from "@/lib/constants/socials";

/**
 * حالة فتح القائمة الجانبية — يقرأها أي مكوّن داخل الغلاف
 * (كشريط إجراءات محرر المقال) ليخفي نفسه حين ينزلق الدرج فوقه.
 */
const SidebarOpenContext = createContext(false);
export const useSidebarOpen = () => useContext(SidebarOpenContext);

const NAV = [
  { href: "/", label: "التحليلات الحية", icon: "chart" },
  { href: "/analytics", label: "تحليلات الأداء", icon: "pulse" },
  { href: "/system", label: "مرصد النظام الحي", icon: "monitor" },
  { href: "/articles", label: "المقالات", icon: "doc" },
  { href: "/sections", label: "الأقسام والتصنيفات", icon: "tag" },
  { href: "/comments", label: "مركز التعليقات", icon: "chat" },
  { href: "/users", label: "المستخدمون", icon: "users" },
  { href: "/audit", label: "النشاط والشفافية", icon: "activity" },
  { href: "/ledger", label: "السجل السيادي", icon: "ledger" },
  { href: "/messages", label: "رسائل التواصل", icon: "mail" },
  { href: "/proposals", label: "المقترحات الفكرية", icon: "star" },
  { href: "/notifications", label: "مركز الإشعارات الجماهيرية", icon: "bell" },
  { href: "/legal-pages", label: "الصفحات القانونية", icon: "scroll" },
  { href: "/config", label: "استوديو التكوين السيادي", icon: "globe" },
  { href: "/site-settings", label: "إعدادات الموقع", icon: "sliders" },
  { href: "/checklist", label: "معايير النشر", icon: "check" },
  { href: "/security", label: "الأمن والحماية", icon: "shield" },
] as const;

function NavIcon({ name }: { name: string }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "chart":
      return <svg {...common}><path d="M3 3v18h18" /><path d="M7 15l4-6 4 3 5-8" /></svg>;
    case "pulse":
      return <svg {...common}><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>;
    case "doc":
      return <svg {...common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 13h6M9 17h6" /></svg>;
    case "tag":
      return <svg {...common}><path d="M20.6 13.4 12 22 2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8Z" /><circle cx="7.5" cy="7.5" r="1" fill="currentColor" /></svg>;
    case "chat":
      return <svg {...common}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
    case "users":
      return <svg {...common}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
    case "activity":
      return <svg {...common}><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>;
    case "mail":
      return <svg {...common}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></svg>;
    case "star":
      return <svg {...common}><path d="M12 2l2.6 6.2L21 9l-4.9 4.3L17.5 20 12 16.6 6.5 20l1.4-6.7L3 9l6.4-.8L12 2z" /></svg>;
    case "bell":
      return <svg {...common}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>;
    case "scroll":
      return <svg {...common}><path d="M8 21h12a2 2 0 0 0 2-2v-2H10v2a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v3h4" /><path d="M19 17V5a2 2 0 0 0-2-2H4" /></svg>;
    case "sliders":
      return <svg {...common}><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" /></svg>;
    case "check":
      return <svg {...common}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>;
    case "shield":
      return <svg {...common}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>;
    case "monitor":
      return <svg {...common}><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></svg>;
    case "globe":
      return <svg {...common}><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>;
    case "terminal":
      return <svg {...common}><path d="m4 17 6-6-6-6M12 19h8" /></svg>;
    case "ledger":
      return <svg {...common}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /><path d="M9 7h7M9 11h5" /></svg>;
  }
}

export function DashboardShell({
  username,
  children,
}: {
  username: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);

  const toggleTerminal = () => setTerminalOpen((v) => !v);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/login");
    router.refresh();
  };

  return (
    <ToastProvider>
      <SidebarOpenContext.Provider value={sidebarOpen}>
      <div className="flex min-h-screen overflow-x-clip bg-steel-50">
        {/* الشريط الجانبي الكحلي — أعلى طبقة على الإطلاق (z-[60]) ينزلق فوق كل عناصر الصفحة */}
        <aside
          className={`fixed inset-y-0 right-0 z-[60] w-64 transform bg-steel-900 transition-transform duration-300 ease-fluid lg:static lg:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
          }`}
        >
          <div className="flex h-full flex-col">
            <div className="border-b border-steel-800 p-5">
              <div className="flex items-center gap-3">
                {/* هوية اللوحة — حجم ناعم يندمج مع صفة الحساب دون حشو */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/icons/icon-192.png"
                  alt=""
                  width={40}
                  height={40}
                  className="h-10 w-10 rounded-xl"
                />
                <div>
                  <p className="text-sm font-bold text-white">لوحة التحكم</p>
                  <p className="text-[10px] text-steel-300">كلام له لازمة</p>
                </div>
              </div>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto p-3">
              {NAV.map((item) => {
                const active =
                  item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
                      active
                        ? "bg-copper-600/20 text-copper-400"
                        : "text-steel-200 hover:bg-steel-800 hover:text-white"
                    }`}
                  >
                    <NavIcon name={item.icon} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="border-t border-steel-800 p-4">
              {/* الحسابات التقنية الرسمية — من المصدر الموحد للروابط */}
              <div className="mb-3 flex items-center gap-2 px-2">
                <a
                  href={SOCIAL_LINKS.github}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-semibold text-steel-400 transition-colors hover:text-white"
                  title="جيت هاب"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1.5A10.5 10.5 0 0 0 8.7 22c.5.1.7-.2.7-.5v-1.8c-2.9.6-3.5-1.4-3.5-1.4-.5-1.2-1.2-1.5-1.2-1.5-.9-.7.1-.7.1-.7 1 .1 1.6 1.1 1.6 1.1.9 1.6 2.5 1.1 3.1.9.1-.7.4-1.1.7-1.4-2.3-.3-4.8-1.2-4.8-5.1 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .9-.3 2.8 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7.7.7 1 1.6 1 2.7 0 3.9-2.4 4.8-4.7 5.1.4.3.7.9.7 1.9V21.5c0 .3.2.6.7.5A10.5 10.5 0 0 0 12 1.5Z" /></svg>
                  GitHub
                </a>
                <a
                  href={SOCIAL_LINKS.portfolio}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-semibold text-steel-400 transition-colors hover:text-white"
                  title="الموقع الشخصي"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9.5" /><path d="M2.5 12h19M12 2.5c2.5 2.6 3.8 5.9 3.8 9.5S14.5 18.9 12 21.5c-2.5-2.6-3.8-5.9-3.8-9.5S9.5 5.1 12 2.5Z" /></svg>
                  Portfolio
                </a>
                <a
                  href={SOCIAL_LINKS.email}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-semibold text-steel-400 transition-colors hover:text-white"
                  title="الدعم عبر البريد"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2.5" y="4.5" width="19" height="15" rx="2.5" /><path d="m3.5 6.5 8.5 6.5 8.5-6.5" /></svg>
                  Support
                </a>
              </div>
              <div className="mb-3 flex items-center gap-3 px-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-steel-700 text-sm font-bold text-steel-100">
                  {username.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-white">{username}</p>
                  <p className="text-[10px] text-steel-400">صاحب المنصة</p>
                </div>
              </div>
              <button
                onClick={toggleTerminal}
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition-all ${
                  terminalOpen
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "bg-steel-800/60 text-steel-200 hover:bg-steel-800 hover:text-emerald-300"
                }`}
                title="اختصار: Ctrl + ~"
              >
                <NavIcon name="terminal" />
                التيرمينال السيادي
                <span className="mr-auto rounded-md border border-steel-600 px-1.5 py-0.5 font-mono text-[9px] text-steel-400">Ctrl+~</span>
              </button>
              <button
                onClick={logout}
                className="mt-2 w-full rounded-xl bg-steel-800 px-4 py-2.5 text-xs font-bold text-steel-200 transition-colors hover:bg-danger-600 hover:text-white"
              >
                تسجيل الخروج
              </button>
            </div>
          </div>
        </aside>

        {sidebarOpen && (
          <div
            className="fixed inset-0 z-[55] bg-steel-950/60 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* المحتوى */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* شريط الطوارئ السيادي — التنبيهات الإدارية الطارئة بالبرتقالي والأحمر */}
          <AdminUrgentBar />
          <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-steel-100 bg-white/90 px-4 backdrop-blur lg:px-8">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-xl p-2 text-steel-600 hover:bg-steel-100 lg:hidden"
              aria-label="فتح القائمة"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 12h18M3 6h18M3 18h18" /></svg>
            </button>
            <div className="hidden items-center gap-2 lg:flex">
              <span className="text-xs text-steel-400">الوضع: أمن مشدد — تحقق بخطوتين إلزامي</span>
            </div>
            <div className="flex items-center gap-2">
              {/* مركز الإشعارات السيادية — جرس أحداث السيادة بعداد لحظي (SSE) */}
              <AdminNotificationBell />
              {/* تفعيل الإشعارات الفورية — هاتف الأدمن وحاسوبه (المحور الأول) */}
              <PushToggle />
              {/* فتح التيرمينال السيادي من الشريط العلوي أيضًا */}
              <button
                onClick={toggleTerminal}
                className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-bold transition-all ${
                  terminalOpen
                    ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-600"
                    : "border-steel-200 text-steel-500 hover:border-emerald-400/40 hover:text-emerald-600"
                }`}
                title="التيرمينال السيادي (Ctrl + ~)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m4 17 6-6-6-6M12 19h8" /></svg>
                <span className="hidden sm:inline">CLI</span>
              </button>
              <span
                className="flex items-center gap-2 rounded-xl border border-success-400/30 bg-success-400/10 px-3 py-1.5 text-xs font-bold text-success-600"
                title="جلسة JWT محصنة — HttpOnly + Secure + SameSite=Strict"
              >
                <span className="h-2 w-2 rounded-full bg-success-500" />
                جلسة آمنة نشطة
              </span>
            </div>
          </header>

          <main className="flex-1 p-4 lg:p-8">{children}</main>
        </div>
      </div>

      {/* التيرمينال السيادي — طبقة عليا فوق كل شيء (z-80) */}
      <SovereignTerminal open={terminalOpen} onToggle={toggleTerminal} />
      </SidebarOpenContext.Provider>
    </ToastProvider>
  );
}
