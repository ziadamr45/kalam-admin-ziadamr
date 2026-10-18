import { prisma } from "@/lib/prisma";
import { requireSession, isRejected } from "@/lib/guard";
import type { NotificationType } from "@prisma/client";

/**
 * نبض الإشعارات السيادية اللحظي (SSE) — نفس دورة حياة نبض المنصة العامة:
 * نبض كل 15 ثانية يقرأ عدادات غير المقروء وأعلى طارئ إداري، ويُغلق ذاتيًا
 * بعد 50 ثانية ويعيد EventSource الاتصال تلقائيًا.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const OWNER_EMAIL = "ziad90216@gmail.com";
const TICK_MS = 15_000;
const LIFETIME_MS = 50_000;

const ADMIN_TYPES: NotificationType[] = [
  "ADMIN_NEW_USER",
  "ADMIN_NEW_COMMENT",
  "ADMIN_NEW_PROPOSAL",
  "ADMIN_COMMENT_REPORTED",
  "ADMIN_SYSTEM_ALERT",
];

export async function GET(request: Request) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  const owner = await prisma.user.findUnique({
    where: { email: OWNER_EMAIL },
    select: { id: true },
  });
  if (!owner) return new Response("no-owner", { status: 404 });
  const userId = owner.id;

  const encoder = new TextEncoder();
  let interval: ReturnType<typeof setInterval> | null = null;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let lastUnreadAdmin = -1;
      let lastId: string | null = null;

      const send = (data: unknown): void => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      const stop = (): void => {
        if (closed) return;
        closed = true;
        if (interval) clearInterval(interval);
        if (timeout) clearTimeout(timeout);
        try {
          controller.close();
        } catch {
          /* أُغلق مسبقًا */
        }
      };

      const tick = async (isFirst = false): Promise<void> => {
        try {
          const [unreadAdmin, latest] = await Promise.all([
            prisma.notification.count({
              where: { userId, isRead: false, dismissedAt: null, type: { in: ADMIN_TYPES } },
            }),
            prisma.notification.findFirst({
              where: { userId, dismissedAt: null, type: { in: ADMIN_TYPES } },
              orderBy: { createdAt: "desc" },
              select: { id: true, title: true, message: true, link: true, type: true },
            }),
          ]);
          /* النبضة الأولى تؤسس خط الأساس صامتة — لا إعادة إطلاق لإشعارات
             قديمة عند الرفريش، والطوارئ الجديدة الحية فقط تُبث بisNewItem */
          if (isFirst) {
            lastUnreadAdmin = unreadAdmin;
            lastId = latest?.id ?? null;
            send({ unreadAdmin, isNewItem: false });
            return;
          }
          const changed = unreadAdmin !== lastUnreadAdmin || (latest && latest.id !== lastId);
          if (changed) {
            const isNewItem = Boolean(latest && latest.id !== lastId && unreadAdmin > lastUnreadAdmin);
            lastUnreadAdmin = unreadAdmin;
            lastId = latest?.id ?? null;
            send({ unreadAdmin, isNewItem, latest: isNewItem ? latest : undefined });
          } else {
            send({ heartbeat: true, unreadAdmin });
          }
        } catch {
          send({ heartbeat: true });
        }
      };

      await tick(true);
      interval = setInterval(() => void tick(), TICK_MS);
      timeout = setTimeout(stop, LIFETIME_MS);
    },
    cancel() {
      closed = true;
      if (interval) clearInterval(interval);
      if (timeout) clearTimeout(timeout);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
