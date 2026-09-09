/**
 * ============================================================
 * محرك رصيد الأثر — الاقتصاد المعاير (Calibrated Points Economy)
 * ============================================================
 * مبادئ صارمة:
 * 1. كل نقطة تُوثَّق في جدول ImpactLog — لا رصيد بلا سجل شفاف.
 * 2. منع التكرار بمفتاح dedupKey فريد أو بوابات updateMany الشرطية
 *    داخل المعاملة (آمن ضد التزامن والزرع الآلي).
 * 3. السقوف اليومية تُحتسب بتوقيت القاهرة حمايةً من تربية النقاط.
 * 4. الرصيد لا ينزل تحت الصفر، والرتبة تُعاد حسابها مع كل حركة.
 * 5. عتبة «أهل الكلمة» (350) يُحتفى بها فور عبورها بإشعار وتوثيق.
 * 6. لا تُرمى أخطاء المنح لأعلى — المنظومة زينة لا تُعطّل مسارًا أساسيًا.
 *
 * الأوزان المعايرة (رصينة ومحكمة — قيمة كل نقطة تعبّر عن جهد حقيقي):
 * READ_COMPLETE +1 (مرتان يوميًا كحد أقصى) | COMMENT_APPROVED +2
 * COMMENT_LIKED +1 | COMMENT_INSPIRING +10 | COMMENT_UNFEATURED -10
 * AI_DISCUSS +1 | QUOTE_SHARE +1
 */

import { prisma } from "@/lib/prisma";
import { rankForScore } from "@/lib/ranks";

/** عتبة رتبة «أهل الكلمة» — قناة المقترحات الخاصة */
export const ELDERS_THRESHOLD = 350;

export const IMPACT_POINTS = {
  READ_COMPLETE: 1,
  AI_DISCUSS: 1,
  COMMENT_APPROVED: 2,
  COMMENT_LIKED: 1,
  COMMENT_INSPIRING: 10,
  COMMENT_UNFEATURED: -10,
  QUOTE_SHARE: 1,
} as const;

export type ImpactActionType =
  | "READ_COMPLETE"
  | "AI_DISCUSS"
  | "COMMENT_APPROVED"
  | "COMMENT_LIKED"
  | "COMMENT_INSPIRING"
  | "COMMENT_UNFEATURED"
  | "QUOTE_SHARE"
  | "CHANNEL_UNLOCKED"
  | "CALIBRATION"
  | "ADMIN_ADJUST";

export type AwardResult = {
  awarded: boolean;
  reason?: "DUPLICATE" | "DAILY_LIMIT" | "INVALID";
  impactScore: number;
  rank: string;
  rankUp: boolean;
  points: number;
};

/** بداية اليوم بتوقيت القاهرة (UTC+3 صيفًا ثابتًا عمليًا هنا) */
function startOfCairoDay(): Date {
  const now = new Date();
  const cairo = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  cairo.setUTCHours(0, 0, 0, 0);
  return new Date(cairo.getTime() - 3 * 60 * 60 * 1000);
}

/**
 * الاحتفال بعبور عتبة «أهل الكلمة» — يُنفَّذ مرة واحدة في عمر الحساب:
 * توثيق احتفالي في السجل + إشعار جرس + بث فوري لهاتف القارئ.
 * يُستدعى بعد نجاح المعاملة فقط، وتفرّده محمي بقيد CH:{userId} الفريد.
 */
async function celebrateEldersThreshold(userId: string): Promise<void> {
  try {
    await prisma.impactLog.create({
      data: {
        userId,
        actionType: "CHANNEL_UNLOCKED",
        points: 0,
        reason: "عبور عتبة «أهل الكلمة» — فُتحت قناة المقترحات الخاصة",
        dedupKey: `CH:${userId}`,
      },
    });
    await prisma.userNotification
      .create({
        data: {
          userId,
          title: "تهانينا! أنت الآن من «أهل الكلمة» ✦",
          body: "بلغ رصيد أثرك عتبة الـ350 نقطة، وفُتحت لك قناة المقترحات الخاصة في ملفك — كلمتك لها وزن الآن.",
          url: "/profile",
          kind: "TARGETED",
        },
      })
      .catch(() => {});
    const { pushUsers } = await import("@/lib/push");
    void pushUsers(
      {
        title: "تهانينا! أنت الآن من «أهل الكلمة» ✦",
        body: "+350 رصيد أثر — فُتحت لك قناة المقترحات الخاصة",
        url: "/profile",
        tag: "channel-unlocked",
      },
      { userIds: [userId] },
    );
  } catch {
    /* ازدواج الاحتفال مستحيل بقيد فريد، وأي خطأ هنا زينة لا تُعطل */
  }
}

