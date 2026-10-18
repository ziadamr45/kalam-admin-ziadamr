/**
 * ترحيل بيانات لمرة واحدة — منظومة الإشعارات الموحدة والروابط الاجتماعية:
 * 1) نسخ كل صفوف UserNotification التراثية إلى جدول Notification الموحد
 * 2) تحويل personalLinks (portfolio/github/devto/linkedin/x) إلى verifiedSocialLinks
 *    (website/facebook/instagram/telegram/whatsapp/youtube/tiktok/x/linkedin)
 * idempotent — آمن لإعادة التشغيل
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function migrateNotifications(): Promise<void> {
  const legacy = await prisma.userNotification.findMany({
    orderBy: { createdAt: "asc" },
  });
  if (legacy.length === 0) {
    console.log("notifications: no legacy rows — skipped");
    return;
  }
  // مفتاح منع التكرار: title+userId+createdAt
  const existing = await prisma.notification.findMany({
    select: { userId: true, title: true, createdAt: true },
  });
  const seen = new Set(
    existing.map((r) => `${r.userId}|${r.title}|${r.createdAt.toISOString()}`),
  );
  let copied = 0;
  for (const row of legacy) {
    const key = `${row.userId}|${row.title}|${row.createdAt.toISOString()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await prisma.notification.create({
      data: {
        userId: row.userId,
        type: "BROADCAST",
        title: row.title,
        message: row.body,
        link: row.url ?? null,
        isRead: row.readAt !== null,
        readAt: row.readAt,
        channel: "ALL",
        createdAt: row.createdAt,
        metadata: { legacyKind: row.kind, migrated: true },
      },
    });
    copied++;
  }
  console.log(`notifications: copied ${copied}/${legacy.length} legacy rows`);
}

async function migrateSocialLinks(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { personalLinks: { not: PrismaClient.DbNull } },
    select: { id: true, personalLinks: true, verifiedSocialLinks: true },
  });
  let migrated = 0;
  for (const u of users) {
    if (u.verifiedSocialLinks && typeof u.verifiedSocialLinks === "object") continue; // لا تلمس من له روابط جديدة
    const raw = (u.personalLinks ?? {}) as Record<string, unknown>;
    const out: Record<string, string> = {};
    const pick = (k: string, target: string): void => {
      const v = raw[k];
      if (typeof v === "string" && /^https:\/\/[^\s]+$/i.test(v.trim())) out[target] = v.trim();
    };
    pick("portfolio", "website");
    pick("linkedin", "linkedin");
    pick("x", "x");
    if (Object.keys(out).length === 0) continue;
    await prisma.user.update({
      where: { id: u.id },
      data: { verifiedSocialLinks: out },
    });
    migrated++;
  }
  console.log(`socialLinks: migrated ${migrated}/${users.length} users`);
}

async function main(): Promise<void> {
  await migrateNotifications();
  await migrateSocialLinks();
  const [notif, unread, withSocial] = await Promise.all([
    prisma.notification.count(),
    prisma.notification.count({ where: { isRead: false } }),
    prisma.user.count({ where: { verifiedSocialLinks: { not: PrismaClient.DbNull } } }),
  ]);
  console.log(`verify: Notification rows=${notif}, unread=${unread}, usersWithSocialLinks=${withSocial}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
