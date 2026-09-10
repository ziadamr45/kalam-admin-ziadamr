"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, useToast } from "@/components/ui";

/**
 * بطاقة «قناة البريد المعاملاتي» — مراقبة نقية:
 * المفتاح أصبح مُفعّلًا من متغيرات البيئة (RESEND_API_KEY) على المشروعين
 * وأُلغي مكان إدخاله من الإعدادات نهائيًا. هذه البطاقة تعرض حالة القناة
 * والمفتاح المُقنَّع والمُرسِل الحالي، وتتيح بريدًا تجريبيًا حيًا للتحقق.
 */

type ChannelStatus = {
  active: boolean;
  source: "env" | "db" | "none";
  maskedKey: string | null;
  from: string;
  fromIsCustom: boolean;
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
        toast(`وصلت الرسالة التجريبية إلى ${data.to} — افحص بريدك (وصندوق الرسائل غير المرغوبة)`, "success");
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
        <h2 className="text-sm font-bold text-steel-800">قناة البريد المعاملاتي (Resend)</h2>
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
            {status.active ? "القناة مفعّلة" : "القناة غير مفعّلة"}
          </span>
        )}
      </div>

      <p className="text-xs leading-6 text-steel-500">
        هذه القناة ترسل فورًا: تنبيهات الأمان عند دخول جهاز جديد، وبريد بلوغ رتبة أهل الكلمة، وأحداث السيادة
        الطارئة. المفتاح مُفعّل من متغيرات البيئة (RESEND_API_KEY) على المشروعين معًا — لا يُدخل ولا
        يُعدَّل من هنا.
      </p>

      {status?.active ? (
        <div className="rounded-xl border border-steel-100 bg-steel-50 p-3 text-[11px] leading-6 text-steel-500">
          <div>
            <b className="text-steel-800">المفتاح الحالي:</b>{" "}
            {status.maskedKey}{" "}
            <span className="text-steel-400">
              (المصدر: {status.source === "env" ? "متغيرات البيئة" : "قاعدة البيانات"})
            </span>
          </div>
          <div>
            <b className="text-steel-800">المرسل:</b> {status.from}
            {!status.fromIsCustom && (
              <span className="text-steel-400"> — عنوان اختبار مؤقت (يُقيَّد ببريد حساب Resend حتى توثيق النطاق)</span>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-steel-100 bg-steel-50 p-3 text-[11px] leading-6 text-steel-500">
          القناة غير مفعّلة بعد — تأكد من نشر أحدث إصدار بعد ضبط متغير البيئة.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={testSend} disabled={testing || !status?.active}>
          {testing ? "جارٍ الإرسال.." : "إرسال بريد تجريبي"}
        </Button>
      </div>
    </Card>
  );
}
