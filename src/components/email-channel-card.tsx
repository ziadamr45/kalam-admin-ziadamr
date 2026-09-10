"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, useToast } from "@/components/ui";

/**
 * بطاقة «قناة البريد المعاملاتي» — تفعيل Resend بلا طرفية ولا إعادة نشر:
 * ألصق المفتاح من لوحة Resend (حتى من الهاتف) → حفظ → بريد تجريبي حي.
 * المفتاح يُخزن في SystemSetting المشترك فتعمل رسائل الأمان والسيادة
 * على المنصة العامة واللوحة معًا لحظيًا.
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
  const [apiKey, setApiKey] = useState("");
  const [from, setFrom] = useState("");
  const [busy, setBusy] = useState(false);
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

  const save = async () => {
    if (!apiKey.trim() && !from.trim()) {
      toast("ألصق مفتاح Resend أولًا (يبدأ بـ re_)", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/email-channel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim() || undefined, from: from.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast(data.error || "تعذر الحفظ", "error");
        return;
      }
      setStatus(data as ChannelStatus);
      setApiKey("");
      toast("فُعّلت قناة البريد — جرّب زر «إرسال بريد تجريبي» للتحقق الحي", "success");
    } finally {
      setBusy(false);
    }
  };

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

  const clearKey = async () => {
    if (!window.confirm("سيُمسح المفتاح المخزن في قاعدة البيانات. متابعة؟")) return;
    setBusy(true);
    try {
      await fetch("/api/email-channel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clear: true }),
      });
      await load();
      toast("مُسح المفتاح المخزن", "success");
    } finally {
      setBusy(false);
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
        الطارئة. المفتاح يُحفظ آمنًا في قاعدة البيانات ويعمل لحظيًا على المنصة العامة واللوحة معًا — دون طرفية ودون نشر جديد.
      </p>

      {status?.active && (
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
      )}

      <div>
        <label className="mb-1.5 block text-xs font-bold text-steel-700">
          مفتاح Resend API — من لوحة Resend → API Keys (يبدأ بـ re_)
        </label>
        <input
          type="password"
          className="field font-mono"
          dir="ltr"
          placeholder="re_xxxxxxxxxxxxxxxxxxxxxxxx"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          autoComplete="off"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-bold text-steel-700">
          عنوان المرسل (اختياري) — مثل: <span dir="ltr">security@ziadamr.me</span>
        </label>
        <input
          type="text"
          className="field"
          dir="ltr"
          placeholder="كلام له لازمة <security@ziadamr.me>"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          autoComplete="off"
        />
        <p className="mt-1 text-[11px] leading-5 text-steel-400">
          عنوان على النطاق الافتراضي onboarding@resend.dev يُرسل إلى بريد حساب Resend نفسه حصرًا؛
          لتراسل كل القرّاء وثّق نطاقك في لوحة Resend وأدخل عنوانًا عليه.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={save} disabled={busy}>
          {busy ? "جارٍ الحفظ.." : "حفظ وتفعيل"}
        </Button>
        <Button variant="outline" onClick={testSend} disabled={testing || !status?.active}>
          {testing ? "جارٍ الإرسال.." : "إرسال بريد تجريبي"}
        </Button>
        {status?.source === "db" && (
          <button
            onClick={clearKey}
            disabled={busy}
            className="text-[11px] font-bold text-steel-400 underline underline-offset-4 transition-opacity hover:opacity-70"
          >
            مسح المفتاح المخزن
          </button>
        )}
      </div>
    </Card>
  );
}
