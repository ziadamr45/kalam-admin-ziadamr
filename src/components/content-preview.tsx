"use client";

import { useMemo } from "react";
import { parseBlocks, toArabicDigits } from "@/lib/content-blocks";

/**
 * معاينة حية للتنسيق داخل المحرر — تحاكي عرض المنصة العامة بدقة:
 * الفقرات والعناوين والاقتباسات والقوائم + كتل الآيات والأحاديث المخصصة.
 */
export function ContentPreview({ raw }: { raw: string }) {
  const blocks = useMemo(() => parseBlocks(raw), [raw]);

  if (!raw.trim()) {
    return (
      <p className="py-6 text-center text-xs text-steel-400">
        اكتب محتوى أو أدرج آية/حديث لعرض المعاينة هنا..
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {blocks.map((block) => {
        if (block.kind === "h2") {
          return (
            <h3 key={block.id} className="text-lg font-bold text-steel-900">
              {block.text}
            </h3>
          );
        }
        if (block.kind === "quote") {
          return (
            <blockquote
              key={block.id}
              className="rounded-xl border-r-4 border-copper-600 bg-steel-50 px-4 py-3 text-sm leading-8 text-steel-700"
            >
              {block.text}
            </blockquote>
          );
        }
        if (block.kind === "list") {
          return (
            <ul key={block.id} className="list-disc space-y-1.5 pe-6 text-sm leading-8 text-steel-700">
              {block.items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          );
        }
        if (block.kind === "quran") {
          return (
            <figure key={block.id} className="quran-block" dir="rtl">
              <span aria-hidden className="quran-ornament">
                ۞
              </span>
              <blockquote className="quran-text">
                <span className="quran-bracket" aria-hidden>
                  ﴿
                </span>{" "}
                {block.text}{" "}
                <span className="quran-bracket" aria-hidden>
                  ﴾
                </span>
              </blockquote>
              <figcaption className="quran-ref">
                سورة {block.sura} <span className="quran-ref-dot">•</span> الآية{" "}
                {toArabicDigits(block.ayah.replace(/[^\d]/g, "") || block.ayah)}
              </figcaption>
            </figure>
          );
        }
        if (block.kind === "hadith") {
          return (
            <figure key={block.id} className="hadith-block" dir="rtl">
              <blockquote className="hadith-text">
                <span className="hadith-bracket" aria-hidden>
                  «
                </span>{" "}
                {block.text}{" "}
                <span className="hadith-bracket" aria-hidden>
                  »
                </span>
              </blockquote>
              <figcaption className="hadith-ref">{block.narrator}</figcaption>
            </figure>
          );
        }
        return (
          <p key={block.id} className="font-body text-[0.95rem] leading-9 text-steel-800">
            {block.text}
          </p>
        );
      })}
    </div>
  );
}
