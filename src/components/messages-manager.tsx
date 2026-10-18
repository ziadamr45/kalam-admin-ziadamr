"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, useToast } from "@/components/ui";

type Message = {
  id: string;
  name: string;
  email: string | null;
  subject: string | null;
  body: string;
  read: boolean;
  createdAt: string;
};

function fmt(iso: string) {
  return new Intl.DateTimeFormat("ar-EG", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function MessagesManager() {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/messages?filter=${filter}`);
      const data = await res.json();
      setMessages(data.messages ?? []);
    } catch {}
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const markRead = async (m: Message, read: boolean) => {
    await fetch(`/api/messages/${m.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ read }),
    }).catch(() => {});
    if (m.read !== read) load();
  };

  const remove = async (m: Message) => {
    if (!confirm(`حذف رسالة ${m.name} نهائيًا؟`)) return;
    const res = await fetch(`/api/messages/${m.id}`, { method: "DELETE" });
    if (res.ok) {
      toast("حُذفت الرسالة", "success");
      load();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-steel-900">رسائل التواصل</h1>
          <p className="mt-1 text-sm text-steel-500">
            ما يرسله الزوار من صفحة «اتصل بنا» يصل إلى هنا مباشرة.
          </p>
        </div>
        <div className="flex gap-1.5">
          {(["all", "unread"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition-colors ${
                filter === f ? "bg-copper-600 text-white" : "bg-steel-100 text-steel-600"
              }`}
            >
              {f === "all" ? "كل الرسائل" : "غير المقروءة"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <Card className="p-10 text-center text-sm text-steel-400">جارٍ التحميل..</Card>
      ) : messages.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-sm font-bold text-steel-700">لا رسائل بعد</p>
          <p className="mt-2 text-xs text-steel-400">أول رسالة من صفحة اتصل بنا ستظهر هنا فور وصولها.</p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {messages.map((m) => (
            <Card key={m.id} className={`p-5 ${m.read ? "opacity-80" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-steel-900">{m.name}</p>
                    {!m.read && <Badge tone="copper">جديدة</Badge>}
                  </div>
                  {m.email && (
                    <a
                      href={`mailto:${m.email}`}
                      className="mt-0.5 block text-xs text-copper-700 hover:underline"
                      dir="ltr"
                    >
                      {m.email}
                    </a>
                  )}
                </div>
                <span className="text-[10px] text-steel-400">{fmt(m.createdAt)}</span>
              </div>

              {m.subject && (
                <p className="mt-3 text-sm font-bold text-steel-700">{m.subject}</p>
              )}
              <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-steel-600">{m.body}</p>

              <div className="mt-4 flex flex-wrap gap-2">
                {!m.read && (
                  <Button size="sm" variant="outline" onClick={() => markRead(m, true)}>
                    تعليم كمقروءة
                  </Button>
                )}
                {m.read && (
                  <Button size="sm" variant="ghost" onClick={() => markRead(m, false)}>
                    تعليم كغير مقروءة
                  </Button>
                )}
                {m.email && (
                  <a
                    href={`mailto:${m.email}?subject=${encodeURIComponent("رد: " + (m.subject || "رسالتك في كلام له لازمة"))}`}
                    className="inline-flex items-center gap-2 rounded-xl border border-steel-200 px-3 py-1.5 text-xs font-bold text-steel-700 transition-all hover:border-copper-500 hover:text-copper-700"
                  >
                    الرد عبر البريد
                  </a>
                )}
                <Button size="sm" variant="danger" onClick={() => remove(m)}>
                  حذف
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
