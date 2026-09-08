"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Modal, useToast } from "@/components/ui";

/* شارة الرتبة الفكرية — بألوان نسخة المنصة نفسها */
const RANK_STYLE: Record<string, { color: string; soft: string }> = {
  "قارئ متأمل": { color: "#7C7468", soft: "rgba(124,116,104,0.14)" },
  "محاور واعد": { color: "#3C7A4E", soft: "rgba(60,122,78,0.14)" },
  "عقل رصين": { color: "#A16A1F", soft: "rgba(161,106,31,0.15)" },
  "أهل الكلمة": { color: "#8A5A14", soft: "rgba(138,90,20,0.18)" },
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  customName: string | null;
  customImage: string | null;
  bio: string | null;
  impactScore: number;
  intellectualRank: string;
  banned: boolean;
  banReason: string | null;
  commentsCount: number;
  interactionsCount: number;
  savedCount: number;
  createdAt: string;
};

const fmt = (n: number) => new Intl.NumberFormat("ar-EG").format(n);
const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));

export function UsersTable({ users }: { users: UserRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [banTarget, setBanTarget] = useState<UserRow | null>(null);
  const [unbanTarget, setUnbanTarget] = useState<UserRow | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<UserRow | null>(null);
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);
  const [reason, setReason] = useState("مخالفة أدب الحوار والقيم");
  const [busy, setBusy] = useState(false);

  /* ==================== تعديل رصيد الأثر يدويًا ==================== */
  const [delta, setDelta] = useState("10");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustSign, setAdjustSign] = useState<1 | -1>(1);

  const toggleBan = async (userId: string, banned: boolean, banReason?: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, banned, banReason }),
      });
      if (res.ok) {
        toast(banned ? "حُظر المستخدم" : "رُفع الحظر");
        setBanTarget(null);
        setUnbanTarget(null);
        router.refresh();
      } else {
        toast("تعذر تنفيذ الإجراء", "error");
      }
    } finally {
      setBusy(false);
    }
  };

  const submitAdjust = async () => {
    if (!adjustTarget) return;
    const amount = Math.floor(Number(delta));
    if (!Number.isFinite(amount) || amount <= 0 || amount > 5000) {
      toast("أدخل عدد نقاط بين 1 و5000", "error");
      return;
    }
    if (adjustReason.trim().length < 3) {
      toast("اذكر سبب التعديل — يُوثَّق في سجل الأثر", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: adjustTarget.id,
          action: "adjust-impact",
          delta: amount * adjustSign,
          reason: adjustReason.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.awarded) {
        toast(
          `${adjustSign === 1 ? "منحت" : "خصمت"} ${fmt(amount)} نقطة — رصيده الآن ${fmt(data.impactScore)} (${data.rank})`,
        );
        setAdjustTarget(null);
        setAdjustReason("");
        setDelta("10");
        setAdjustSign(1);
        router.refresh();
      } else {
        toast(data?.error || "تعذر تنفيذ التعديل", "error");
      }
    } finally {
      setBusy(false);
    }
  };

  const submitResetIdentity = async () => {
    if (!resetTarget) return;
    setBusy(true);
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: resetTarget.id,
          action: "reset-identity",
          reason: resetTarget.email,
        }),
      });
      if (res.ok) {
        toast("عادت هويته إلى بيانات Google الأصلية");
        setResetTarget(null);
        router.refresh();
      } else {
        toast("تعذر تصفير الهوية", "error");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-steel-900">المستخدمون</h1>
        <p className="text-sm text-steel-500">
          {fmt(users.length)} مستخدمًا — بترتيب رصيد الأثر، مع الهوية المعروضة والرتبة الفكرية
        </p>
      </div>

      <Card className="overflow-x-auto">
        <table className="admin-table min-w-[980px]">
          <thead>
            <tr>
              <th>المستخدم</th>
              <th>الهوية المعروضة</th>
              <th>البريد</th>
              <th>رصيد الأثر</th>
              <th>التعليقات</th>
              <th>المكتبة</th>
              <th>الحالة</th>
              <th>انضم في</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-14 text-center text-sm text-steel-400">
                  لا مستخدمين بعد
                </td>
              </tr>
            ) : (
              users.map((u) => {
                const rank = RANK_STYLE[u.intellectualRank] ?? RANK_STYLE["قارئ متأمل"];
                const hasCustomIdentity = Boolean(u.customName || u.customImage);
                return (
                  <tr key={u.id}>
                    {/* هوية Google الأصلية للتوثيق */}
                    <td>
                      <div className="flex items-center gap-2.5">
                        {u.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={u.image} alt="" className="h-9 w-9 rounded-full" referrerPolicy="no-referrer" />
                        ) : (
                          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-steel-100 text-xs font-bold text-steel-600">
                            {u.name.charAt(0)}
                          </span>
                        )}
                        <span className="font-bold text-steel-900">{u.name}</span>
                      </div>
                    </td>
                    {/* الهوية المعروضة للقراء */}
                    <td>
                      {hasCustomIdentity ? (
                        <div className="flex items-center gap-2.5">
                          {u.customImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={u.customImage}
                              alt=""
                              className="h-9 w-9 rounded-full border-2 border-copper-400/60"
                              referrerPolicy="no-referrer"
                            />
                          ) : null}
                          <div className="min-w-0">
                            {u.customName && <p className="text-xs font-bold text-copper-600">{u.customName}</p>}
                            {u.bio && <p className="max-w-40 truncate text-[10px] text-steel-400">{u.bio}</p>}
                            {!u.customName && !u.bio && <p className="text-[10px] text-steel-400">صورة مخصصة فقط</p>}
                          </div>
                        </div>
                      ) : (
                        <span className="text-[11px] text-steel-300">— بيانات Google —</span>
                      )}
                    </td>
                    <td className="text-xs text-steel-500" dir="ltr">{u.email}</td>
                    {/* رصيد الأثر والرتبة */}
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-steel-900 tabular-nums">{fmt(u.impactScore)}</span>
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                          style={{ background: rank.soft, color: rank.color }}
                        >
                          {u.intellectualRank}
                        </span>
                      </div>
                    </td>
                    <td className="font-bold text-steel-700">{fmt(u.commentsCount)}</td>
                    <td className="text-steel-600">{fmt(u.savedCount)}</td>
                    <td>
                      {u.banned ? (
                        <div>
                          <Badge tone="danger">محظور</Badge>
                          {u.banReason && <p className="mt-1 text-[10px] text-steel-400">{u.banReason}</p>}
                        </div>
                      ) : (
                        <Badge tone="success">نشط</Badge>
                      )}
                    </td>
                    <td className="text-xs text-steel-400">{fmtDate(u.createdAt)}</td>
                    <td>
                      <div className="flex flex-wrap gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => { setAdjustTarget(u); setAdjustSign(1); }}>
                          تعديل الرصيد
                        </Button>
                        {hasCustomIdentity && (
                          <Button size="sm" variant="ghost" onClick={() => setResetTarget(u)}>
                            تصفير الهوية
                          </Button>
                        )}
                        {u.banned ? (
                          <Button size="sm" variant="outline" onClick={() => setUnbanTarget(u)}>
                            رفع الحظر
                          </Button>
                        ) : (
                          <Button size="sm" variant="danger" onClick={() => setBanTarget(u)}>
                            حظر
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </Card>

      {/* ==================== المودالات ==================== */}
      <Modal open={Boolean(banTarget)} onClose={() => setBanTarget(null)} title="حظر مستخدم نهائيًا">
        <p className="text-sm leading-7 text-steel-600">
          سيُحظر <strong>{banTarget?.email}</strong> نهائيًا: منع دخول، منع تعليق، منع تفاعل.
        </p>
        <input value={reason} onChange={(e) => setReason(e.target.value)} className="field mt-4" />
        <div className="mt-5 flex gap-3">
          <Button variant="danger" disabled={busy} onClick={() => banTarget && toggleBan(banTarget.id, true, reason)}>
            تأكيد الحظر
          </Button>
          <Button variant="ghost" onClick={() => setBanTarget(null)}>إلغاء</Button>
        </div>
      </Modal>

      <Modal open={Boolean(unbanTarget)} onClose={() => setUnbanTarget(null)} title="رفع الحظر">
        <p className="text-sm leading-7 text-steel-600">
          سيُسمح لـ <strong>{unbanTarget?.email}</strong> بالعودة للمشاركة بشكل طبيعي.
        </p>
        <div className="mt-5 flex gap-3">
          <Button disabled={busy} onClick={() => unbanTarget && toggleBan(unbanTarget.id, false)}>
            نعم، ارفع الحظر
          </Button>
          <Button variant="ghost" onClick={() => setUnbanTarget(null)}>إلغاء</Button>
        </div>
      </Modal>

      {/* منح/خصم نقاط الأثر يدويًا مع السبب */}
      <Modal open={Boolean(adjustTarget)} onClose={() => setAdjustTarget(null)} title="تعديل رصيد الأثر يدويًا">
        <p className="text-sm leading-7 text-steel-600">
          <strong>{adjustTarget?.customName || adjustTarget?.name}</strong> — رصيده الحالي{" "}
          <strong className="tabular-nums">{fmt(adjustTarget?.impactScore ?? 0)}</strong> ({adjustTarget?.intellectualRank}).
        </p>

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAdjustSign(1)}
            className={`flex-1 rounded-xl py-2.5 text-sm font-bold transition-all ${
              adjustSign === 1 ? "bg-success-600 text-white" : "bg-steel-100 text-steel-500 hover:bg-steel-200"
            }`}
          >
            منح نقاط +
          </button>
          <button
            type="button"
            onClick={() => setAdjustSign(-1)}
            className={`flex-1 rounded-xl py-2.5 text-sm font-bold transition-all ${
              adjustSign === -1 ? "bg-danger-600 text-white" : "bg-steel-100 text-steel-500 hover:bg-steel-200"
            }`}
          >
            خصم نقاط −
          </button>
        </div>

        <input
          type="number"
          min={1}
          max={5000}
          value={delta}
          onChange={(e) => setDelta(e.target.value)}
          className="field mt-4 tabular-nums"
          placeholder="عدد النقاط (1 – 5000)"
        />
        <input
          value={adjustReason}
          onChange={(e) => setAdjustReason(e.target.value)}
          className="field mt-3"
          placeholder="سبب التعديل — يُوثَّق في سجل الأثر أمام القارئ"
        />

        <div className="mt-5 flex gap-3">
          <Button disabled={busy} onClick={submitAdjust}>
            تنفيذ التعديل الموثق
          </Button>
          <Button variant="ghost" onClick={() => setAdjustTarget(null)}>إلغاء</Button>
        </div>
      </Modal>

      {/* تصفير الهوية المخصصة عند أي انتهاك للآداب */}
      <Modal open={Boolean(resetTarget)} onClose={() => setResetTarget(null)} title="تصفير الهوية المخصصة">
        <p className="text-sm leading-7 text-steel-600">
          سيُحذف الاسم المعروض والصورة المخصصة والنبذة الخاصة بـ{" "}
          <strong>{resetTarget?.email}</strong> وتعود هويته المعروضة إلى بيانات Google الأصلية فورًا.
          لا يُمس رصيد أثره ولا تعليقاته.
        </p>
        <div className="mt-5 flex gap-3">
          <Button variant="danger" disabled={busy} onClick={submitResetIdentity}>
            نعم، صفّر الهوية
          </Button>
          <Button variant="ghost" onClick={() => setResetTarget(null)}>إلغاء</Button>
        </div>
      </Modal>
    </div>
  );
}
