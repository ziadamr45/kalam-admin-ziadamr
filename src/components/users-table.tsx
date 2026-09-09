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
  /* منظومة التوثيق السيادي */
  role: string;
  isVerified: boolean;
  verifiedType: string | null;
  vipBadgeTitle: string | null;
  vipBadgeColor: string | null;
  vipReason: string | null;
  vipGrantedAt: string | null;
  commentsCount: number;
  interactionsCount: number;
  savedCount: number;
  createdAt: string;
};

/* الصلاحيات المعتمدة في الاستوديو — مفاتيحها تُقرأ في الخادم حصريًا */
const PRIVILEGE_OPTIONS: { key: string; label: string; hint: string }[] = [
  { key: "unlimitedAiChat", label: "حصة ذكاء اصطناعي غير محدودة", hint: "نقاش غير محدود مع ذكاء «ناقش المقال» دون أي قيود" },
  { key: "bypassRateLimits", label: "تجاوز محددات المعدل", hint: "نشر فوري للتعليقات دون الخضوع لمحددات السرعة" },
  { key: "bypassCooldowns", label: "تجاوز فترات التهدئة", hint: "إعفاء كامل من الانتظار بين التعليقات" },
  { key: "ahlAlKalimaAccess", label: "قناة «أهل الكلمة» فورية", hint: "فتح القناة والمشاركة فيها بغض النظر عن رصيد الأثر" },
  { key: "selfPinComment", label: "تثبيت التعليقات ذاتياً", hint: "تثبيت تعليقه الشخصي في قمة التعليقات لأي مقال" },
  { key: "vipCommentBorder", label: "إطار تعليق فخم ومميز", hint: "ظهور تعليقاته بإطار بلون الشارة في كافة المقالات" },
  { key: "betaFeatures", label: "وصول مبكر للميزات التجريبية", hint: "تجربة المزايا الجديدة قبل النشر العام" },
];

const COLOR_PRESETS = [
  { hex: "#D97706", name: "ذهبي سيادي" },
  { hex: "#2563EB", name: "أزرق ملكي" },
  { hex: "#059669", name: "زمردي" },
  { hex: "#1E3A8A", name: "كحلي رصين" },
  { hex: "#6B8E23", name: "زيتي شرفي" },
  { hex: "#7C3AED", name: "بنفسجي فاخر" },
  { hex: "#E11D48", name: "قرمزي" },
  { hex: "#0D9488", name: "فيروزي" },
];

const ROLE_OPTIONS = [
  { value: "USER", label: "مستخدم عادي" },
  { value: "MODERATOR", label: "مشرف محتوى MODERATOR" },
  { value: "EDITOR", label: "كاتب محتوى EDITOR" },
  { value: "ADMIN", label: "مدير نظام ADMIN" },
];

const ROLE_LABELS: Record<string, string> = {
  OWNER: "صاحب المنصة",
  ADMIN: "مدير نظام",
  EDITOR: "كاتب محتوى",
  MODERATOR: "مشرف محتوى",
  USER: "مستخدم عادي",
};

/* أسباب الحذف السيادي المعتمدة — تطابق ثوابت الخادم في lib/hard-delete.ts */
const HARD_DELETE_REASONS = [
  { value: "OFFICIAL_USER_REQUEST", label: "طلب رسمي من المستخدم عبر صفحة اتصل بنا" },
  { value: "SEVERE_DIALOGUE_VIOLATION", label: "مخالفة جسيمة لآداب الحوار والشريعة" },
  { value: "SECURITY_ABUSE", label: "إساءة وتعدٍّ أمني" },
] as const;

