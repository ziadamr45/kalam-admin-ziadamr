"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Badge, Card } from "@/components/ui";

type OverviewData = {
  visitsToday: number;
  visitsThisWeek: number;
  weeklyDelta: number;
  completedToday: number;
  completionRate: number;
  likesTotal: number;
  dislikesTotal: number;
  commentsPending: number;
  sharesTotal: number;
  publishedCount: number;
  scheduledCount: number;
  usersTotal: number;
  usersThisWeek: number;
  engagedUsers: number;
  bannedUsers: number;
  usersWithLibrary: number;
  dailyViews: { day: string; count: number }[];
  topArticles: { id: string; title: string; views: number; completedReads: number; likes: number }[];
  sharesByPlatform: { platform: string; count: number }[];
  recentAlerts: { id: string; type: string; severity: string; message: string; createdAt: string }[];
  scheduledSoon: { id: string; title: string; scheduledAt: string | null }[];
  recentComments: { id: string; content: string; article: string; author: string; createdAt: string }[];
};

const fmt = (n: number) => new Intl.NumberFormat("ar-EG").format(n);
const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

const PLATFORM_LABELS: Record<string, string> = {
  "x": "إكس",
  "whatsapp": "واتساب",
  "telegram": "تيليجرام",
  "quote-download": "تحميل اقتباس",
  "quote-share": "مشاركة اقتباس",
  "copy": "نسخ الرابط",
  "native": "مشاركة النظام",
  "other": "أخرى",
};

const PIE_COLORS = ["#A16A1F", "#D9A441", "#41587A", "#66809F", "#10B981", "#EF4444"];

