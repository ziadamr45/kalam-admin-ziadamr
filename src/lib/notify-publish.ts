import { prisma } from "@/lib/prisma";
import { pushUsers } from "@/lib/push";

/**
 * إشعار القراء بنشر مقال جديد — الحلقة المفقودة بين مسار النشر وجرس المنصة.
 *
 * الجرس العام للمستخدمين يقرأ من جدول Notification المركزي (عبر واجهة
 * /api/notifications في المنصة العامة)، ومسار النشر في اللوحة كان يكتفي
 * بتحديث الحالة دون كتابة أي سجل هنا فلا يصل القراء شيء.
 *
 * القناتان وفق دلالات المرسل المركزي في المنصة العامة:
 * - الجرس الداخلي: لكل المستخدمين غير المحظورين، دائمًا.
 * - البث الفوري (Web Push): لمن رخّص بتفضيل «إشعارات المتصفح للمقالات
 *   الجديدة» في مركز تفضيلاته (pushNewArticles).
 *
 * كل قناة معزولة بـ catch — فشل الإشعار لا يُسقط النشر أبدًا.
 */
export async function notifyArticlePublished(article: {
  id: string;
  title: string;
  slug: string;
  summary?: string | null;
}): Promise<{ inApp: number; push: number }> {
  try {
    const users = await prisma.user.findMany({
      where: { banned: false },
      select: { id: true, notificationPrefs: true },
    });
    if (users.length === 0) return { inApp: 0, push: 0 };

    const link = `/article/${article.slug}`;
    const title = `مقال جديد: ${article.title}`.slice(0, 200);
    const message = (
      article.summary?.trim() || "مقال جديد انضم إلى المنصة — اقرأه الآن"
    ).slice(0, 500);

    /* 1) جرس المنصة الموحد — يظهر لكل القراء غير المحظورين */
    let inApp = 0;
    try {
      const created = await prisma.notification.createMany({
        data: users.map((u) => ({
          userId: u.id,
          type: "ARTICLE_PUBLISHED" as const,
          title,
          message,
          link,
          channel: "IN_APP" as const,
          metadata: { articleId: article.id } as never,
        })),
      });
      inApp = created.count;
    } catch {}

    /* 2) البث الفوري — فقط لمن رخّص بتفضيل إشعارات المقالات الجديدة */
    let push = 0;
    try {
      const pushIds = users
        .filter(
          (u) =>
            (u.notificationPrefs as { pushNewArticles?: boolean } | null)
              ?.pushNewArticles !== false,
        )
        .map((u) => u.id);
      if (pushIds.length > 0) {
        push = await pushUsers(
          {
            title: title.slice(0, 120),
            body: message.slice(0, 180),
            url: link,
            tag: "article-published",
          },
          { userIds: pushIds },
        );
      }
    } catch {}

    return { inApp, push };
  } catch {
    return { inApp: 0, push: 0 };
  }
}
