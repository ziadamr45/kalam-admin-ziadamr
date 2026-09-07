"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { Badge, Button, Card, Modal, previewReadingTime, previewWordCount, useToast } from "@/components/ui";

type ArticleStatus = "DRAFT" | "SCHEDULED" | "PUBLISHED" | "ARCHIVED";

type EditorArticle = {
  id?: string;
  title: string;
  slug: string;
  summary: string;
  content: string;
  contentWithTashkeel: string;
  sectionId: string | null;
  coverImage: string | null;
  audioUrl: string | null;
  audioDurationSec: number | null;
  audioCues: { t: number; id: string }[] | null;
  status: ArticleStatus;
  scheduledAt: string | null;
  checklistData: { items: { text: string; checked: boolean }[] } | null;
};

export function ArticleEditor({
  mode,
  initial,
  sections,
  checklist,
  requireChecklist,
}: {
  mode: "new" | "edit";
  initial?: EditorArticle;
  sections: { id: string; name: string }[];
  checklist: { id: string; text: string }[];
  requireChecklist: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(mode === "edit");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [tashkeel, setTashkeel] = useState(initial?.contentWithTashkeel ?? "");
  const [sectionId, setSectionId] = useState(initial?.sectionId ?? null);
  const [coverImage, setCoverImage] = useState(initial?.coverImage ?? "");
  const [audioUrl, setAudioUrl] = useState(initial?.audioUrl ?? "");
  const [audioDurationSec, setAudioDurationSec] = useState<number | null>(initial?.audioDurationSec ?? null);
  const [scheduledAt, setScheduledAt] = useState(
    initial?.scheduledAt ? initial.scheduledAt.slice(0, 16) : "",
  );
  const [status, setStatus] = useState<ArticleStatus>(initial?.status ?? "DRAFT");
  const [syncTashkeel, setSyncTashkeel] = useState(mode === "new");

  const [busy, setBusy] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [checks, setChecks] = useState<boolean[]>(() => {
    const saved = initial?.checklistData?.items;
    if (saved) return checklist.map((c) => saved.find((s) => s.text === c.text)?.checked ?? false);
    return checklist.map(() => false);
  });
  const audioRef = useRef<HTMLAudioElement | null>(null);

  /* توليد slug تلقائي من العنوان ما لم يحرره المالك يدويًا */
  const onTitleChange = (value: string) => {
    setTitle(value);
    if (!slugEdited) {
      setSlug(
        value
          .trim()
          .toLowerCase()
          .replace(/[^\u0621-\u064Aa-z0-9\s-]/g, "")
          .replace(/[\s_]+/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 80),
      );
    }
  };

  /* المعاينة الحية */
  const wordCount = useMemo(() => previewWordCount(content), [content]);
  const tashkeelWordCount = useMemo(() => previewWordCount(tashkeel), [tashkeel]);
  const readingTime = useMemo(
    () => previewReadingTime(tashkeelWordCount > wordCount ? tashkeel : content),
    [content, tashkeel, wordCount, tashkeelWordCount],
  );

  /* مزامنة اختيارية: التشكيل يتبع النص القياسي عند الكتابة */
  const onContentChange = (value: string) => {
    setContent(value);
    if (syncTashkeel && tashkeel.trim() === "") setTashkeel(value);
  };

  const buildPayload = () => ({
    title: title.trim(),
    slug: slug.trim(),
    summary,
    content,
    contentWithTashkeel: tashkeel.trim() || content,
    sectionId,
    coverImage: coverImage.trim() || null,
    audioUrl: audioUrl.trim() || null,
    audioDurationSec,
    status,
  });

  /* حفظ (مسودة أو أي حالة) */
  const save = async (targetStatus: ArticleStatus, withChecklist = false) => {
    if (!title.trim() || !content.trim() || !summary.trim()) {
      toast("العنوان والملخص والمحتوى القياسي إلزامية", "error");
      return;
    }
    if (targetStatus === "SCHEDULED" && !scheduledAt) {
      toast("حدد موعد النشر أولًا", "error");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        ...buildPayload(),
        status: targetStatus,
        scheduledAt: targetStatus === "SCHEDULED" ? new Date(scheduledAt).toISOString() : null,
        checklistData: withChecklist ? { items: checklist.map((c, i) => ({ text: c.text, checked: checks[i] })) } : undefined,
      };

      const res = await fetch(mode === "new" ? "/api/articles" : `/api/articles/${initial?.id}`, {
        method: mode === "new" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "تعذر الحفظ", "error");
        return;
      }

      if (targetStatus === "PUBLISHED") {
        toast("نُشر المقال وأُعيد توليد صفحات المنصة فورًا");
      } else if (targetStatus === "SCHEDULED") {
        toast("تمت الجدولة — سينشر تلقائيًا في موعده");
      } else {
        toast("حُفظت المسودة بنجاح");
      }

      setChecklistOpen(false);
      router.push("/articles");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const tryPublish = () => {
    if (requireChecklist && !checks.every(Boolean)) {
      setChecklistOpen(true);
      return;
    }
    save("PUBLISHED", true);
  };

  /* قراءة مدة الصوت تلقائيًا عند إدخال الرابط */
  const onAudioUrlBlur = () => {
    if (!audioUrl.trim()) return;
    const audio = audioRef.current;
    if (audio) {
      audio.src = audioUrl;
      audio.load();
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-steel-900">
            {mode === "new" ? "مقال جديد" : "تحرير المقال"}
          </h1>
          <p className="mt-1 text-sm text-steel-500">
            المعاينة الحية: <strong className="text-copper-700">{readingTime}</strong> — {wordCount} كلمة قياسية
            {tashkeelWordCount > 0 ? ` / ${tashkeelWordCount} مشكولة` : ""}
          </p>
        </div>
        <Badge tone={status === "PUBLISHED" ? "success" : status === "SCHEDULED" ? "warn" : "neutral"}>
          {status === "PUBLISHED" ? "منشور" : status === "SCHEDULED" ? "مجدول" : status === "ARCHIVED" ? "مؤرشف" : "مسودة"}
        </Badge>
      </div>

      {/* البيانات الأساسية */}
      <Card className="space-y-4 p-6">
        <div>
          <label className="mb-1.5 block text-xs font-bold text-steel-700">عنوان المقال *</label>
          <input value={title} onChange={(e) => onTitleChange(e.target.value)} className="field text-lg font-bold" placeholder="عنوان يوقف التمرير ويستحق النقر.." />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-steel-700">الرابط (slug)</label>
            <input value={slug} onChange={(e) => { setSlug(e.target.value); setSlugEdited(true); }} className="field" dir="ltr" placeholder="article-slug" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold text-steel-700">القسم</label>
            <select value={sectionId ?? ""} onChange={(e) => setSectionId(e.target.value || null)} className="field">
              <option value="">— بلا قسم —</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-bold text-steel-700">
            المختصر المفيد * <span className="font-normal text-steel-400">(نقاط مفصولة بأسطر — يظهر للقارئ كخلاصة فائقة التركيز)</span>
          </label>
          <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} className="field resize-none leading-8" placeholder={"الفكرة الجوهرية في سطر\nنقطة عملية قابلة للتطبيق\nالخلاصة التي يستحق القارئ أن يخرج بها"} />
        </div>
      </Card>

      {/* المحرر الثنائي المتزامن */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold text-steel-800">النسخة القياسية *</h3>
            <Badge tone="steel">سلسة للقراءة السريعة</Badge>
          </div>
          <p className="mb-3 text-[11px] leading-5 text-steel-400">
            نص عادي. الفقرات بسطر فارغ، «## » عنوان فرعي، «&gt; » اقتباس، «- » قائمة.
          </p>
          <textarea
            value={content}
            onChange={(e) => onContentChange(e.target.value)}
            rows={14}
            className="field resize-y font-body leading-9"
            placeholder="اكتب الفكرة بسلام.. بلا تشكيل، بلا ثقل."
          />
        </Card>

        <Card className="p-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold text-steel-800">النسخة المشكولة بالكامل</h3>
            <Badge tone="copper">مرجع لغوي رصين</Badge>
          </div>
          <p className="mb-3 text-[11px] leading-5 text-steel-400">
            الكامل الحركات الإعرابية والتشكيلية — للدارسين والمعلمين.
          </p>
          <textarea
            value={tashkeel}
            onChange={(e) => setTashkeel(e.target.value)}
            rows={14}
            className="field tashkeel-editor resize-y font-body"
            placeholder="وَالْكَلَامُ الْمُشَكَّلُ هُنَا بِكَامِلِ حَرَكَاتِهِ.."
          />
          <label className="mt-2 flex items-center gap-2 text-[11px] text-steel-500">
            <input type="checkbox" checked={syncTashkeel} onChange={(e) => setSyncTashkeel(e.target.checked)} className="accent-copper-600" />
            مزامنة تلقائية من النسخة القياسية (حتى تبدأ الكتابة المشكولة)
          </label>
        </Card>
      </div>

      {/* الوسائط */}
      <Card className="space-y-4 p-6">
        <h3 className="text-sm font-bold text-steel-800">الوسائط والملحقات</h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-steel-700">صورة الغلاف (رابط)</label>
            <input value={coverImage} onChange={(e) => setCoverImage(e.target.value)} className="field" dir="ltr" placeholder="https://.." />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold text-steel-700">
              الملف الصوتي للقراءة <span className="font-normal text-steel-400">(رابط مباشر mp3 أو رفعه عبر Vercel Blob)</span>
            </label>
            <input value={audioUrl} onChange={(e) => setAudioUrl(e.target.value)} onBlur={onAudioUrlBlur} className="field" dir="ltr" placeholder="https://..audio.mp3" />
            {audioDurationSec && (
              <p className="mt-1 text-[11px] text-success-600">المدة المكتشفة: {Math.round(audioDurationSec)} ثانية</p>
            )}
            <audio
              ref={audioRef}
              className="hidden"
              onLoadedMetadata={(e) => {
                const d = e.currentTarget.duration;
                if (isFinite(d) && d > 0) setAudioDurationSec(d);
              }}
            />
          </div>
        </div>
      </Card>

      {/* شريط الإجراءات */}
      <Card className="sticky bottom-4 flex flex-wrap items-center gap-3 p-4">
        <Button variant="outline" onClick={() => save("DRAFT")} disabled={busy}>
          حفظ كمسودة
        </Button>
        <Button variant="outline" onClick={() => save("SCHEDULED")} disabled={busy}>
          جدولة النشر
        </Button>
        {status !== "PUBLISHED" ? (
          <Button onClick={tryPublish} disabled={busy}>
            نشر الآن {requireChecklist ? "(بعد قائمة الفحص)" : ""}
          </Button>
        ) : (
          <Button variant="danger" onClick={() => save("ARCHIVED")} disabled={busy}>
            أرشفة المقال
          </Button>
        )}
        {status !== "PUBLISHED" && (
          <div className="flex items-center gap-2">
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="field max-w-[220px] text-xs"
            />
            <Button size="sm" variant="ghost" onClick={() => save("SCHEDULED")} disabled={busy || !scheduledAt}>
              اعتماد الموعد
            </Button>
          </div>
        )}
      </Card>

      {/* مودال قائمة الفحص الأخلاقي */}
      <Modal open={checklistOpen} onClose={() => setChecklistOpen(false)} title="قائمة الفحص الأخلاقي قبل النشر">
        <p className="mb-4 text-xs leading-6 text-steel-500">
          معايير «له لازمة» الصارمة — اجتزها كلها لنشر مقال يليق بالقارئ.
        </p>
        <ul className="space-y-3">
          {checklist.map((item, i) => (
            <li key={item.id}>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-steel-100 p-3 transition-colors hover:bg-steel-50">
                <input
                  type="checkbox"
                  checked={checks[i] ?? false}
                  onChange={(e) => {
                    const next = [...checks];
                    next[i] = e.target.checked;
                    setChecks(next);
                  }}
                  className="mt-1 accent-copper-600"
                />
                <span className="text-sm leading-7 text-steel-700">{item.text}</span>
              </label>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex gap-3">
          <Button
            onClick={() => save("PUBLISHED", true)}
            disabled={busy || !checks.every(Boolean)}
          >
            {busy ? "جارٍ النشر.." : "اجتزت كل المعايير — انشر الآن"}
          </Button>
          <Button variant="ghost" onClick={() => setChecklistOpen(false)}>
            سأكمل لاحقًا
          </Button>
        </div>
      </Modal>
    </div>
  );
}
