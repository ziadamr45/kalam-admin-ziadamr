/**
 * محرك رصيد الأثر — نسخة لوحة التحكم.
 * تُستخدم لمنح/خصم النقاط يدويًا (بسبب ورقم سجل موثق) ولمنح
 * «تعليق فكري ملهم» تلقائيًا، بنفس قواعد منع التكرار والرتب
 * المعتمدة في المنصة العامة.
 */

import { prisma } from "@/lib/prisma";
import { rankForScore } from "@/lib/ranks";

export const IMPACT_POINTS = {
  READ_COMPLETE: 10,
  AI_DISCUSS: 5,
  COMMENT_APPROVED: 15,
  COMMENT_INSPIRING: 30,
  QUOTE_SHARE: 3,
} as const;

export type AwardResult = {
  awarded: boolean;
  reason?: "DUPLICATE" | "INVALID";
  impactScore: number;
  rank: string;
  rankUp: boolean;
  points: number;
};

/** منح نقاط أثر (بمفتاح تكرار اختياري) — ذرّية مع تحديث الرتبة */
export async function awardImpact(opts: {
  userId: string;
  actionType: string;
  points: number;
  articleId?: string | null;
  dedupKey?: string | null;
  reason?: string | null;
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
      return { impactScore: newScore, rank: newRank };
    });

    return {
      awarded: true,
      impactScore: result.impactScore,
      rank: result.rank,
      rankUp: result.rank !== before.intellectualRank,
      points: opts.points,
    };
  } catch (err) {
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
