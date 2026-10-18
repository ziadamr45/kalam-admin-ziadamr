"use client";

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
  CartesianGrid,
} from "recharts";
import { Card } from "@/components/ui";

/**
 * لوحة تحليلات الأداء — الواجهة البيانية:
 * أكثر المقالات قراءة · توزيع تفاعل الأقسام · جغرافيا الزوار · أنواع الأجهزة
 * · منحنى الزيارات 14 يومًا — كل الأرقام حية من قاعدة البيانات.
 */

const COPPER = "#A16A1F";
const STEEL = "#0D1626";
const PIE_COLORS = ["#A16A1F", "#0D1626", "#C89B4B", "#41587A", "#84531B", "#7A93B5", "#D9C39A", "#2E4260"];

const DEVICE_LABELS: Record<string, string> = {
  mobile: "هاتف",
  tablet: "جهاز لوحي",
  desktop: "حاسوب",
};

const COUNTRY_LABELS: Record<string, string> = {
  EG: "مصر", SA: "السعودية", AE: "الإمارات", KW: "الكويت", QA: "قطر",
  BH: "البحرين", OM: "عُمان", JO: "الأردن", PS: "فلسطين", LB: "لبنان",
  IQ: "العراق", SY: "سوريا", YE: "اليمن", LY: "ليبيا", DZ: "الجزائر",
  MA: "المغرب", TN: "تونس", SD: "السودان", MR: "موريتانيا", SO: "الصومال",
  US: "أمريكا", GB: "بريطانيا", CA: "كندا", DE: "ألمانيا", FR: "فرنسا",
  TR: "تركيا", MY: "ماليزيا", ID: "إندونيسيا", AU: "أستراليا", SE: "السويد",
};

type Totals = { views: number; completedReads: number; interactions: number; shares: number; users: number; logins: number };
type TopArticle = { slug: string; title: string; section: string | null; views: number; completedReads: number };
type SectionStat = { name: string; color: string; interactions: number; likes: number; dislikes: number };

function StatCard({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-[11px] font-bold text-steel-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-steel-900">
        {new Intl.NumberFormat("ar-EG").format(value)}
      </p>
      {hint && <p className="mt-0.5 text-[10px] text-steel-400">{hint}</p>}
    </Card>
  );
}

