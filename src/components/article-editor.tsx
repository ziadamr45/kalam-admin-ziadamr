"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Modal,
  previewReadingTime,
  previewWordCount,
  useToast,
} from "@/components/ui";
import { ContentPreview } from "@/components/content-preview";
import { ImageUploader } from "@/components/image-uploader";
import { HADITH_TEMPLATE, QURAN_TEMPLATE } from "@/lib/content-blocks";
import { fixNunation, countNunationIssues } from "@/lib/nunation";

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
  tashkeelEnabled?: boolean;
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
  /* سيطرة الأدمن على التشكيل لكل مقال على حدة (إضافة للإعداد العام) */
  const [tashkeelEnabled, setTashkeelEnabled] = useState<boolean>(initial?.tashkeelEnabled ?? true);

  /* أدوات إدراج الآيات والأحاديث + المعاينة الحية */
  const contentRef = useRef<HTMLTextAreaElement | null>(null);
  const tashkeelRef = useRef<HTMLTextAreaElement | null>(null);
  const [insertTarget, setInsertTarget] = useState<"content" | "tashkeel">("content");
  const [quranPanel, setQuranPanel] = useState(false);
  const [quranSura, setQuranSura] = useState("");
  const [quranAyah, setQuranAyah] = useState("");
  const [quranText, setQuranText] = useState("");
  const [hadithPanel, setHadithPanel] = useState(false);
  const [hadithNarrator, setHadithNarrator] = useState("");
  const [hadithText, setHadithText] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);

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

  /* إدراج كتلة آية/حديث في موضع المؤشر داخل الحقل النشط */
  const insertBlock = (markup: string) => {
    const isTashkeel = insertTarget === "tashkeel";
    const ref = isTashkeel ? tashkeelRef : contentRef;
    const setter = isTashkeel ? setTashkeel : setContent;
    const value = isTashkeel ? tashkeel : content;
    const el = ref.current;

    if (!el) {
      setter(value ? `${value}\n\n${markup}` : markup);
      return;
    }

    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? start;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const padBefore = before
      ? before.endsWith("\n\n")
        ? ""
        : before.endsWith("\n")
          ? "\n"
          : "\n\n"
      : "";
    const padAfter = after.startsWith("\n") ? "\n" : "\n\n";
    const inserted = padBefore + markup + padAfter;
    setter(before + inserted + after);

    requestAnimationFrame(() => {
      el.focus();
      const pos = (before + padBefore + markup).length;
      el.setSelectionRange(pos, pos);
    });
  };

  const insertQuran = () => {
    if (!quranSura.trim() || !quranText.trim()) return;
    insertBlock(QURAN_TEMPLATE(quranSura.trim(), quranAyah.trim() || "—", quranText.trim()));
    setQuranPanel(false);
    setQuranSura("");
    setQuranAyah("");
    setQuranText("");
    toast("أُدرجت الآية بتنسيق الرسم العثماني المخصص", "success");
  };

  const insertHadith = () => {
    if (!hadithText.trim()) return;
    insertBlock(
      HADITH_TEMPLATE(hadithNarrator.trim() || "حديث شريف", hadithText.trim()),
    );
    setHadithPanel(false);
    setHadithNarrator("");
    setHadithText("");
    toast("أُدرج الحديث بتنسيق النسخ الكلاسيكي المخصص", "success");
  };

  const buildPayload = () => ({
    /* قاعدة ضبط التنوين الصارمة — تصحيح إلزامي تلقائي عند كل حفظ:
       التنوين فوق الحرف السابق لألف التنوين، لا فوق الألف نفسها */
    title: fixNunation(title.trim()),
    slug: slug.trim(),
    summary: fixNunation(summary),
    content: fixNunation(content),
    contentWithTashkeel: fixNunation(tashkeel.trim() || content),
    sectionId,
    coverImage: coverImage.trim() || null,
    audioUrl: audioUrl.trim() || null,
    audioDurationSec,
    tashkeelEnabled,
    status,
  });

  /* زر التصحيح اليدوي — يعمل على النصين فورًا مع تقرير واضح */
  const fixNunationNow = () => {
    const n = countNunationIssues(content) + countNunationIssues(tashkeel) + countNunationIssues(title) + countNunationIssues(summary);
    setContent((c) => fixNunation(c));
    setTashkeel((t) => fixNunation(t));
    setTitle((t) => fixNunation(t));
    setSummary((s) => fixNunation(s));
    toast(n > 0 ? `صُحّح ${n} موضعًا من مواضع التنوين — اللغة الآن رصينة` : "النص سليم — لا مواضع تنوين خاطئة", n > 0 ? "success" : "info");
  };

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

        {/* سيطرة التشكيل لهذا المقال تحديدًا — فوق الإعداد العام */}
        <div className="flex items-center justify-between rounded-xl border border-steel-100 px-4 py-3">
          <div>
            <p className="text-xs font-bold text-steel-700">التشكيل لهذا المقال</p>
            <p className="mt-0.5 text-[11px] text-steel-400">
              يختفي زر التشكيل من صفحة المقال عند الإيقاف — إضافة للإعداد العام في إعدادات الموقع
            </p>
          </div>
          <select
            value={tashkeelEnabled ? "on" : "off"}
            onChange={(e) => setTashkeelEnabled(e.target.value === "on")}
            className="field max-w-40"
          >
            <option value="on">متاح للقرّاء</option>
            <option value="off">معطّل لهذا المقال</option>
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-bold text-steel-700">
            المختصر المفيد * <span className="font-normal text-steel-400">(نقاط مفصولة بأسطر — يظهر للقارئ كخلاصة فائقة التركيز)</span>
          </label>
          <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} className="field resize-none leading-8" placeholder={"الفكرة الجوهرية في سطر\nنقطة عملية قابلة للتطبيق\nالخلاصة التي يستحق القارئ أن يخرج بها"} />
        </div>
      </Card>

      {/* أدوات التنسيق القرآني والنبوي + ضبط التنوين */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-steel-600">أدوات التنسيق واللغة:</span>
          <Button
            size="sm"
            variant={quranPanel ? "primary" : "outline"}
            onClick={() => {
              setQuranPanel((v) => !v);
              setHadithPanel(false);
            }}
          >
            ﴿ إدراج آية قرآنية
          </Button>
          <Button
            size="sm"
            variant={hadithPanel ? "primary" : "outline"}
            onClick={() => {
              setHadithPanel((v) => !v);
              setQuranPanel(false);
            }}
          >
            « إدراج حديث نبوي
          </Button>
          {/* قاعدة ضبط التنوين الصارمة */}
          <Button size="sm" variant="outline" onClick={fixNunationNow} title="التنوين فوق الحرف السابق لألف التنوين — لا فوق الألف">
            َّ تصحيح التنوين تلقائيًا
          </Button>
          <span className="ms-auto text-[11px] text-steel-400">
            الإدراج في: {insertTarget === "tashkeel" ? "النسخة المشكولة" : "النسخة القياسية"}
          </span>
        </div>

        {quranPanel && (
          <div className="insert-panel mt-3 space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <input
                className="field"
                placeholder="اسم السورة — مثال: الكهف"
                value={quranSura}
                onChange={(e) => setQuranSura(e.target.value)}
              />
              <input
                className="field"
                placeholder="رقم الآية — مثال: 10"
                value={quranAyah}
                onChange={(e) => setQuranAyah(e.target.value)}
              />
              <div className="flex items-center text-[11px] leading-5 text-steel-400">
                ستُعرض داخل أقواس قرآنية ﴿ ﴾ بخط الرسم العثماني
                مع توثيق السورة والآية
              </div>
            </div>
            <textarea
              className="field resize-y font-body leading-9"
              rows={3}
              placeholder="نص الآية الكريمة بالرسم العثماني مع التشكيل.."
              value={quranText}
              onChange={(e) => setQuranText(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!quranSura.trim() || !quranText.trim()}
                onClick={insertQuran}
              >
                إدراج الآية
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setQuranPanel(false)}>
                إلغاء
              </Button>
            </div>
          </div>
        )}

        {hadithPanel && (
          <div className="insert-panel mt-3 space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <input
                className="field sm:col-span-2"
                placeholder="الراوي والتخريج — مثال: رواه البخاري"
                value={hadithNarrator}
                onChange={(e) => setHadithNarrator(e.target.value)}
              />
              <div className="flex items-center text-[11px] leading-5 text-steel-400">
                ستُعرض داخل أقواس اقتباس راقية بخط النسخ
                الكلاسيكي الرصين
              </div>
            </div>
            <textarea
              className="field resize-y font-body leading-9"
              rows={3}
              placeholder="نص الحديث الشريف.."
              value={hadithText}
              onChange={(e) => setHadithText(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!hadithText.trim()}
                onClick={insertHadith}
              >
                إدراج الحديث
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setHadithPanel(false)}>
                إلغاء
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* المحرر الثنائي المتزامن */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold text-steel-800">النسخة القياسية *</h3>
            <Badge tone="steel">سلسة للقراءة السريعة</Badge>
          </div>
          <p className="mb-3 text-[11px] leading-5 text-steel-400">
            نص عادي. الفقرات بسطر فارغ، «## » عنوان فرعي، «&gt; » اقتباس، «- » قائمة، والآيات والأحاديث من أزرار التنسيق أعلاه.
          </p>
          <textarea
            ref={contentRef}
            value={content}
            onChange={(e) => onContentChange(e.target.value)}
            onFocus={() => setInsertTarget("content")}
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
            ref={tashkeelRef}
            value={tashkeel}
            onChange={(e) => setTashkeel(e.target.value)}
            onFocus={() => setInsertTarget("tashkeel")}
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

      {/* المعاينة الحية للتنسيق النهائي */}
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-steel-800">
            معاينة التنسيق النهائي <span className="font-normal text-steel-400">(كما سيظهر للقرّاء)</span>
          </h3>
          <Button size="sm" variant="ghost" onClick={() => setPreviewOpen((v) => !v)}>
            {previewOpen ? "إخفاء المعاينة" : "إظهار المعاينة"}
          </Button>
        </div>
        {previewOpen && (
          <div className="mt-4 rounded-2xl border border-steel-100 p-5">
            <ContentPreview raw={content} />
          </div>
        )}
      </Card>

      {/* الوسائط */}
      <Card className="space-y-5 p-6">
        <h3 className="text-sm font-bold text-steel-800">الوسائط والملحقات</h3>

        <div className="grid gap-5 lg:grid-cols-2">
          {/* الرفع السحابي الذكي — بدل إدخال الروابط يدويًا */}
          <ImageUploader
            value={coverImage}
            onChange={setCoverImage}
            folder="articles"
            label="صورة الغلاف — رفع سحابي مباشر"
          />
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
