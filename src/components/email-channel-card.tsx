"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, useToast } from "@/components/ui";

/**
 * بطاقة «قناة البريد المعاملاتي (Gmail SMTP)»:
 * تتيح ربط بريد المنصة الرسمي (kalamlaholazma@gmail.com) عبر كلمة مرور
 * التطبيق (App Password) من Google وحفظها مباشرة في قاعدة البيانات المشتركة
 * بين الموقعين مع زر إرسال تجريبي فوري.
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
  const [smtpUser, setSmtpUser] = useState("kalamlaholazma@gmail.com");
  const [appPassword, setAppPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/email-channel", { cache: "no-store" });
      const data = (await res.json()) as ChannelStatus;
      setStatus(data);
      if (data.user) setSmtpUser(data.user);
    } catch {
      /* صامت */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appPassword.trim()) {
      toast("أدخل كلمة مرور التطبيق (App Password) من Google أولًا", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/email-channel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: smtpUser.trim(), appPassword: appPassword.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setAppPassword("");
        setStatus(data);
        toast("تم حفظ إعدادات Gmail SMTP وتفعيلها على الموقعين فورًا", "success");
      } else {
        toast(data.error || "تعذر حفظ الإعدادات", "error");
      }
    } finally {
      setSaving(false);
    }
  };

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
            {status.active ? "القناة مفعّلة" : "بانتظار كلمة مرور التطبيق"}
          </span>
        )}
      </div>

      <p className="text-xs leading-6 text-steel-500">
        ترسل تنبيهات الأمان عند دخول جهاز جديد، وبريد بلوغ رتبة أهل الكلمة، وأحداث السيادة مباشرةً عبر
        بريد المنصة الرسمي على Gmail بدون الحاجة لنطاق مدفوع.
      </p>

      {status?.active && (
        <div className="rounded-xl border border-steel-100 bg-steel-50 p-3 text-[11px] leading-6 text-steel-500">
          <div>
            <b className="text-steel-800">البريد المرسل:</b> {status.from}
          </div>
          <div>
            <b className="text-steel-800">كلمة مرور التطبيق:</b> {status.maskedPass}{" "}
            <span className="text-steel-400">
              (المصدر: {status.source === "env" ? "متغيرات البيئة" : "قاعدة البيانات"})
            </span>
          </div>
        </div>
      )}

      <form onSubmit={saveConfig} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] font-bold text-steel-600">بريد المنصة (Gmail)</label>
            <input
              type="email"
              dir="ltr"
              value={smtpUser}
              onChange={(e) => setSmtpUser(e.target.value)}
              className="field text-xs"
              placeholder="kalamlaholazma@gmail.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold text-steel-600">
              كلمة مرور التطبيق (App Password — 16 حرفًا)
            </label>
            <input
              type="password"
              dir="ltr"
              value={appPassword}
              onChange={(e) => setAppPassword(e.target.value)}
              className="field text-xs"
              placeholder="xxxx xxxx xxxx xxxx"
              autoComplete="off"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "جارٍ الحفظ.." : "حفظ وتفعيل القناة"}
          </Button>
          <Button type="button" variant="outline" onClick={testSend} disabled={testing || !status?.active}>
            {testing ? "جارٍ الإرسال.." : "إرسال بريد تجريبي"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