export function AnalyticsPanels({
  totals,
  topArticles,
  sections,
  devices,
  countries,
  daily,
}: {
  totals: Totals;
  topArticles: TopArticle[];
  sections: SectionStat[];
  devices: { device: string; count: number }[];
  countries: { country: string; count: number }[];
  daily: { day: string; views: number }[];
}) {
  const completionRate = totals.views > 0 ? Math.round((totals.completedReads / totals.views) * 100) : 0;
  const deviceData = devices.map((d) => ({ name: DEVICE_LABELS[d.device] ?? d.device, value: d.count }));
  const countryData = countries.map((c) => ({ name: COUNTRY_LABELS[c.country] ?? c.country, value: c.count }));
  const dailyLabels = daily.map((d) => ({ ...d, label: d.day.slice(5) }));
  const maxViews = Math.max(1, ...topArticles.map((a) => a.views));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-steel-900">تحليلات الأداء</h1>
        <span className="text-[11px] text-steel-400">محسوبة لحظة الفتح من قاعدة البيانات الحية</span>
      </div>

      {/* البطاقات العليا */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <StatCard label="إجمالي المشاهدات" value={totals.views} hint="كل المقالات المنشورة" />
        <StatCard label="قراءات مكتملة" value={totals.completedReads} hint={`نسبة الإكمال ${new Intl.NumberFormat("ar-EG").format(completionRate)}%`} />
        <StatCard label="تفاعلات الإعجاب" value={totals.interactions} hint="إعجاب + عدم إعجاب" />
        <StatCard label="مشاركات" value={totals.shares} hint="بطاقات اقتباس ومشاركة مباشرة" />
        <StatCard label="قراء مسجلون" value={totals.users} />
        <StatCard label="دخولات موثقة" value={totals.logins} hint="سجل أمن الدخول" />
      </div>

      {/* منحنى الزيارات */}
      <Card className="p-5">
        <h2 className="mb-4 text-sm font-bold text-steel-800">منحنى الزيارات — آخر 14 يومًا</h2>
        <div dir="ltr" className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dailyLabels} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="viewsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COPPER} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={COPPER} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e6eaf1" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#41587A" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#41587A" }} tickLine={false} axisLine={false} allowDecimals={false} width={36} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: "1px solid #e6eaf1", fontSize: 12, fontFamily: "inherit" }}
                formatter={(v) => [new Intl.NumberFormat("ar-EG").format(Number(v)), "زيارة"]}
              />
              <Area type="monotone" dataKey="views" stroke={COPPER} strokeWidth={2.5} fill="url(#viewsGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* أكثر المقالات قراءة */}
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-bold text-steel-800">أكثر المقالات قراءة</h2>
          {topArticles.length === 0 ? (
            <p className="py-8 text-center text-sm text-steel-400">لا مقالات منشورة بعد.</p>
          ) : (
            <div dir="ltr" className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[...topArticles].reverse()} layout="vertical" margin={{ top: 0, right: 12, left: 12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e6eaf1" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#41587A" }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="title"
                    width={150}
                    tick={{ fontSize: 10, fill: "#0D1626" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: string) => (v.length > 18 ? `${v.slice(0, 18)}…` : v)}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: "1px solid #e6eaf1", fontSize: 12, fontFamily: "inherit" }}
                    formatter={(v) => [new Intl.NumberFormat("ar-EG").format(Number(v)), "مشاهدة"]}
                  />
                  <Bar dataKey="views" fill={COPPER} radius={[0, 6, 6, 0]} barSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* توزيع تفاعل الأقسام */}
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-bold text-steel-800">توزيع تفاعل الأقسام</h2>
          {sections.length === 0 ? (
            <p className="py-8 text-center text-sm text-steel-400">لا تفاعلات مسجلة بعد.</p>
          ) : (
            <div className="space-y-3">
              {sections.map((s) => {
                const pct = Math.round((s.interactions / Math.max(1, sections[0].interactions)) * 100);
                return (
                  <div key={s.name}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-bold text-steel-800">{s.name}</span>
                      <span className="text-steel-400">
                        {new Intl.NumberFormat("ar-EG").format(s.interactions)} تفاعل{" "}
                        <span style={{ color: "#2E7D32" }}>(+{new Intl.NumberFormat("ar-EG").format(s.likes)})</span>{" "}
                        <span style={{ color: "#B4443C" }}>(−{new Intl.NumberFormat("ar-EG").format(s.dislikes)})</span>
                      </span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-steel-100">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${Math.max(4, pct)}%`, background: s.color || COPPER }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* أنواع الأجهزة */}
        <Card className="p-5">
          <h2 className="mb-2 text-sm font-bold text-steel-800">أنواع الأجهزة</h2>
          {deviceData.length === 0 ? (
            <p className="py-8 text-center text-sm text-steel-400">لا بيانات أجهزة بعد — تُجمع من لحظة النشر مباشرة.</p>
          ) : (
            <div dir="ltr" className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={deviceData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3}>
                    {deviceData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 12, fontFamily: "inherit" }} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: "1px solid #e6eaf1", fontSize: 12, fontFamily: "inherit" }}
                    formatter={(v, n) => [new Intl.NumberFormat("ar-EG").format(Number(v)), String(n)]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* جغرافيا الزوار */}
        <Card className="p-5">
          <h2 className="mb-2 text-sm font-bold text-steel-800">جغرافيا الزوار — أعلى 10 دول</h2>
          {countryData.length === 0 ? (
            <p className="py-8 text-center text-sm text-steel-400">لا بيانات جغرافيا بعد — تُجمع من لحظة النشر مباشرة.</p>
          ) : (
            <div dir="ltr" className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={countryData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3}>
                    {countryData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 12, fontFamily: "inherit" }} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: "1px solid #e6eaf1", fontSize: 12, fontFamily: "inherit" }}
                    formatter={(v, n) => [new Intl.NumberFormat("ar-EG").format(Number(v)), String(n)]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
