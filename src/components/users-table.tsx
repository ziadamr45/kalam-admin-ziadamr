"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Modal, useToast } from "@/components/ui";

type UserRow = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  banned: boolean;
  banReason: string | null;
  commentsCount: number;
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
  const [reason, setReason] = useState("مخالفة أدب الحوار والقيم");
  const [busy, setBusy] = useState(false);

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-steel-900">المستخدمون</h1>
        <p className="text-sm text-steel-500">{fmt(users.length)} مستخدمًا مسجلًا بحساب Google</p>
      </div>

      <Card className="overflow-x-auto">
        <table className="admin-table min-w-[800px]">
          <thead>
            <tr>
              <th>المستخدم</th>
              <th>البريد</th>
              <th>التعليقات</th>
              <th>الحالة</th>
              <th>انضم في</th>
              <th>إجراء</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-14 text-center text-sm text-steel-400">
                  لا مستخدمين بعد
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id}>
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
                  <td className="text-xs text-steel-500" dir="ltr">{u.email}</td>
                  <td className="font-bold text-steel-700">{fmt(u.commentsCount)}</td>
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
                    {u.banned ? (
                      <Button size="sm" variant="outline" onClick={() => setUnbanTarget(u)}>
                        رفع الحظر
                      </Button>
                    ) : (
                      <Button size="sm" variant="danger" onClick={() => setBanTarget(u)}>
                        حظر
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

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
    </div>
  );
}
