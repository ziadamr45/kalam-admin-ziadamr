import { parseInline, type InlineSeg } from "@/lib/content-blocks";

/**
 * عرض التنسيق المضمن (**تغميق** *ميلان* ~~شطب~~ `مصطلح`)
 * بنسختين متطابقتين في التقطيع:
 * - InlineWords: كل كلمة داخل <span data-wi> ليلامس المحرك الصوتي
 *   الكاريوكي الكلمة المقروءة لحظيًا (نفس مُجزّئ blockPlainWords حرفيًا).
 * - InlinePlain: تنسيق جمالي فقط (الصفحات القانونية والمعاينات).
 */

function styled(t: InlineSeg["t"], word: string) {
  switch (t) {
    case "b":
      return <strong>{word}</strong>;
    case "i":
      return <em>{word}</em>;
    case "s":
      return <del>{word}</del>;
    case "c":
      return <code className="md-code">{word}</code>;
    default:
      return word;
  }
}

export function InlineWords({
  raw,
  start,
}: {
  raw: string;
  start: number;
}) {
  const segs = parseInline(raw);
  let wi = start;
  const out: React.ReactNode[] = [];

  segs.forEach((seg, si) => {
    const parts = seg.x.split(/(\s+)/);
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (!p) continue;
      if (!p.trim()) {
        out.push(p);
        continue;
      }
      const idx = wi++;
      out.push(
        <span key={`${si}.${idx}`} data-wi={idx} className="audio-word">
          {styled(seg.t, p)}
        </span>,
      );
    }
  });

  return <>{out}</>;
}

export function InlinePlain({ raw }: { raw: string }) {
  const segs = parseInline(raw);
  return (
    <>
      {segs.map((seg, si) => (
        <span key={si}>{styled(seg.t, seg.x)}</span>
      ))}
    </>
  );
}