/** ختم التوثيق المصغر — يظهر بجانب اسم الموثق في الجدول */
function VerifiedDot({ color, title }: { color: string; title: string }) {
  return (
    <span title={`${title} — حساب موثّق`}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill={color} aria-hidden>
        <path d="M12 1.5l2.5 2.1 3.2-.4 1.2 3 3 1.2-.4 3.2L23.5 12l-2 2.4.4 3.2-3 1.2-1.2 3-3.2-.4L12 23.5l-2.5-2.1-3.2.4-1.2-3-3-1.2.4-3.2L.5 12l2-2.4-.4-3.2 3-1.2 1.2-3 3.2.4L12 1.5z" />
        <path d="M10.6 15.7l-3-3 1.3-1.3 1.7 1.7 4.5-4.5 1.3 1.3-5.8 5.8z" fill="#fff" />
      </svg>
    </span>
  );
}

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
  const [vipTarget, setVipTarget] = useState<UserRow | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<UserRow | null>(null);
  const [reason, setReason] = useState("مخالفة أدب الحوار والقيم");
  const [busy, setBusy] = useState(false);

  /* ==================== تعديل رصيد الأثر يدويًا ==================== */
  const [delta, setDelta] = useState("10");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustSign, setAdjustSign] = useState<1 | -1>(1);

  /* ==================== استوديو الحسابات المميزة (VIP Studio) ==================== */
  const [vipRole, setVipRole] = useState("USER");
  const [vipBadgeTitle, setVipBadgeTitle] = useState("");
  const [vipBadgeColor, setVipBadgeColor] = useState("#D97706");
  const [vipReason, setVipReason] = useState("");
  const [vipPrivileges, setVipPrivileges] = useState<Record<string, boolean>>({});
  const [vipPoints, setVipPoints] = useState("");
  const [vipBusy, setVipBusy] = useState(false);
  const [revokeReason, setRevokeReason] = useState("");

  /* ==================== الحذف السيادي الشامل (محو برمجي كامل) ==================== */
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [deleteReasonCode, setDeleteReasonCode] = useState<string>("");
  const [deleteDetails, setDeleteDetails] = useState("");
  const [deleteEvidenceUrl, setDeleteEvidenceUrl] = useState("");
  const [deleteUploading, setDeleteUploading] = useState(false);
  const [deleteConfirmWord, setDeleteConfirmWord] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);

  const openDeleteStudio = (u: UserRow) => {
    setDeleteTarget(u);
    setDeleteReasonCode("");
    setDeleteDetails("");
    setDeleteEvidenceUrl("");
    setDeleteConfirmWord("");
  };

  const uploadEvidence = async (file: File) => {
    setDeleteUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("filename", `evidence-${deleteTarget?.email ?? "user"}-${Date.now()}`);
      form.append("folder", "evidence");
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.url) {
        setDeleteEvidenceUrl(data.url);
      } else {
        toast(data?.error || "تعذر رفع لقطة الشاشة الدليلية", "error");
      }
    } catch {
      toast("تعذر الاتصال بخدمة الرفع", "error");
    } finally {
      setDeleteUploading(false);
    }
  };

  const submitHardDelete = async () => {
    if (!deleteTarget) return;
    if (!HARD_DELETE_REASONS.some((r) => r.value === deleteReasonCode)) {
      toast("اختر سببًا رسميًا من الأسباب الثلاثة المعتمدة", "error");
      return;
    }
    if (deleteDetails.trim().length < 5) {
      toast("تدوّن تفصيل السبب بدقة — نص المخالفة أو نص الطلب (5 أحرف فأكثر)", "error");
      return;
    }
    if (!deleteEvidenceUrl) {
      toast("إرفاق لقطة شاشة دليلية إلزامي — تُحفظ في مجلد الأدلة المحمي", "error");
      return;
    }
    if (deleteConfirmWord !== "حذف") {
      toast("اكتب كلمة «حذف» للتأكيد النهائي", "error");
      return;
    }
    setDeleteBusy(true);
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: deleteTarget.id,
          action: "hard-delete",
          reasonCode: deleteReasonCode,
          reason: deleteDetails.trim(),
          evidenceUrl: deleteEvidenceUrl,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok) {
        toast(`مُحيا الحساب وكل بياناته نهائيًا — قيد التدقيق رقم ${data.auditId?.slice(-6,).toUpperCase()}`);
        setDeleteTarget(null);
        router.refresh();
      } else {
        toast(data?.error || "تعذر إتمام المحو السيادي", "error");
      }
    } finally {
      setDeleteBusy(false);
    }
  };

  /* فتح الاستوديو — تعبئة مسبقة من الحالة الحالية للتحديث أو المنح الأول */
  const openVipStudio = (u: UserRow) => {
    setVipTarget(u);
    setVipRole(u.role === "OWNER" ? "ADMIN" : u.role || "USER");
    setVipBadgeTitle(u.vipBadgeTitle ?? "");
    setVipBadgeColor(u.vipBadgeColor ?? "#D97706");
    setVipReason(u.isVerified ? (u.vipReason ?? "") : "");
    setVipPrivileges({});
    setVipPoints("");
  };

  const togglePrivilege = (key: string) =>
    setVipPrivileges((prev) => ({ ...prev, [key]: !prev[key] }));

  const submitVipGrant = async () => {
    if (!vipTarget) return;
    if (vipBadgeTitle.trim().length < 2) {
      toast("مسمى الشارة إلزامي (حرفان فأكثر)", "error");
      return;
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(vipBadgeColor.trim())) {
      toast("لون الشارة يجب أن يكون كودًا سداسيًا مثل #D97706", "error");
      return;
    }
    if (vipReason.trim().length < 3) {
      toast("سبب منح التمييز إلزامي — يُحفظ في السجل ويُرسل في إشعار المستخدم", "error");
      return;
    }
    setVipBusy(true);
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: vipTarget.id,
          action: "grant-vip",
          role: vipRole,
          badgeTitle: vipBadgeTitle.trim(),
          badgeColor: vipBadgeColor.trim(),
          reason: vipReason.trim(),
          privileges: vipPrivileges,
          welcomePoints: vipPoints ? Math.max(0, Math.floor(Number(vipPoints) || 0)) : 0,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok) {
        toast(
          `مُنحت شارة «${data.badgeTitle}» — الإشعارات: جرس ${data.dispatch?.inApp ? "✓" : "×"} بث ${data.dispatch?.pushSent ? "✓" : "×"}`,
        );
        setVipTarget(null);
        router.refresh();
      } else {
        toast(data?.error || "تعذر تنفيذ المنح", "error");
      }
    } finally {
      setVipBusy(false);
    }
  };

  const submitVipRevoke = async () => {
    if (!revokeTarget) return;
    if (revokeReason.trim().length < 3) {
      toast("سبب السحب إلزامي — يظهر في إشعار المستخدم", "error");
      return;
    }
    setVipBusy(true);
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: revokeTarget.id,
          action: "revoke-vip",
          reason: revokeReason.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok) {
        toast("سُحبت الشارة وأُرسل إشعار التحديث للمستخدم");
        setRevokeTarget(null);
        setRevokeReason("");
        router.refresh();
      } else {
        toast(data?.error || "تعذر سحب التوثيق", "error");
      }
    } finally {
      setVipBusy(false);
    }
  };

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
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-steel-900">{u.name}</span>
                            {u.isVerified && (
                              <VerifiedDot color={u.vipBadgeColor || "#2563EB"} title={u.vipBadgeTitle || "حساب موثّق"} />
                            )}
                          </div>
                          {(u.role && u.role !== "USER") || u.isVerified ? (
                            <p className="text-[10px] text-steel-400">
                              {u.role !== "USER" ? ROLE_LABELS[u.role] ?? u.role : u.vipBadgeTitle}
                            </p>
                          ) : null}
                        </div>
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
                      <div className="flex flex-wrap items-center gap-1.5">
                        {u.banned ? (
                          <Badge tone="danger">محظور</Badge>
                        ) : (
                          <Badge tone="success">نشط</Badge>
                        )}
                        {u.isVerified && u.vipBadgeTitle && (
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                            style={{
                              background: `${u.vipBadgeColor || "#2563EB"}1f`,
                              color: u.vipBadgeColor || "#2563EB",
                            }}
                            title={u.vipReason ?? undefined}
                          >
                            {u.vipBadgeTitle}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="text-xs text-steel-400">{fmtDate(u.createdAt)}</td>
                    <td>
                      <div className="flex flex-wrap gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => { setAdjustTarget(u); setAdjustSign(1); }}>
                          تعديل الرصيد
                        </Button>
                        <Button
                          size="sm"
                          variant={u.isVerified ? "ghost" : "primary"}
                          onClick={() => openVipStudio(u)}
                        >
                          {u.isVerified ? "تعديل التمييز" : "ترقية مميزة VIP"}
                        </Button>
                        {u.isVerified && (
                          <Button size="sm" variant="ghost" onClick={() => setRevokeTarget(u)}>
                            سحب التوثيق
                          </Button>
                        )}
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
                        {u.role !== "OWNER" && (
                          <Button size="sm" variant="ghost" onClick={() => openDeleteStudio(u)}>
                            حذف نهائي
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

      {/* ==================== استوديو الحسابات المميزة (VIP Studio) ==================== */}
      <Modal
        open={Boolean(vipTarget)}
        onClose={() => setVipTarget(null)}
        title={`استوديو التمييز — ${vipTarget?.customName || vipTarget?.name || ""}`}
      >
        <div className="max-h-[70vh] space-y-5 overflow-y-auto pl-1">
          {/* الرتبة الوظيفية */}
          <div>
            <label className="mb-1.5 block text-xs font-bold text-steel-700">
              الرتبة الوظيفية (Account Role)
            </label>
            <select
              value={vipRole}
              onChange={(e) => setVipRole(e.target.value)}
              className="field"
              dir="rtl"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-steel-400">
              رتبة «صاحب المنصة» حصرية بالبذر التلقائي ولا تُمنح يدويًا.
            </p>
          </div>

          {/* مسمى الشارة */}
          <div>
            <label className="mb-1.5 block text-xs font-bold text-steel-700">
              مسمى شارة التوثيق <span className="text-danger-600">*</span>
            </label>
            <input
              value={vipBadgeTitle}
              onChange={(e) => setVipBadgeTitle(e.target.value)}
              className="field"
              placeholder="مثال: مؤسس المنصة، كاتب ضيف، باحث معرفي، عضو شرفي"
              maxLength={40}
            />
            <p className="mt-1 text-[11px] text-steel-400">
              يظهر بجانب اسمه في كل مكان بالموقع مع ختم التوثيق.
            </p>
          </div>

          {/* منتقي اللون */}
          <div>
            <label className="mb-1.5 block text-xs font-bold text-steel-700">
              لون الشارة <span className="text-danger-600">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => setVipBadgeColor(c.hex)}
                  title={c.name}
                  className={`h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 ${
                    vipBadgeColor.toUpperCase() === c.hex ? "border-steel-900 scale-110" : "border-transparent"
                  }`}
                  style={{ background: c.hex }}
                  aria-label={c.name}
                />
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                value={vipBadgeColor}
                onChange={(e) => setVipBadgeColor(e.target.value)}
                className="field w-32 text-left font-mono text-xs"
                dir="ltr"
                placeholder="#D97706"
                maxLength={7}
              />
              <span
                className="h-8 w-12 rounded-lg border border-steel-200"
                style={{ background: /^#[0-9a-fA-F]{6}$/.test(vipBadgeColor) ? vipBadgeColor : "#e5e7eb" }}
              />
            </div>
          </div>

          {/* سبب التمييز — إلزامي */}
          <div>
            <label className="mb-1.5 block text-xs font-bold text-steel-700">
              سبب منح التمييز <span className="text-danger-600">*</span>
            </label>
            <textarea
              value={vipReason}
              onChange={(e) => setVipReason(e.target.value)}
              className="field min-h-20"
              placeholder="سبب إلزامي — يُحفظ في سجل المراقبة ويُرسل في إشعار التهنئة للمستخدم"
              maxLength={300}
            />
          </div>

          {/* حزم الصلاحيات */}
          <div>
            <label className="mb-2 block text-xs font-bold text-steel-700">
              حزم الصلاحيات والمزايا (Privilege Checkpoints)
            </label>
            <div className="space-y-1.5">
              {PRIVILEGE_OPTIONS.map((p) => (
                <label
                  key={p.key}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-steel-100 p-3 transition-colors hover:bg-steel-50"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(vipPrivileges[p.key])}
                    onChange={() => togglePrivilege(p.key)}
                    className="mt-0.5 h-4 w-4 accent-copper-600"
                  />
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-steel-800">{p.label}</span>
                    <span className="block text-[11px] leading-5 text-steel-400">{p.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* الرصيد الترحيبي */}
          <div>
            <label className="mb-1.5 block text-xs font-bold text-steel-700">
              رصيد أثر ترحيبي فوري (اختياري)
            </label>
            <input
              type="number"
              min={0}
              max={10000}
              value={vipPoints}
              onChange={(e) => setVipPoints(e.target.value)}
              className="field tabular-nums"
              placeholder="مثال: 350 أو 1000 — يُوثق في سجل الأثر"
            />
          </div>
        </div>

        <div className="mt-5 flex gap-3 border-t border-steel-100 pt-4">
          <Button disabled={vipBusy} onClick={submitVipGrant}>
            {vipTarget?.isVerified ? "تحديث التمييز والمزايا" : "منح التوثيق والتمييز"}
          </Button>
          <Button variant="ghost" onClick={() => setVipTarget(null)}>إلغاء</Button>
        </div>
      </Modal>

      {/* سحب التوثيق — سبب إلزامي يُرسل للمستخدم */}
      <Modal open={Boolean(revokeTarget)} onClose={() => setRevokeTarget(null)} title="سحب التوثيق والتمييز">
        <p className="text-sm leading-7 text-steel-600">
          سيُسحب التوثيق والشارة «<strong>{revokeTarget?.vipBadgeTitle}</strong>» وكل الصلاحيات الممنوحة من{" "}
          <strong>{revokeTarget?.email}</strong> وتعود رتبته «مستخدم عادي». رصيد أثره المكتسب لا يُمس.
        </p>
        <input
          value={revokeReason}
          onChange={(e) => setRevokeReason(e.target.value)}
          className="field mt-4"
          placeholder="سبب السحب — إلزامي، يُرسل في إشعار للمستخدم"
          maxLength={300}
        />
        <div className="mt-5 flex gap-3">
          <Button variant="danger" disabled={vipBusy} onClick={submitVipRevoke}>
            تأكيد السحب وإشعار المستخدم
          </Button>
          <Button variant="ghost" onClick={() => setRevokeTarget(null)}>إلغاء</Button>
        </div>
      </Modal>

      {/* ==================== الحذف السيادي الشامل — نافذة التأكيد الثلاثية ==================== */}
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => !deleteBusy && setDeleteTarget(null)}
        title="المحو السيادي النهائي للحساب"
      >
        <div className="max-h-[70vh] space-y-4 overflow-y-auto pl-1">
          <div className="rounded-xl border border-danger-200 bg-danger-50 p-3.5">
            <p className="text-xs leading-6 text-danger-800">
              <strong className="text-danger-900">تحذير نهائي لا رجعة فيه:</strong> سيُمحى حساب{" "}
              <strong>{deleteTarget?.customName || deleteTarget?.name || deleteTarget?.email}</strong>{" "}
              محوًا برمجيًا شاملًا — تعليقاته وردوده وتصويتاته وتفاعلاته ورصيد أثره وسجل أثره ومحفوظاته
              السحابية ومواضع قراءته ونقاشاته مع الذكاء الاصطناعي ومقترحاته وإشعاراته وجلساته وأجهزته
              وروابط Google، ثم سجله الأساسي نفسه. تُحذف صوره الشخصية من التخزين السحابي فورًا ولا يبقى
              من الحساب شيء إطلاقًا — إلا قيد امتثال غير معرّف في «السجل السيادي» (التاريخ والسبب والدليل)
              وفق سياسة الخصوصية.
            </p>
          </div>

          {/* السبب الرسمي — قائمة إلزامية */}
          <div>
            <label className="mb-1.5 block text-xs font-bold text-steel-700">
              السبب الرسمي للمحو <span className="text-danger-600">*</span>
            </label>
            <select
              value={deleteReasonCode}
              onChange={(e) => setDeleteReasonCode(e.target.value)}
              className="field"
              dir="rtl"
            >
              <option value="">— اختر السبب المعتمد —</option>
              {HARD_DELETE_REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          {/* تفصيل السبب — إلزامي */}
          <div>
            <label className="mb-1.5 block text-xs font-bold text-steel-700">
              تفصيل السبب <span className="text-danger-600">*</span>
            </label>
            <textarea
              value={deleteDetails}
              onChange={(e) => setDeleteDetails(e.target.value)}
              className="field min-h-20"
              placeholder="دوّن نص المخالفة بدقة، أو نص طلب المستخدم الوارد عبر صفحة اتصل بنا — يُحفظ في السجل السيادي"
              maxLength={600}
            />
          </div>

          {/* الدليل المصور — إلزامي */}
          <div>
            <label className="mb-1.5 block text-xs font-bold text-steel-700">
              لقطة شاشة دليلية (طلب المستخدم أو إثبات المخالفة) <span className="text-danger-600">*</span>
            </label>
            {deleteEvidenceUrl ? (
              <div className="flex items-center gap-3 rounded-xl border border-success-200 bg-success-50 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={deleteEvidenceUrl} alt="الدليل" className="h-14 w-14 rounded-lg object-cover" />
                <p className="min-w-0 flex-1 truncate text-[11px] font-semibold text-success-700" dir="ltr">
                  {deleteEvidenceUrl}
                </p>
                <Button size="sm" variant="ghost" onClick={() => setDeleteEvidenceUrl("")}>
                  إزالة
                </Button>
              </div>
            ) : (
              <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-steel-200 p-5 text-center transition-colors hover:border-copper-300 hover:bg-copper-50/40">
                <span className="text-xs font-bold text-steel-600">
                  {deleteUploading ? "جارٍ الرفع إلى مجلد الأدلة المحمي.." : "اختر صورة الدليل لرفعها"}
                </span>
                <span className="text-[11px] text-steel-400">
                  تُرفع إلى «kalam/evidence» وتُوثق برابطها في قيد التدقيق
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={deleteUploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadEvidence(f);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>

          {/* كلمة التأكيد النهائي */}
          <div>
            <label className="mb-1.5 block text-xs font-bold text-steel-700">
              اكتب كلمة «حذف» للتأكيد النهائي <span className="text-danger-600">*</span>
            </label>
            <input
              value={deleteConfirmWord}
              onChange={(e) => setDeleteConfirmWord(e.target.value)}
              className="field"
              placeholder="حذف"
              maxLength={10}
            />
          </div>
        </div>

        <div className="mt-5 flex gap-3 border-t border-steel-100 pt-4">
          <Button variant="danger" disabled={deleteBusy} onClick={submitHardDelete}>
            {deleteBusy ? "جارٍ المحو البرمجي.." : "تنفيذ المحو النهائي الشامل"}
          </Button>
          <Button variant="ghost" disabled={deleteBusy} onClick={() => setDeleteTarget(null)}>
            إلغاء
          </Button>
        </div>
      </Modal>
    </div>
  );
}
