"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, useToast } from "@/components/ui";

type ProposalRow = {
  id: string;
  title: string;
  content: string;
  handled: boolean;
  createdAt: string;
  authorName: string;
  authorEmail: string | null;
  authorImage: string | null;
  authorRank: string;
  authorScore: number;
};

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso),
  );

/** قناة «أهل الكلمة» — مقترحات فكرية خاصة وصلت من أصحاب أعلى رتبة */
export function ProposalsManager() {
  const { toast } = useToast();
  const [items, setItems] = useState<ProposalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/proposals");
      const data = await res.json();
      setItems(
        (data.proposals ?? []).map((p: Record<string, unknown>) => ({
          id: p.id as string,
          title: p.title as string,
          content: p.content as string,
          handled: p.handled as boolean,
          createdAt: p.createdAt as string,
          authorName:
            (p.user as { customName?: string } | null)?.customName ||
            (p.user as { name?: string } | null)?.name ||
            "قارئ",
          authorEmail: (p.user as { email?: string } | null)?.email ?? null,
          authorImage: (p.user as { customImage?: string; image?: string } | null)?.customImage ??
            (p.user as { image?: string } | null)?.image ?? null,
          authorRank: (p.user as { intellectualRank?: string } | null)?.intellectualRank ?? "قارئ متأمل",
          authorScore: (p.user as { impactScore?: number } | null)?.impactScore ?? 0,
        })),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setHandled = async (id: string, handled: boolean) => {
    const res = await fetch("/api/proposals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, handled }),
    });
    if (res.ok) {
      toast(handled ? "عُلّم المقترح كمُعالَج" : "أُعيد فتح المقترح");
      load();
    } else {
      toast("تعذر تنفيذ الإجراء", "error");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-steel-900">المقترحات الفكرية</h1>
        <p className="text-sm text-steel-500">
          قناة «أهل الكلمة» الخاصة — موضوعات ومقترحات ترسل مباشرة من أصحاب أعلى رتبة فكرية
        </p>
      </div>

      {loading ? (
        <p className="py-16 text-center text-sm text-steel-400">جارٍ التحميل..</p>
      ) : items.length === 0 ? (
        <Card className="py-16 text-center text-sm text-steel-400">
          لا مقترحات بعد — تُفتح القناة تلقائيًا لمن يبلغ رتبة «أهل الكلمة» (350 نقطة أثر)
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map((p) => (
            <Card key={p.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  {p.authorImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.authorImage} alt="" className="h-10 w-10 rounded-full" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-steel-100 text-sm font-bold text-steel-600">
                      {p.authorName.charAt(0)}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-steel-900">{p.authorName}</p>
                    <p className="text-[11px] text-steel-400">
                      {p.authorEmail && <span dir="ltr">{p.authorEmail}</span>} · {p.authorRank} · رصيد{" "}
                      {new Intl.NumberFormat("ar-EG").format(p.authorScore)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {p.handled ? (
                    <span className="rounded-full bg-success-400/10 px-2.5 py-1 text-[10px] font-bold text-success-600">
                      مُعالَج
                    </span>
                  ) : (
                    <span className="rounded-full bg-copper-500/15 px-2.5 py-1 text-[10px] font-bold text-copper-600">
                      جديد
                    </span>
                  )}
                  <span className="text-[11px] text-steel-400">{fmtDate(p.createdAt)}</span>
                </div>
              </div>

              <h3 className="mt-4 text-sm font-bold text-steel-800">{p.title}</h3>
              {openId === p.id ? (
                <>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-8 text-steel-700">{p.content}</p>
                  <div className="mt-4 flex gap-2">
                    <Button size="sm" variant={p.handled ? "outline" : "success"} onClick={() => setHandled(p.id, !p.handled)}>
                      {p.handled ? "إعادة فتح" : "علّم مُعالَجًا"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setOpenId(null)}>طوِ النص</Button>
                  </div>
                </>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setOpenId(p.id)}>قراءة المقترح كاملًا</Button>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
