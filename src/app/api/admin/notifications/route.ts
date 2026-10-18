import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, isRejected, writeAudit, getClientIp } from "@/lib/guard";
import type { NotificationType } from "@prisma/client";

/**
 * مركز الإشعارات السيادية في لوحة الأدمن — يقرأ الجدول المركزي الموحد
 * لحساب صاحب المنصة، ويفرز أحداث السيادة الإدارية عن الإشعارات العامة:
 *  GET  ?scope=admin|all — آخر 50 إشعارًا + عدادات غير المقروء + الطارئ الأعلى
 *  POST  — تعليم الكل أو إشعارًا بعينه كمقروء، أو إخفاء نهائي { id, action: "dismiss" }
 * (المخفية dismissedAt مستبعدة من القوائم والعدادات مع بقاء التوثيق)
 */

const OWNER_EMAIL = "ziad90216@gmail.com";

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

  try {
    const owner = await prisma.user.findUnique({
      where: { email: OWNER_EMAIL },
      select: { id: true },
    });
    if (!owner) {
      return NextResponse.json({ items: [], unread: 0, unreadAdmin: 0, urgent: null });
    }

    const url = new URL(request.url);
    const scope = url.searchParams.get("scope") === "admin" ? "admin" : "all";
    const where = {
      userId: owner.id,
      ...(scope === "admin" ? { type: { in: ADMIN_TYPES } } : {}),
    };

    const [items, unread, unreadAdmin, urgent] = await Promise.all([
      prisma.notification.findMany({
        where: { ...where, dismissedAt: null },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          type: true,
          title: true,
          message: true,
          link: true,
          isRead: true,
          createdAt: true,
          metadata: true,
        },
      }),
      prisma.notification.count({ where: { userId: owner.id, isRead: false, dismissedAt: null } }),
      prisma.notification.count({
        where: { userId: owner.id, isRead: false, dismissedAt: null, type: { in: ADMIN_TYPES } },
      }),
      prisma.notification.findFirst({
        where: { userId: owner.id, isRead: false, dismissedAt: null, type: { in: ADMIN_TYPES } },
        orderBy: { createdAt: "desc" },
        select: { id: true, type: true, title: true, message: true, link: true },
      }),
    ]);

    return NextResponse.json({ items, unread, unreadAdmin, urgent });
  } catch {
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const guard = await requireSession(request);
  if (isRejected(guard)) return guard;

  try {
    const owner = await prisma.user.findUnique({
      where: { email: OWNER_EMAIL },
      select: { id: true },
    });
    if (!owner) return NextResponse.json({ ok: false }, { status: 404 });

    const body = (await request.json().catch(() => ({}))) as {
      all?: boolean;
      id?: string;
      adminOnly?: boolean;
      action?: "read" | "dismiss";
    };

    if (body.all) {
      await prisma.notification.updateMany({
        where: {
          userId: owner.id,
          isRead: false,
          dismissedAt: null,
          ...(body.adminOnly ? { type: { in: ADMIN_TYPES } } : {}),
        },
        data: { isRead: true, readAt: new Date() },
      });
    } else if (body.id && body.action === "dismiss") {
      /* الإخفاء النهائي — يخرج من القوائم والعدادات مع بقاء التوثيق */
      await prisma.notification.updateMany({
        where: { userId: owner.id, id: body.id },
        data: { dismissedAt: new Date(), isRead: true, readAt: new Date() },
      });
    } else if (body.id) {
      await prisma.notification.updateMany({
        where: { userId: owner.id, id: body.id },
        data: { isRead: true, readAt: new Date() },
      });
    }

    await writeAudit({
      adminId: guard.adminId,
      action: "notifications.read",
      entity: "Notification",
      entityId: body.id ?? (body.all ? "all" : null),
      meta: { adminOnly: body.adminOnly === true },
      ip: getClientIp(request),
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}
