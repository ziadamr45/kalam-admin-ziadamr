/**
 * منظومة الرتب والألقاب الفكرية — نسخة لوحة التحكم (خادم حصريًا).
 * تطابق نسخة المنصة العامة حرفيًا في المنطق والألوان.
 */

export type RankMeta = {
  key: string;
  min: number;
  color: string;
  soft: string;
  hint: string;
};

export const RANKS: RankMeta[] = [
  { key: "قارئ متأمل", min: 0, color: "#7C7468", soft: "rgba(124,116,104,0.12)", hint: "تقرأ بتأنٍّ وتستوعب قبل أن تتكلم" },
  { key: "محاور واعد", min: 50, color: "#3C7A4E", soft: "rgba(60,122,78,0.12)", hint: "كلامك في الحوار بدأ يصنع أثره" },
  { key: "عقل رصين", min: 150, color: "#A16A1F", soft: "rgba(161,106,31,0.13)", hint: "موازنك في النقاش أصبح امتيازًا" },
  { key: "أهل الكلمة", min: 350, color: "#8A5A14", soft: "rgba(138,90,20,0.16)", hint: "أعلى رتبة فكرية — كلمتها لها وزن خاص" },
];

export function rankForScore(score: number): string {
  let rank = RANKS[0].key;
  for (const r of RANKS) if (score >= r.min) rank = r.key;
  return rank;
}

export function rankMeta(rank: string | null | undefined): RankMeta {
  return RANKS.find((r) => r.key === rank) ?? RANKS[0];
}
