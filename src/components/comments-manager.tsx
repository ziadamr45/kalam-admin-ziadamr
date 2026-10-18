"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Modal, useToast } from "@/components/ui";

type CommentRow = {
  id: string;
  content: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  flagged: boolean;
  flagReasons: string[];
  riskScore: number;
  reportCount: number;
  editedByAdmin: boolean;
  isInspiring: boolean;
  createdAt: string;
  articleTitle: string;
  articleSlug: string;
  authorName: string;
  authorEmail: string | null;
  authorBanned: boolean;
  authorCustomName: string | null;
  authorRank: string | null;
  authorScore: number | null;
  isGuest: boolean;
  userId: string | null;
};

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat("ar-EG", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

const TABS = [
  { key: "PENDING", label: "بانتظار المراجعة" },
  { key: "APPROVED", label: "معتمدة" },
  { key: "REJECTED", label: "مرفوضة" },
  { key: "flagged", label: "مبلَّغة" },
  { key: "ALL", label: "الكل" },
] as const;

export function CommentsManager() {
  const router = useRouter();
  const { toast } = useToast();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("PENDING");
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [banTarget, setBanTarget] = useState<CommentRow | null>(null);
  const [banReason, setBanReason] = useState("مخالفة أدب الحوار والقيم");
  const [deleteTarget, setDeleteTarget] = useState<CommentRow | null>(null);
  /* نافذة التمييز الإلزامية — السبب موثق في سجل أثر القارئ وإشعاره */
  const [inspireTarget, setInspireTarget] = useState<{ row: CommentRow; featured: boolean } | null>(null);
  const [inspireReason, setInspireReason] = useState("");
  const [inspireBusy, setInspireBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const param = tab === "flagged" ? "ALL&flagged=1" : tab;
      const res = await fetch(`/api/comments?status=${param}`);
      const data = await res.json();
      setComments(
        (data.comments ?? []).map((c: Record<string, unknown>) => ({
          id: c.id as string,
          content: c.content as string,
          status: c.status as CommentRow["status"],
          flagged: c.flagged as boolean,
          flagReasons: (c.flagReasons as string[]) ?? [],
          riskScore: c.riskScore as number,
          reportCount: c.reportCount as number,
          editedByAdmin: c.editedByAdmin as boolean,
          createdAt: c.createdAt as string,
          articleTitle: (c.article as { title?: string } | null)?.title ?? "",
          articleSlug: (c.article as { slug?: string } | null)?.slug ?? "",
          authorName: (c.user as { name?: string } | null)?.name || "قارئ مسجل",
          authorEmail: (c.user as { email?: string } | null)?.email ?? null,
          authorBanned: (c.user as { banned?: boolean } | null)?.banned ?? false,
          authorCustomName: (c.user as { customName?: string } | null)?.customName ?? null,
          authorRank: (c.user as { intellectualRank?: string } | null)?.intellectualRank ?? null,
          authorScore: (c.user as { impactScore?: number } | null)?.impactScore ?? null,
          isInspiring: (c.isInspiring as boolean) ?? false,
          isGuest: !c.userId,
          userId: (c.userId as string) ?? null,
        })),
      );
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (id: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/comments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      toast("تم تنفيذ الإجراء");
      load();
    } else {
      toast("تعذر تنفيذ الإجراء", "error");
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    const res = await fetch(`/api/comments/${deleteTarget.id}`, { method: "DELETE" });
    if (res.ok) {
      toast("حُذف التعليق نهائيًا");
      setDeleteTarget(null);
      load();
    }
  };

  const banUser = async () => {
    if (!banTarget?.userId) return;
    const res = await fetch(`/api/comments/${banTarget.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ banReason }),
    });
    if (res.ok) {
      toast("حُظر المستخدم نهائيًا ورفضت تعليقاته المعلقة");
      setBanTarget(null);
      load();
    } else {
      toast("تعذر الحظر", "error");
    }
  };

  const submitInspiring = async () => {
    if (!inspireTarget) return;
    const reason = inspireReason.trim();
    if (reason.length < 5) {
      toast(inspireTarget.featured ? "اكتب سبب التمييز — 5 أحرف فأكثر" : "اكتب سبب إلغاء التمييز — 5 أحرف فأكثر", "error");
      return;
    }
    setInspireBusy(true);
    try {
      const res = await fetch(`/api/comments/${inspireTarget.row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isInspiring: inspireTarget.featured, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const delta = (data?.pointsDelta as number) ?? 0;
        toast(
          inspireTarget.featured
            ? `ميّزت التعليق — +${delta} نقطة أثر للمعلّق وتثبيت أعلى المقال`
            : `أُلغي التمييز — خُصم ${Math.abs(delta)} نقطة من رصيد المعلّق`,
        );
        setInspireTarget(null);
        setInspireReason("");
        load();
      } else {
        toast(data?.error || "تعذر تنفيذ التمييز", "error");
      }
    } finally {
      setInspireBusy(false);
    }
  };

  const riskTone = (score: number) =>
    score >= 0.7 ? "danger" : score >= 0.4 ? "warn" : "neutral";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-steel-900">مركز التعليقات</h1>
        <p className="text-sm text-steel-500">
          تحكم كامل في كل كلمة يكتبها الزوار — اعتماد، تعديل، حذف، أو حظر نهائي
        </p>
      </div>

      {/* التبويبات */}
      <Card className="flex flex-wrap gap-2 p-3">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-full px-4 py-2 text-xs font-bold transition-all ${
              tab === t.key ? "bg-steel-900 text-white" : "bg-steel-100 text-steel-500 hover:bg-steel-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </Card>

      {/* القائمة */}
      {loading ? (
        <p className="py-16 text-center text-sm text-steel-400">جارٍ التحميل..</p>
      ) : comments.length === 0 ? (
        <Card className="py-16 text-center text-sm text-steel-400">
          لا تعليقات في هذا التصنيف
        </Card>
      ) : (
        <div className="space-y-4">
          {comments.map((c) => (
            <Card key={c.id} className="p-5">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-steel-100 text-xs font-bold text-steel-600">
                  {c.authorName.charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-steel-900">
                    {c.authorName}
                    {c.authorCustomName && (
                      <span className="mr-2 text-[11px] font-bold text-copper-600">يعرض باسم: {c.authorCustomName}</span>
                    )}
                    {c.authorBanned && <span className="mr-2 text-[10px] text-danger-600">(محظور)</span>}
                  </p>
                  <p className="text-[11px] text-steel-400">
                    {c.authorEmail && <span dir="ltr">{c.authorEmail}</span>}
                    {c.authorRank && ` · ${c.authorRank}${c.authorScore !== null ? ` · رصيد ${new Intl.NumberFormat("ar-EG").format(c.authorScore)}` : ""}`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {c.isInspiring && <Badge tone="success">✦ فكري ملهم</Badge>}
                  <Badge tone={c.status === "APPROVED" ? "success" : c.status === "REJECTED" ? "danger" : "warn"}>
                    {c.status === "APPROVED" ? "معتمد" : c.status === "REJECTED" ? "مرفوض" : "قيد المراجعة"}
                  </Badge>
                  {c.flagged && <Badge tone="warn">مبلَّغ عنه {c.reportCount > 0 ? `(${c.reportCount})` : ""}</Badge>}
                  {c.riskScore >= 0.4 && <Badge tone={riskTone(c.riskScore)}>خطورة {Math.round(c.riskScore * 100)}%</Badge>}
                  {c.editedByAdmin && <Badge tone="steel">عُدّل إداريًا</Badge>}
                </div>
              </div>

              {editingId === c.id ? (
                <div className="space-y-3">
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={3}
                    className="field resize-none leading-8"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => { act(c.id, { content: editText }); setEditingId(null); }}>
                      حفظ التعديل
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      إلغاء
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm leading-8 text-steel-700">{c.content}</p>
              )}

              {c.flagReasons.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {c.flagReasons.map((r, i) => (
                    <Badge key={i} tone="warn">{r}</Badge>
                  ))}
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-steel-100 pt-3">
                <p className="text-[11px] text-steel-400">
                  عن «{c.articleTitle}» — {fmtDate(c.createdAt)}
                </p>
                <div className="flex flex-wrap gap-2">
                  {c.status !== "APPROVED" && (
                    <Button size="sm" variant="success" onClick={() => act(c.id, { status: "APPROVED" })}>
                      اعتماد
                    </Button>
                  )}
                  {c.status !== "REJECTED" && (
                    <Button size="sm" variant="outline" onClick={() => act(c.id, { status: "REJECTED" })}>
                      رفض
                    </Button>
                  )}
                  {c.status === "APPROVED" && !c.isGuest && c.userId && !c.authorBanned && (
                    <Button
                      size="sm"
                      variant={c.isInspiring ? "outline" : "success"}
                      onClick={() => {
                        setInspireReason("");
                        setInspireTarget({ row: c, featured: !c.isInspiring });
                      }}
                      title="منح +10 رصيد أثر للمعلّق وتثبيت تعليقه أعلى المقال — السبب إلزامي"
                    >
                      {c.isInspiring ? "إلغاء التمييز" : "✦ تعيين كتعليق ملهم"}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingId(c.id);
                      setEditText(c.content);
                    }}
                  >
                    تعديل
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => setDeleteTarget(c)}>
                    حذف
                  </Button>
                  {!c.isGuest && c.userId && !c.authorBanned && (
                    <Button size="sm" variant="danger" onClick={() => setBanTarget(c)}>
                      حظر نهائي
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* مودالات */}
      <Modal open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title="حذف التعليق نهائيًا">
        <p className="text-sm leading-7 text-steel-600">
          سيُحذف التعليق نهائيًا. هل أنت متأكد؟
        </p>
        <div className="mt-5 flex gap-3">
          <Button variant="danger" onClick={remove}>نعم، احذف</Button>
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>إلغاء</Button>
        </div>
      </Modal>

      <Modal open={Boolean(banTarget)} onClose={() => setBanTarget(null)} title="حظر المستخدم نهائيًا">
        <p className="text-sm leading-7 text-steel-600">
          سيُحظر <strong>{banTarget?.authorEmail}</strong> نهائيًا: لن يستطيع الدخول أو التعليق أو التفاعل مجددًا،
          وستُرفض كل تعليقاته المعلقة.
        </p>
        <input
          value={banReason}
          onChange={(e) => setBanReason(e.target.value)}
          className="field mt-4"
          placeholder="سبب الحظر (يُسجل في سجل التدقيق)"
        />
        <div className="mt-5 flex gap-3">
          <Button variant="danger" onClick={banUser}>تأكيد الحظر النهائي</Button>
          <Button variant="ghost" onClick={() => setBanTarget(null)}>إلغاء</Button>
        </div>
      </Modal>

      {/* نافذة التمييز/إلغائه — السبب إلزامي، والمعاملة ذرّية (±10 نقاط موثقة) */}
      <Modal
        open={Boolean(inspireTarget)}
        onClose={() => (inspireBusy ? null : setInspireTarget(null))}
        title={inspireTarget?.featured ? "✦ تمييز تعليق فكري ملهم" : "إلغاء التمييز"}
      >
        <p className="text-sm leading-7 text-steel-600">
          {inspireTarget?.featured ? (
            <>
              سيُثبَّت تعليق <strong>{inspireTarget?.row.authorName}</strong> أعلى حوار المقال، ويحصل صاحبه فورًا على
              <strong className="text-copper-600"> +10 نقاط أثر</strong> مع إشعار يحمل سبب التمييز.
            </>
          ) : (
            <>
              سيُرفع التمييز وتثبيت التعليق، وتُخصم فورًا
              <strong className="text-danger-600"> 10 نقاط أثر</strong> من رصيد صاحبه مع إشعار يحمل سبب الإلغاء.
            </>
          )}
        </p>
        <textarea
          value={inspireReason}
          onChange={(e) => setInspireReason(e.target.value)}
          rows={3}
          className="field mt-4 resize-none leading-7"
          placeholder={
            inspireTarget?.featured
              ? "سبب التمييز — إلزامي (مثل: إضافة فكرية قيّمة، تلخيص رائع)"
              : "سبب إلغاء التمييز — إلزامي (مثل: مراجعة التنسيق، التعليق لا يستوفي الشروط)"
          }
        />
        <p className="mt-1.5 text-[11px] text-steel-400">
          {inspireReason.trim().length}/5 أحرف كحد أدنى — يُوثَّق السبب في سجل أثر القارئ وسجل التدقيق
        </p>
        <div className="mt-5 flex gap-3">
          <Button
            variant={inspireTarget?.featured ? "success" : "danger"}
            disabled={inspireBusy || inspireReason.trim().length < 5}
            onClick={submitInspiring}
          >
            {inspireBusy ? "جارٍ التنفيذ.." : inspireTarget?.featured ? "تأكيد التمييز (+10)" : "تأكيد الإلغاء (-10)"}
          </Button>
          <Button variant="ghost" disabled={inspireBusy} onClick={() => setInspireTarget(null)}>
            إلغاء
          </Button>
        </div>
      </Modal>
    </div>
  );
}
