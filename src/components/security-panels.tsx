"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, useToast } from "@/components/ui";

type Device = { id: string; label: string; lastIp: string; lastSeenAt: string; createdAt: string };
type Rule = { id: string; ip: string; mode: "ALLOW" | "DENY"; note: string | null };
type Alert = { id: string; type: string; severity: string; message: string; resolved: boolean; createdAt: string };
type AuditRow = { id: string; action: string; entity: string | null; ip: string | null; createdAt: string };

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("ar-EG", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

export function SecurityPanels({
  adminId,
  devices,
  rules,
  alerts,
  audit,
  settings,
  envState,
}: {
  adminId: string;
  devices: Device[];
  rules: Rule[];
  alerts: Alert[];
  audit: AuditRow[];
  settings: { AUTO_APPROVE_COMMENTS: boolean; REQUIRE_CHECKLIST: boolean };
  envState: { enforceIpWhitelist: boolean; blockUntrustedDevices: boolean; envTrustedIps: string[] };
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [newIp, setNewIp] = useState("");
  const [newMode, setNewMode] = useState<"ALLOW" | "DENY">("ALLOW");
  const [newNote, setNewNote] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const revokeDevice = async (id: string) => {
    const res = await fetch(`/api/security/devices?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      toast("أُبطل ثقة الجهاز — سيتطلب توثيقًا جديدًا عند الدخول");
      router.refresh();
    }
  };

  const addRule = async () => {
    if (!newIp.trim()) return;
    const res = await fetch("/api/security/ip-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ip: newIp.trim(), mode: newMode, note: newNote }),
    });
    if (res.ok) {
      toast("أُضيفت قاعدة IP");
      setNewIp("");
      setNewNote("");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      toast(data.error || "IP غير صالح", "error");
    }
  };

  const deleteRule = async (id: string) => {
    const res = await fetch(`/api/security/ip-rules?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      toast("حُذفت القاعدة");
      router.refresh();
    }
  };

  const resolveAlert = async (id?: string) => {
    const res = await fetch("/api/security/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(id ? { id } : { resolveAll: true }),
    });
    if (res.ok) {
      toast("عُلّمت كمعالجة");
      router.refresh();
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast("كلمتا المرور غير متطابقتين", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        toast("غُيّرت كلمة المرور وأُبطلت كل الجلسات الأخرى");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        toast(data.error || "تعذر التغيير", "error");
      }
    } finally {
      setBusy(false);
    }
  };

  const unresolved = alerts.filter((a) => !a.resolved).length;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-steel-900">الأمن والإعدادات</h1>
        <p className="text-sm text-steel-500">مركز القيادة الأمنية — Zero-Trust Elite Security</p>
      </div>

      {/* الحالة الأمنية العامة */}
      <Card className="p-6">
        <h3 className="mb-4 text-sm font-bold text-steel-800">الطبقات الدفاعية النشطة</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <DefenseItem active label="كلمة المرور Argon2id" note="تجزئة مقاومة للهجمات" />
          <DefenseItem active label="تحقق بخطوتين TOTP" note="Google Authenticator / 1Password" />
          <DefenseItem active label="JWT في كوكيز محصنة" note="HttpOnly + Secure + SameSite=Strict" />
          <DefenseItem active label="حد معدل المحاولات" note="حظر بعد 5 محاولات فاشلة / 15 دقيقة" />
          <DefenseItem active label="بصمة الأجهزة + تنبيهات" note={`الأجهزة الموثوقة: ${devices.length}`} />
          <DefenseItem
            active={envState.enforceIpWhitelist}
            label="فرض القائمة البيضاء للـ IP"
            note={envState.enforceIpWhitelist ? "الحظر الصارم مفعّل" : "رصد وتنبيه فقط (بدون حظر)" }
          />
          <DefenseItem
            active={envState.blockUntrustedDevices}
            label="حظر الأجهزة غير الموثوقة"
            note={envState.blockUntrustedDevices ? "رفض فوري للجهاز الجديد" : "دخول + تنبيه أمني (الوضع المرن)"}
          />
          <DefenseItem active label="حماية CSRF وسجل تدقيق" note="فحص Origin + تدقيق كل إجراء" />
        </div>
      </Card>

      {/* كلمة المرور */}
      <Card className="p-6">
        <h3 className="mb-4 text-sm font-bold text-steel-800">تغيير كلمة المرور</h3>
        <form onSubmit={changePassword} className="grid gap-3 sm:grid-cols-3">
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="field"
            placeholder="الحالية"
            autoComplete="current-password"
            required
          />
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="field"
            placeholder="الجديدة (12+ حرفًا، أرقام، رموز)"
            autoComplete="new-password"
            required
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="field"
            placeholder="تأكيد الجديدة"
            autoComplete="new-password"
            required
          />
          <div className="sm:col-span-3">
            <Button type="submit" disabled={busy}>
              {busy ? "جارٍ التغيير.." : "تغيير كلمة المرور"}
            </Button>
            <p className="mt-2 text-[11px] text-steel-400">
              عند التغيير تُبطل كل الجلسات النشطة الأخرى فورًا لأسباب أمنية.
            </p>
          </div>
        </form>
      </Card>

      {/* الأجهزة الموثوقة */}
      <Card className="p-6">
        <h3 className="mb-4 text-sm font-bold text-steel-800">الأجهزة الموثوقة ({devices.length})</h3>
        {devices.length === 0 ? (
          <p className="text-xs text-steel-400">لا أجهزة مسجلة</p>
        ) : (
          <ul className="space-y-2">
            {devices.map((d) => (
              <li key={d.id} className="flex items-center justify-between rounded-xl border border-steel-100 p-3">
                <div>
                  <p className="text-sm font-bold text-steel-800">{d.label}</p>
                  <p className="text-[11px] text-steel-400">
                    آخر ظهور: {fmt(d.lastSeenAt)} — IP: {d.lastIp}
                  </p>
                </div>
                <Button size="sm" variant="danger" onClick={() => revokeDevice(d.id)}>
                  إبطال الثقة
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* قواعد IP */}
      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-bold text-steel-800">قواعد IP</h3>
          {envState.envTrustedIps.length > 0 && (
            <Badge tone="copper">قائمة بيئة: {envState.envTrustedIps.join(" ، ")}</Badge>
          )}
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          <input value={newIp} onChange={(e) => setNewIp(e.target.value)} className="field max-w-[200px]" placeholder="مثال: 197.35.12.4" dir="ltr" />
          <select value={newMode} onChange={(e) => setNewMode(e.target.value as "ALLOW" | "DENY")} className="field max-w-[130px]">
            <option value="ALLOW">سماح دائم</option>
            <option value="DENY">حظر دائم</option>
          </select>
          <input value={newNote} onChange={(e) => setNewNote(e.target.value)} className="field max-w-[220px]" placeholder="ملاحظة (المنزل، المكتب..)" />
          <Button onClick={addRule} disabled={!newIp.trim()}>إضافة</Button>
        </div>
        {rules.length === 0 ? (
          <p className="text-xs text-steel-400">
            لا قواعد — يمكنك تقييد اللوحة بعناوين محددة (مثل IP منزلك) لمستوى أمان أعلى.
          </p>
        ) : (
          <ul className="space-y-2">
            {rules.map((r) => (
              <li key={r.id} className="flex items-center justify-between rounded-xl border border-steel-100 p-3">
                <div className="flex items-center gap-3">
                  <Badge tone={r.mode === "ALLOW" ? "success" : "danger"}>
                    {r.mode === "ALLOW" ? "سماح" : "حظر"}
                  </Badge>
                  <span className="text-sm font-bold text-steel-800" dir="ltr">{r.ip}</span>
                  {r.note && <span className="text-[11px] text-steel-400">{r.note}</span>}
                </div>
                <Button size="sm" variant="ghost" onClick={() => deleteRule(r.id)}>
                  حذف
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* التنبيهات الأمنية */}
      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-bold text-steel-800">
            التنبيهات الأمنية {unresolved > 0 && <Badge tone="danger">{unresolved} غير معالجة</Badge>}
          </h3>
          {unresolved > 0 && (
            <Button size="sm" variant="outline" onClick={() => resolveAlert()}>
              تعليم الكل كمعالجة
            </Button>
          )}
        </div>
        {alerts.length === 0 ? (
          <p className="text-xs text-steel-400">لا تنبيهات — كل شيء هادئ</p>
        ) : (
          <ul className="max-h-96 space-y-2 overflow-y-auto">
            {alerts.map((a) => (
              <li
                key={a.id}
                className={`rounded-xl border p-3 ${a.resolved ? "border-steel-100 opacity-60" : a.severity === "CRITICAL" ? "border-danger-400/40 bg-danger-400/5" : "border-steel-100"}`}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge tone={a.severity === "CRITICAL" ? "danger" : a.severity === "WARN" ? "warn" : "neutral"}>
                      {a.severity === "CRITICAL" ? "حرج" : a.severity === "WARN" ? "تحذير" : "معلومة"}
                    </Badge>
                    <span className="text-[11px] font-bold text-steel-600">{a.type}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-steel-400">{fmt(a.createdAt)}</span>
                    {!a.resolved && (
                      <button onClick={() => resolveAlert(a.id)} className="text-[11px] font-bold text-copper-700 hover:underline">
                        معالجة
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-xs leading-6 text-steel-700">{a.message}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* سجل التدقيق */}
      <Card className="p-6">
        <h3 className="mb-4 text-sm font-bold text-steel-800">سجل التدقيق (آخر 50 إجراء)</h3>
        <ul className="max-h-96 space-y-1.5 overflow-y-auto text-[11px]">
          {audit.map((a) => (
            <li key={a.id} className="flex items-center justify-between rounded-lg bg-steel-50 px-3 py-2">
              <span className="font-bold text-steel-700">{a.action}</span>
              <span className="text-steel-400">
                {a.entity ? `${a.entity} — ` : ""}
                {a.ip || "—"} — {fmt(a.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function DefenseItem({ active, label, note }: { active: boolean; label: string; note: string }) {
  return (
    <div className={`flex items-center gap-3 rounded-xl border p-3.5 ${active ? "border-success-400/30 bg-success-400/5" : "border-warn-400/30 bg-warn-400/5"}`}>
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          active ? "bg-success-400/15 text-success-600" : "bg-warn-400/15 text-warn-500"
        }`}
      >
        {active ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        ) : (
          "!"
        )}
      </span>
      <div>
        <p className="text-xs font-bold text-steel-800">{label}</p>
        <p className="text-[10px] text-steel-400">{note}</p>
      </div>
    </div>
  );
}