/**
 * منح نقاط أثر لقارئ — المعاملة ذرّية: سجل + تحديث الرصيد والرتبة معًا.
 * dedupKey موجود → قيد UNIQUE يمنع أي ازدواج حتى تحت التزامن.
 * dailyCap موجود → عدد مرات مسموح في اليوم الواحد.
 */
export async function awardImpact(opts: {
  userId: string;
  actionType: ImpactActionType;
  points: number;
  articleId?: string | null;
  dedupKey?: string | null;
  reason?: string | null;
  dailyCap?: number;
}): Promise<AwardResult> {
  const before = await prisma.user.findUnique({
    where: { id: opts.userId },
    select: { impactScore: true, intellectualRank: true },
  });
  if (!before) {
    return { awarded: false, reason: "INVALID", impactScore: 0, rank: "قارئ متأمل", rankUp: false, points: 0 };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      /* السقف اليومي — يُفحص داخل المعاملة لمنع السباق */
      if (opts.dailyCap && opts.dailyCap > 0) {
        const todayCount = await tx.impactLog.count({
          where: {
            userId: opts.userId,
            actionType: opts.actionType,
            createdAt: { gte: startOfCairoDay() },
          },
        });
        if (todayCount >= opts.dailyCap) {
          return null;
        }
      }

      await tx.impactLog.create({
        data: {
          userId: opts.userId,
          actionType: opts.actionType,
          points: opts.points,
          articleId: opts.articleId ?? null,
          dedupKey: opts.dedupKey ?? null,
          reason: opts.reason ?? null,
        },
      });

      const newScore = Math.max(0, before.impactScore + opts.points);
      const newRank = rankForScore(newScore);

      await tx.user.update({
        where: { id: opts.userId },
        data: { impactScore: newScore, intellectualRank: newRank },
      });

      return {
        impactScore: newScore,
        rank: newRank,
        crossedThreshold:
          before.impactScore < ELDERS_THRESHOLD && newScore >= ELDERS_THRESHOLD,
      } as const;
    });

    if (result === null) {
      return {
        awarded: false,
        reason: "DAILY_LIMIT",
        impactScore: before.impactScore,
        rank: before.intellectualRank,
        rankUp: false,
        points: 0,
      };
    }

    /* الاحتفال بعد نجاح المعاملة — خارجها كي لا يُعطّل المنح الأصلية */
    if (result.crossedThreshold) void celebrateEldersThreshold(opts.userId);

    return {
      awarded: true,
      impactScore: result.impactScore,
      rank: result.rank,
      rankUp: result.rank !== before.intellectualRank,
      points: opts.points,
    };
  } catch (err) {
    /* ازدواج مفتاح UNIQUE → مُكافأ سابقًا، وليس عطلًا */
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("Unique constraint") || msg.includes("P2002")) {
      return {
        awarded: false,
        reason: "DUPLICATE",
        impactScore: before.impactScore,
        rank: before.intellectualRank,
        rankUp: false,
        points: 0,
      };
    }
    throw err;
  }
}

/* ============================================================
   منطق التمييز العكسي — setCommentFeatured
   تمييز/إلغاء تمييز تعليق في معاملة قاعدة بيانات واحدة ذرّية:
   العلم + السجل + الرصيد + إشعار الجرس. البوابة updateMany الشرطية
   (isInspiring:false→true أو العكس) ملغومة ضد السباق: طلبان متزامنان
   يُنجّح أحدهما فقط — لا ازدواج +10 ولا خصم مزدوج أبدًا.
   إعادة التمييز بعد إلغائه مسموحة ومتجاورة (+10 ثم -10 = صافي صفر).
   ============================================================ */

