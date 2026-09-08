/**
 * استدعاء إعادة التحقق الفوري في المنصة العامة لحظة النشر
 * On-Demand ISR: المنصة تعيد توليد صفحات المقال فورًا بدل انتظار 5 دقائق
 */

export async function revalidatePublicPaths(
  paths: string[],
  slug?: string,
  layout?: boolean,
): Promise<void> {
  const publicUrl = process.env.PUBLIC_URL;
  const secret = process.env.REVALIDATE_SECRET;
  if (!publicUrl || !secret) return;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    await fetch(`${publicUrl}/api/revalidate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-revalidate-secret": secret,
      },
      /* layout: إعادة تحقق على مستوى التخطيط المشترك — تُحدّث القائمة
         الجانبية الحية (الأقسام) في كل صفحات المنصة فورًا */
      body: JSON.stringify({ paths, slug, layout }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
  } catch {
    // فشل إعادة التحقق غير حرج — ISR العادي (5 دقائق) سيغطي
  }
}

export function articleRevalidatePaths(opts: {
  slug: string;
  sectionSlug?: string | null;
}): string[] {
  const paths = ["/", `/article/${opts.slug}`];
  if (opts.sectionSlug) paths.push(`/section/${opts.sectionSlug}`);
  return paths;
}
