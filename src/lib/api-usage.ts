import { prisma } from "@/lib/prisma";

/**
 * عدادات الاستهلاك اليومي للواجهات الخارجية — جدول ApiUsageCounter المشترك.
 * يوم القاهرة، upsert تزايدي آمن، وفشله لا يعطل المسار الأصلي أبدًا.
 */

export type ApiProvider = "GEMINI_CHAT" | "GEMINI_TTS" | "RESEND_EMAIL" | "CLOUDINARY_UPLOAD";

export function cairoDayKey(offsetDays = 0): string {
  const cairo = new Date(Date.now() + 3 * 60 * 60 * 1000 + offsetDays * 86_400_000);
  return cairo.toISOString().slice(0, 10);
}

export async function bumpApiUsage(provider: ApiProvider, by = 1): Promise<void> {
  try {
    await prisma.apiUsageCounter.upsert({
      where: { provider_day: { provider, day: cairoDayKey() } },
      update: { count: { increment: by } },
      create: { provider, day: cairoDayKey(), count: by },
    });
  } catch {
    /* العداد زينة رقابية — لا يعطل المسار الأصلي */
  }
}
