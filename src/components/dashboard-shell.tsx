"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { ToastProvider } from "@/components/ui";

const NAV = [
  { href: "/", label: "التحليلات الحية", icon: "chart" },
  { href: "/articles", label: "المقالات", icon: "doc" },
  { href: "/comments", label: "مركز التعليقات", icon: "chat" },
  { href: "/users", label: "المستخدمون", icon: "users" },
  { href: "/checklist", label: "معايير النشر", icon: "check" },
  { href: "/security", label: "الأمن والإعدادات", icon: "shield" },
] as const;

function NavIcon({ name }: { name: (typeof NAV)[number]["icon"] }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "chart":
      return <svg {...common}><path d="M3 3v18h18" /><path d="M7 15l4-6 4 3 5-8" /></svg>;
    case "doc":
      return <svg {...common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 13h6M9 17h6" /></svg>;
    case "chat":
      return <svg {...common}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
    case "users":
      return <svg {...common}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
    case "check":
      return <svg {...common}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>;
    case "shield":
      return <svg {...common}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>;
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

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/login");
    router.refresh();
  };

  return (
    <ToastProvider>
      <div className="flex min-h-screen bg-steel-50">
        {/* الشريط الجانبي الكحلي */}
        <aside
          className={`fixed inset-y-0 right-0 z-40 w-64 transform bg-steel-900 transition-transform duration-300 ease-fluid lg:static lg:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
          }`}
        >
          <div className="flex h-full flex-col">
            <div className="border-b border-steel-800 p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-copper-500/15 text-lg font-bold text-copper-400">
                  ك
                </div>
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
                onClick={logout}
                className="w-full rounded-xl bg-steel-800 px-4 py-2.5 text-xs font-bold text-steel-200 transition-colors hover:bg-danger-600 hover:text-white"
              >
                تسجيل الخروج
              </button>
            </div>
          </div>
        </aside>

        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-steel-950/60 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* المحتوى */}
        <div className="flex min-w-0 flex-1 flex-col">
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
              <Link
                href={process.env.NEXT_PUBLIC_ADMIN_URL?.includes("admin") ? "/" : "/"}
                className="rounded-xl border border-steel-200 px-3 py-1.5 text-xs font-bold text-steel-600 transition-colors hover:border-copper-500 hover:text-copper-700"
                onClick={(e) => e.preventDefault()}
              >
                جلسة آمنة نشطة
              </Link>
            </div>
          </header>

          <main className="flex-1 p-4 lg:p-8">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
