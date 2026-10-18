"use client";

import { useMemo } from "react";
import { parseBlocks, toArabicDigits } from "@/lib/content-blocks";
import { InlinePlain } from "@/components/inline-text";

/**
 * معاينة حية للتنسيق داخل المحرر — تحاكي عرض المنصة العامة بدقة:
 * الفقرات والعناوين والاقتباسات والقوائم (مرتبة وغير مرتبة) والجداول
 * والفواصل الأفقية + كتل الآيات والأحاديث + الوسوم التوجيهية
 * :::quran :::hadith :::note :::question + التنسيق المضمن
 * **تغميق** *ميلان* ~~شطب~~ `مصطلح`
 */
export function ContentPreview({ raw }: { raw: string }) {
  const blocks = useMemo(() => parseBlocks(raw), [raw]);

  if (!raw.trim()) {
    return (
      <p className="py-6 text-center text-xs text-steel-400">
        اكتب محتوى أو أدرج آية/حديث/ملاحظة لعرض المعاينة هنا..
      </p>
    );
  }

  return (
    <div className="md-preview space-y-4">
      {blocks.map((block) => {
        if (block.kind === "h2") {
          return (
            <h3 key={block.id} className="text-lg font-bold text-steel-900">
              <InlinePlain raw={block.text} />
            </h3>
          );
        }
        if (block.kind === "h3") {
          return (
            <h4 key={block.id} className="flex items-center gap-2 text-base font-bold text-steel-900">
              <span aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-full bg-copper-600" />
              <InlinePlain raw={block.text} />
            </h4>
          );
        }
        if (block.kind === "quote") {
          return (
            <blockquote
              key={block.id}
              className="rounded-xl border-r-4 border-copper-600 bg-steel-50 px-4 py-3 text-sm leading-8 text-steel-700"
            >
              <InlinePlain raw={block.text} />
            </blockquote>
          );
        }
        if (block.kind === "hr") {
          return (
            <hr
              key={block.id}
              className="border-0 h-0.5 rounded-full mx-auto opacity-55"
              style={{
                width: "min(220px, 55%)",
                background: "linear-gradient(90deg, transparent, var(--accent), transparent)",
              }}
            />
          );
        }
        if (block.kind === "list" || block.kind === "olist") {
          const items = block.items.map((item, i) => (
            <li key={i}>
              <InlinePlain raw={item} />
            </li>
          ));
          return block.kind === "list" ? (
            <ul key={block.id} className="list-disc space-y-1.5 pe-6 text-sm leading-8 text-steel-700">
              {items}
            </ul>
          ) : (
            <ol
              key={block.id}
              start={block.start}
              className="space-y-1.5 pe-6 text-sm leading-8 text-steel-700 [list-style-type:arabic-indic]"
            >
              {items}
            </ol>
          );
        }
        if (block.kind === "table") {
          const alignCls = (i: number) =>
            block.aligns[i] === "center" ? "text-center" : block.aligns[i] === "end" ? "text-end" : "text-start";
          return (
            <div key={block.id} className="overflow-x-auto rounded-xl border border-steel-200 bg-white">
              <table className="w-full border-collapse text-sm leading-8">
                <thead>
                  <tr>
                    {block.head.map((cell, i) => (
                      <th
                        key={i}
                        className={`border-b-2 border-copper-600/35 bg-steel-50 px-3 py-2 font-bold text-copper-700 ${alignCls(i)}`}
                      >
                        <InlinePlain raw={cell} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, r) => (
                    <tr key={r} className={r % 2 === 1 ? "bg-steel-50/60" : ""}>
                      {row.map((cell, c) => (
                        <td key={c} className={`border-t border-steel-200 px-3 py-2 text-steel-800 ${alignCls(c)}`}>
                          <InlinePlain raw={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (block.kind === "note") {
          return (
            <aside key={block.id} className="flex items-start gap-3 rounded-xl border border-steel-200 bg-steel-50 px-4 py-3" style={{ borderInlineStartWidth: 3, borderInlineStartColor: "color-mix(in srgb, var(--accent) 55%, transparent)" }} dir="rtl">
              <svg aria-hidden className="mt-1.5 h-5 w-5 shrink-0" style={{ color: "var(--accent)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4" />
                <path d="M12 8h.01" />
              </svg>
              <div className="text-sm leading-8 text-steel-700">
                <span className="mb-0.5 block text-[0.7rem] font-bold tracking-wide text-copper-700">ملاحظة</span>
                <InlinePlain raw={block.text} />
              </div>
            </aside>
          );
        }
        if (block.kind === "question") {
          return (
            <figure
              key={block.id}
              className="rounded-xl border-2 border-dashed px-5 py-4 text-center"
              style={{ borderColor: "color-mix(in srgb, var(--accent) 38%, transparent)", background: "color-mix(in srgb, var(--accent) 5%, transparent)" }}
              dir="rtl"
            >
              <figcaption className="mb-1 text-[0.7rem] font-bold tracking-wide text-copper-700">تساؤل</figcaption>
              <div className="text-sm leading-8 text-steel-800">
                <InlinePlain raw={block.text} />
              </div>
            </figure>
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
              {(block.sura || block.ayah) && (
                <figcaption className="quran-ref">
                  {block.sura && <span>سورة {block.sura}</span>}
                  {block.sura && block.ayah && <span className="quran-ref-dot">•</span>}
                  {block.ayah && (
                    <span>الآية {toArabicDigits(block.ayah.replace(/[^\d]/g, "") || block.ayah)}</span>
                  )}
                </figcaption>
              )}
            </figure>
          );
        }
        if (block.kind === "hadith") {
          const showPrefix = block.via === "directive" && !/^\s*(قال\s*(رسول الله|نبي الله)|ﷺ)/.test(block.text);
          return (
            <figure key={block.id} className="hadith-block" dir="rtl">
              {showPrefix && (
                <span className="hadith-prefix">
                  قال رسول الله <span className="hadith-saw">ﷺ</span>:
                </span>
              )}
              <blockquote className="hadith-text">
                <span className="hadith-bracket" aria-hidden>
                  «
                </span>{" "}
                {block.text}{" "}
                <span className="hadith-bracket" aria-hidden>
                  »
                </span>
              </blockquote>
              {block.narrator?.trim() && <figcaption className="hadith-ref">{block.narrator}</figcaption>}
            </figure>
          );
        }
        return (
          <p key={block.id} className="font-body text-[0.95rem] leading-9 text-steel-800">
            <InlinePlain raw={block.text} />
          </p>
        );
      })}
    </div>
  );
}
