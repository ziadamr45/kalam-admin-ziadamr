"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui";
import { AuditPanel, ErrorsPanel } from "@/components/audit-panels";

/** تحويل الأرقام إلى الشرقية للعرض الموحد */
function easternDigits(n: number): string {
  return String(n).replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
}

/* تقرير التفاعلات اليومية — من أعجب/أستاء وبأي مقال */
type DailyRow = {
  article: { id: string; title: string; slug: string };
  value: number;
  count: number;
};

function DailyInteractions() {
  const [data, setData] = useState<{ daily: DailyRow[]; logins24h: number; likes24h: number; dislikes24h: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/audit?tab=interactions");
      setData(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <Card className="p-5">
      <h2 className="mb-4 text-sm font-bold text-steel-800">تقرير التفاعلات — آخر 24 ساعة</h2>

      {!data ? (
        <p className="py-10 text-center text-sm text-steel-400">جارٍ التحميل..</p>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-3 gap-3">
            {[
              { label: "دخول Google", value: data.logins24h, tone: "text-success-600" },
              { label: "إعجابات", value: data.likes24h, tone: "text-copper-700" },
              { label: "استياءات", value: data.dislikes24h, tone: "text-danger-600" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-steel-100 p-4 text-center">
                <p className={`text-xl font-bold ${s.tone}`}>{easternDigits(s.value)}</p>
                <p className="mt-1 text-[10px] text-steel-400">{s.label}</p>
              </div>
            ))}
          </div>

          {data.daily.length === 0 ? (
            <p className="py-6 text-center text-xs text-steel-400">
              لا تفاعلات في آخر 24 ساعة بعد — أول تفاعل سيظهر هنا فور حدوثه.
            </p>
          ) : (
            <ul className="max-h-[420px] space-y-2 overflow-y-auto pe-1">
              {data.daily.map((row, i) => (
                <li key={`${row.article.id}-${row.value}`} className="flex items-center gap-3 rounded-xl border border-steel-100 p-3">
                  <span className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold ${row.value === 1 ? "bg-copper-100 text-copper-700" : "bg-danger-400/15 text-danger-600"}`}>
                    {row.value === 1 ? "أُعجب" : "أَساء"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-steel-800">
                    {row.article.title}
                  </span>
                  <span className="shrink-0 text-xs font-bold text-steel-400">
                    {easternDigits(row.count)} ×
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}

export default function AuditPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-steel-900">مركز النشاط المباشر والشفافية</h1>
        <p className="mt-1 text-sm text-steel-500">
          لا حركة في المنصة تخفى عليك — دخول Google، تعليقات، تصويتات، حفظ، رسائل، وأي خطأ
          يصادف أي زائر.. كل شيء هنا لحظة حدوثه.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <AuditPanel />
        <div className="space-y-6">
          <ErrorsPanel />
          <DailyInteractions />
        </div>
      </div>
    </div>
  );
}
