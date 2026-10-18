"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge, Button, Card, Modal, useToast } from "@/components/ui";

type Status = "DRAFT" | "SCHEDULED" | "PUBLISHED" | "ARCHIVED";

type ArticleRow = {
  id: string;
  title: string;
  slug: string;
  status: Status;
  sectionName: string | null;
  views: number;
  readingTimeSec: number;
  hasAudio: boolean;
  hasTashkeel: boolean;
  updatedAt: string;
  publishedAt: string | null;
  scheduledAt: string | null;
};

const STATUS_LABELS: Record<Status, { label: string; tone: "neutral" | "success" | "warn" | "steel" }> = {
  DRAFT: { label: "مسودة", tone: "neutral" },
  SCHEDULED: { label: "مجدول", tone: "warn" },
  PUBLISHED: { label: "منشور", tone: "success" },
  ARCHIVED: { label: "مؤرشف", tone: "steel" },
};

const fmt = (n: number) => new Intl.NumberFormat("ar-EG").format(n);
const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short" }).format(new Date(iso));

export function ArticlesTable({
  articles,
  sections,
}: {
  articles: ArticleRow[];
  sections: { id: string; name: string }[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | Status>("ALL");
  const [deleteTarget, setDeleteTarget] = useState<ArticleRow | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(
    () =>
      articles.filter(
        (a) =>
          (statusFilter === "ALL" || a.status === statusFilter) &&
          (!query || a.title.includes(query)),
      ),
    [articles, statusFilter, query],
  );

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/articles/${deleteTarget.id}`, { method: "DELETE" });
      if (res.ok) {
        toast("تم حذف المقال نهائيًا");
        setDeleteTarget(null);
        router.refresh();
      } else {
        toast("تعذر الحذف", "error");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-steel-900">المقالات</h1>
          <p className="text-sm text-steel-500">{fmt(articles.length)} مقالًا في المكتبة</p>
        </div>
        <Link href="/articles/new">
          <Button>+ مقال جديد</Button>
        </Link>
      </div>

      {/* أدوات التصفية */}
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث بالعنوان.."
          className="field max-w-xs"
        />
        <div className="flex flex-wrap gap-2">
          {(["ALL", "PUBLISHED", "SCHEDULED", "DRAFT", "ARCHIVED"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-all ${
                statusFilter === s ? "bg-steel-900 text-white" : "bg-steel-100 text-steel-500 hover:bg-steel-200"
              }`}
            >
              {s === "ALL" ? "الكل" : STATUS_LABELS[s].label}
            </button>
          ))}
        </div>
      </Card>

      {/* الجدول */}
      <Card className="overflow-x-auto">
        <table className="admin-table min-w-[900px]">
          <thead>
            <tr>
              <th>العنوان</th>
              <th>القسم</th>
              <th>الحالة</th>
              <th>مشاهدات</th>
              <th>الوسائط</th>
              <th>آخر تحديث</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-14 text-center text-sm text-steel-400">
                  لا نتائج — ابدأ بكتابة أول مقال «له لازمة»
                </td>
              </tr>
            ) : (
              filtered.map((a) => (
                <tr key={a.id}>
                  <td>
                    <p className="font-bold text-steel-900">{a.title}</p>
                    <p className="mt-0.5 text-[11px] text-steel-400" dir="ltr">
                      /{a.slug}
                    </p>
                  </td>
                  <td className="text-xs text-steel-500">{a.sectionName || "—"}</td>
                  <td>
                    <Badge tone={STATUS_LABELS[a.status].tone}>{STATUS_LABELS[a.status].label}</Badge>
                    {a.status === "SCHEDULED" && a.scheduledAt && (
                      <p className="mt-1 text-[10px] text-steel-400">{fmtDate(a.scheduledAt)}</p>
                    )}
                  </td>
                  <td className="text-sm font-bold text-steel-700">{fmt(a.views)}</td>
                  <td className="text-xs">
                    <span className={a.hasTashkeel ? "text-success-600" : "text-steel-300"}>تشكيل {a.hasTashkeel ? "✓" : "✗"} </span>
                    <span className={a.hasAudio ? "text-success-600" : "text-steel-300"}> صوت {a.hasAudio ? "✓" : "✗"}</span>
                  </td>
                  <td className="text-xs text-steel-400">{fmtDate(a.updatedAt)}</td>
                  <td>
                    <div className="flex gap-2">
                      <Link href={`/articles/${a.id}`}>
                        <Button variant="outline" size="sm">تحرير</Button>
                      </Link>
                      <Button variant="danger" size="sm" onClick={() => setDeleteTarget(a)}>
                        حذف
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      <Modal open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title="تأكيد الحذف النهائي">
        <p className="text-sm leading-7 text-steel-600">
          سيُحذف المقال «{deleteTarget?.title}» نهائيًا مع كل تعليقاته وتفاعلاته.
          هذا الإجراء لا يمكن التراجع عنه.
        </p>
        <div className="mt-5 flex gap-3">
          <Button variant="danger" onClick={confirmDelete} disabled={busy}>
            {busy ? "جارٍ الحذف.." : "نعم، احذف نهائيًا"}
          </Button>
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
            إلغاء
          </Button>
        </div>
      </Modal>
    </div>
  );
}
