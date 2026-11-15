"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, useToast } from "@/components/ui";

/**
 * بطاقة «قناة البريد المعاملاتي (Gmail SMTP)»:
 * تعرض حالة القناة المضبوطة من متغيرات البيئة على Vercel مع زر إرسال
 * تجريبي فوري — دون أي حقول لإدخال كلمات المرور داخل الواجهة.
 */

type ChannelStatus = {
  active: boolean;
  source: "env" | "db" | "none";
  user: string;
  maskedPass: string | null;
  from: string;
};

export function EmailChannelCard() {
  const { toast } = useToast();
  const [status, setStatus] = useState<ChannelStatus | null>(null);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/email-channel", { cache: "no-store" });
      const data = (await res.json()) as ChannelStatus;
      setStatus(data);
    } catch {
      /* صامت */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const testSend = async () => {
    setTesting(true);
    try {
      const res = await fetch("/api/email-channel", { method: "PUT" });
      const data = await res.json();
      if (data.ok) {
        toast(`وصلت الرسالة التجريبية إلى ${data.to} — افحص بريدك الآن`, "success");
      } else {
        toast(data.error || "فشل الإرسال التجريبي", "error");
      }
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-steel-800">قناة البريد الإلكتروني (Gmail SMTP)</h2>
        {status && (
          <span
            className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold"
            style={{
              background: status.active ? "rgba(60,122,78,0.14)" : "rgba(220,38,38,0.10)",
              color: status.active ? "#3c7a4e" : "#DC2626",
            }}
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: status.active ? "#3c7a4e" : "#DC2626" }}
            />
            {status.active ? "القناة مفعّلة" : "غير مفعّلة في البيئة"}
          </span>
        )}
      </div>

      <p className="text-xs leading-6 text-steel-500">
        ترسل تنبيهات الأمان عند دخول جهاز جديد، وبريد بلوغ رتبة أهل الكلمة، وأحداث السيادة مباشرةً عبر
        بريد المنصة الرسمي على Gmail.
      </p>

      {status && (
        <div className="rounded-xl border border-steel-100 bg-steel-50 p-3 text-[11px] leading-6 text-steel-500">
          <div>
            <b className="text-steel-800">البريد المرسل:</b> {status.from}
          </div>
          <div>
            <b className="text-steel-800">المصدر:</b>{" "}
            {status.source === "env"
              ? "متغيرات البيئة المحمية على Vercel"
              : status.source === "db"
                ? "قاعدة البيانات"
                : "غير مضبوطة"}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={testSend} disabled={testing || !status?.active}>
          {testing ? "جارٍ الإرسال.." : "إرسال بريد تجريبي"}
        </Button>
      </div>
    </Card>
  );
}