export function OverviewStats({ data }: { data: OverviewData }) {
  const router = useRouter();

  return (
    <div className="space-y-6">
      {/* رأس الصفحة */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-steel-900">التحليلات الحية</h1>
          <p className="text-sm text-steel-500">نبض المنصة في الوقت الحقيقي</p>
        </div>
        <button
          onClick={() => router.refresh()}
          className="rounded-xl border border-steel-200 bg-white px-4 py-2 text-xs font-bold text-steel-600 transition-colors hover:border-copper-500 hover:text-copper-700"
        >
          تحديث الآن
        </button>
      </div>

      {/* بطاقات الإحصاء */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard title="زيارات اليوم" value={fmt(data.visitsToday)} sub={`الأسبوع: ${fmt(data.visitsThisWeek)}`} delta={data.weeklyDelta} tone="copper" />
        <StatCard title="قراءات متكاملة اليوم" value={fmt(data.completedToday)} sub={`معدل الإكمال: ${fmt(data.completionRate)}%`} tone="steel" />
        <StatCard title="إعجابات / عدم إعجاب" value={`${fmt(data.likesTotal)} / ${fmt(data.dislikesTotal)}`} sub="إجمالي تفاعلات المنصة" tone="steel" />
        <StatCard title="تعليقات بانتظار المراجعة" value={fmt(data.commentsPending)} sub="تحتاج قرارك الآن" tone={data.commentsPending > 0 ? "danger" : "steel"} action={{ label: "مراجعة", href: "/comments" }} />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard title="مشاركات الاقتباسات" value={fmt(data.sharesTotal)} sub="عبر السوشيال ميديا" tone="steel" />
        <StatCard title="مقالات منشورة" value={fmt(data.publishedCount)} sub="منشورة حاليًا" tone="steel" action={{ label: "إدارة", href: "/articles" }} />
        <StatCard title="مقالات مجدولة" value={fmt(data.scheduledCount)} sub="ستنشر تلقائيًا" tone="steel" />
        <StatCard title="تنبيهات أمنية" value={fmt(data.recentAlerts.length)} sub="غير معالجة (آخر 4)" tone={data.recentAlerts.length > 0 ? "danger" : "steel"} action={{ label: "الأمان", href: "/security" }} />
      </div>

      {/* صف القراء المسجلين — حسابات Google الحقيقية */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          title="قراء مسجلون"
          value={fmt(data.usersTotal)}
          sub={`جديد هذا الأسبوع: ${fmt(data.usersThisWeek)}`}
          tone="copper"
          action={{ label: "المستخدمون", href: "/users" }}
        />
        <StatCard
          title="مشاركون فعليًا"
          value={fmt(data.engagedUsers)}
          sub={data.usersTotal > 0 ? `نسبة المشاركة: ${Math.round((data.engagedUsers / data.usersTotal) * 100)}%` : "لا مسجلون بعد"}
          tone="steel"
        />
        <StatCard
          title="حسابات محظورة"
          value={fmt(data.bannedUsers)}
          sub="موقوعة عن المشاركة"
          tone={data.bannedUsers > 0 ? "danger" : "steel"}
          action={{ label: "إدارة", href: "/users" }}
        />
        <StatCard
          title="مكتبات متزامنة"
          value={fmt(data.usersWithLibrary)}
          sub="قراء حفظوا مقالات بحسابهم"
          tone="steel"
        />
      </div>

      {/* المخططات */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h3 className="mb-4 text-sm font-bold text-steel-800">الزيارات — آخر ١٤ يومًا</h3>
          <div dir="ltr" className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.dailyViews}>
                <defs>
                  <linearGradient id="visitsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#A16A1F" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#A16A1F" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="day"
                  tickFormatter={(v: string) =>
                    new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "numeric" }).format(new Date(v))
                  }
                  tick={{ fontSize: 11, fill: "#66809F" }}
                  axisLine={{ stroke: "#E6EAF1" }}
                  tickLine={false}
                />
                <YAxis tick={{ fontSize: 11, fill: "#66809F" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  formatter={(v) => [fmt(Number(v)), "زيارة"]}
                  labelFormatter={(l) => fmtDate(String(l))}
                  contentStyle={{ borderRadius: 12, border: "1px solid #E6EAF1", direction: "rtl", fontFamily: "inherit" }}
                />
                <Area type="monotone" dataKey="count" stroke="#A16A1F" strokeWidth={2.5} fill="url(#visitsGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="mb-4 text-sm font-bold text-steel-800">مشاركات الاقتباسات حسب المنصة</h3>
          {data.sharesByPlatform.length === 0 ? (
            <p className="py-16 text-center text-xs text-steel-400">لا مشاركات بعد</p>
          ) : (
            <div dir="ltr" className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.sharesByPlatform.map((s) => ({ ...s, name: PLATFORM_LABELS[s.platform] || s.platform }))}
                    dataKey="count"
                    nameKey="name"
                    innerRadius={45}
                    outerRadius={80}
                    paddingAngle={3}
                  >
                    {data.sharesByPlatform.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => fmt(Number(v))} contentStyle={{ borderRadius: 12, direction: "rtl", fontFamily: "inherit" }} />
                  <Legend wrapperStyle={{ fontSize: 11, direction: "rtl" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h3 className="mb-4 text-sm font-bold text-steel-800">الأكثر قراءة (مشاهدات + إعجابات)</h3>
          {data.topArticles.length === 0 ? (
            <p className="py-16 text-center text-xs text-steel-400">لا مقالات منشورة بعد</p>
          ) : (
            <div dir="ltr" className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.topArticles.map((a) => ({ name: a.title.slice(0, 18), views: a.views, likes: a.likes }))} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#66809F" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fill: "#41587A" }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v) => fmt(Number(v))} contentStyle={{ borderRadius: 12, direction: "rtl", fontFamily: "inherit" }} />
                  <Legend wrapperStyle={{ fontSize: 11, direction: "rtl" }} />
                  <Bar dataKey="views" name="مشاهدات" fill="#41587A" radius={[0, 6, 6, 0]} barSize={14} />
                  <Bar dataKey="likes" name="إعجابات" fill="#D9A441" radius={[0, 6, 6, 0]} barSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <div className="space-y-6">
          {/* جدولة النشر القادمة */}
          <Card className="p-5">
            <h3 className="mb-3 text-sm font-bold text-steel-800">جدول النشر القادم</h3>
            {data.scheduledSoon.length === 0 ? (
              <p className="py-4 text-center text-xs text-steel-400">لا يوجد نشر مجدول</p>
            ) : (
              <ul className="space-y-3">
                {data.scheduledSoon.map((s) => (
                  <li key={s.id} className="text-xs">
                    <p className="font-bold text-steel-800">{s.title}</p>
                    <p className="mt-0.5 text-steel-400">{s.scheduledAt ? fmtDate(s.scheduledAt) : ""}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* تنبيهات أمنية */}
          <Card className="p-5">
            <h3 className="mb-3 text-sm font-bold text-steel-800">تنبيهات أمنية فورية</h3>
            {data.recentAlerts.length === 0 ? (
              <p className="py-4 text-center text-xs text-steel-400">لا تنبيهات — كل شيء هادئ</p>
            ) : (
              <ul className="space-y-3">
                {data.recentAlerts.map((a) => (
                  <li key={a.id} className="rounded-xl border border-steel-100 p-3 text-xs">
                    <div className="mb-1 flex items-center gap-2">
                      <Badge tone={a.severity === "CRITICAL" ? "danger" : a.severity === "WARN" ? "warn" : "neutral"}>
                        {a.severity === "CRITICAL" ? "حرج" : a.severity === "WARN" ? "تحذير" : "معلومة"}
                      </Badge>
                      <span className="text-steel-400">{fmtDate(a.createdAt)}</span>
                    </div>
                    <p className="leading-5 text-steel-700">{a.message}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {/* آخر التعليقات */}
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-steel-800">أحدث التعليقات</h3>
          <Link href="/comments" className="text-xs font-bold text-copper-700 hover:underline">
            مركز المراجعة ←
          </Link>
        </div>
        {data.recentComments.length === 0 ? (
          <p className="py-4 text-center text-xs text-steel-400">لا تعليقات بعد</p>
        ) : (
          <ul className="space-y-3">
            {data.recentComments.map((c) => (
              <li key={c.id} className="rounded-xl border border-steel-100 p-3">
                <p className="text-xs leading-6 text-steel-700">{c.content}</p>
                <p className="mt-1 text-[11px] text-steel-400">
                  {c.author} — عن مقال «{c.article}» — {fmtDate(c.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function StatCard({
  title,
  value,
  sub,
  tone,
  delta,
  action,
}: {
  title: string;
  value: string;
  sub: string;
  tone: "copper" | "steel" | "danger";
  delta?: number;
  action?: { label: string; href: string };
}) {
  return (
    <Card className="p-5 transition-shadow hover:shadow-lift">
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold text-steel-500">{title}</p>
        {delta !== undefined && (
          <Badge tone={delta >= 0 ? "success" : "danger"}>
            {delta >= 0 ? "▲" : "▼"} {fmt(Math.abs(delta))}%
          </Badge>
        )}
      </div>
      <p
        className={`mt-2 text-2xl font-bold lg:text-3xl ${
          tone === "copper" ? "text-copper-700" : tone === "danger" ? "text-danger-600" : "text-steel-900"
        }`}
      >
        {value}
      </p>
      <div className="mt-1 flex items-center justify-between">
        <p className="text-[11px] text-steel-400">{sub}</p>
        {action && (
          <Link href={action.href} className="text-[11px] font-bold text-copper-700 hover:underline">
            {action.label}
          </Link>
        )}
      </div>
    </Card>
  );
}