export type FeatureResult =
  | { ok: true; featured: boolean; points: number; impactScore: number; rank: string }
  | { ok: false; error: string; status: number };

export async function setCommentFeatured(opts: {
  commentId: string;
  featured: boolean;
  reason: string;
}): Promise<FeatureResult> {
  const comment = await prisma.comment.findUnique({
    where: { id: opts.commentId },
    select: {
      id: true,
      userId: true,
      isInspiring: true,
      user: { select: { id: true, banned: true } },
      article: { select: { id: true, slug: true, title: true } },
    },
  });
  if (!comment) return { ok: false, error: "التعليق غير موجود", status: 404 };
  if (opts.featured && (!comment.userId || comment.user?.banned)) {
    return { ok: false, error: "التمييز للتعليقات المسجلة بحساب نشط فقط", status: 400 };
  }

  const points = opts.featured
    ? IMPACT_POINTS.COMMENT_INSPIRING
    : IMPACT_POINTS.COMMENT_UNFEATURED;

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      /* البوابة الملغومة ضد التزامن: التحويل الشرطي للحالة فقط ينجح */
      const flipped = await tx.comment.updateMany({
        where: { id: comment.id, isInspiring: !opts.featured },
        data: { isInspiring: opts.featured },
      });
      if (flipped.count === 0) {
        return {
          conflict: true as const,
        };
      }

      const user = await tx.user.findUnique({
        where: { id: comment.userId! },
        select: { impactScore: true, intellectualRank: true },
      });
      const newScore = Math.max(0, (user?.impactScore ?? 0) + points);
      const newRank = rankForScore(newScore);

      await tx.impactLog.create({
        data: {
          userId: comment.userId!,
          actionType: opts.featured ? "COMMENT_INSPIRING" : "COMMENT_UNFEATURED",
          points,
          articleId: comment.article.id,
          reason: `سبب ${opts.featured ? "التمييز" : "إلغاء التمييز"} (إداري): ${opts.reason}`,
        },
      });

      await tx.user.update({
        where: { id: comment.userId! },
        data: { impactScore: newScore, intellectualRank: newRank },
      });

      await tx.userNotification.create({
        data: {
          userId: comment.userId!,
          title: opts.featured
            ? "تم تمييز تعليقك كتعليق ملهم ✦"
            : "أُلغي تمييز تعليقك",
          body: opts.featured
            ? `تم تمييز تعليقك بمقال «${comment.article.title}» وحصلت على +${IMPACT_POINTS.COMMENT_INSPIRING} نقاط أثر! السبب: ${opts.reason}`
            : `تم إلغاء تمييز تعليقك بمقال «${comment.article.title}» وخُصمت ${Math.abs(IMPACT_POINTS.COMMENT_UNFEATURED)} نقاط من رصيدك. السبب: ${opts.reason}`,
          url: `/article/${comment.article.slug}`,
          kind: "TARGETED",
        },
      });

      return { conflict: false as const, impactScore: newScore, rank: newRank };
    });

    if (outcome.conflict) {
      return {
        ok: false,
        error: opts.featured
          ? "التعليق مُعلَّم أصلًا"
          : "التعليق غير مُعلَّم أصلًا — لا خصم",
        status: 409,
      };
    }

    return {
      ok: true,
      featured: opts.featured,
      points,
      impactScore: outcome.impactScore,
      rank: outcome.rank,
    };
  } catch {
    return { ok: false, error: "تعذّرت المعاملة — أعد المحاولة", status: 500 };
  }
}

/**
 * حساب مدة القراءة المتأنية المطلوبة لمقال — تتناسب طرديًا مع عدد كلماته.
 * سرعة قارئ عربي متأنٍ ≈ 185 كلمة/دقيقة، بحد أدنى 20 ثانية وأقصى 4 دقائق.
 */
export function requiredReadSeconds(content: string): number {
  const words = content.replace(/\[\[[^\]]+\]\]/g, " ").split(/\s+/).filter(Boolean).length;
  return Math.round(Math.min(240, Math.max(20, words / 3.1)));
}
