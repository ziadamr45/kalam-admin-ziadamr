"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { useSidebarOpen } from "@/components/dashboard-shell";
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
import { AudioStudio } from "@/components/audio-studio";
import {
  HADITH_TEMPLATE,
  NOTE_TEMPLATE,
  QURAN_TEMPLATE,
  QUESTION_TEMPLATE,
} from "@/lib/content-blocks";
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
  audioVoice?: string | null;
  audioGeneratedAt?: string | null;
  audioWordsCount?: number;
  authorIntent?: string | null;
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
  /* حالة الدرج الجانبي — الشريط السفلي يخفي نفسه حين تنزلق القائمة فوقه */
  const sidebarOpen = useSidebarOpen();

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

  /* التغذية الفكرية السرية — تُحقن في System Prompt لمساعد النقاش ولا تُعرض للجمهور إطلاقًا */
  const [authorIntent, setAuthorIntent] = useState(initial?.authorIntent ?? "");

  /* مولّد الغلاف الذكي */
  const [coverBusy, setCoverBusy] = useState<"generate" | "adopt" | null>(null);
  const [coverPreview, setCoverPreview] = useState<string>("");
  const [coverError, setCoverError] = useState<string>("");
  /* اعتُمد الغلاف المولّد تلقائيًا على الخادم (رُفع سحابيًا وارتبط بالمقال)؟ */
  const [coverAutoSaved, setCoverAutoSaved] = useState(false);

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
    authorIntent: authorIntent.trim() || null,
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

  /* ============ مولّد الغلاف الذكي — خطوتان على الخادم ثم سلسلة محركات رسم متدرجة ============ */
  const generateCover = async () => {
    if (!initial?.id) return;
    setCoverBusy("generate");
    setCoverError("");
    setCoverPreview("");
    setCoverAutoSaved(false);
    try {
      const res = await fetch(`/api/articles/${initial.id}/cover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCoverError(data.error || "تعذر توليد الغلاف — أعد المحاولة");
        return;
      }
      setCoverPreview(data.image || "");
      if (data.url) {
        /* الخادم رفع الصورة سحابيًا وحفظها في coverImage مباشرة */
        setCoverImage(data.url);
        setCoverAutoSaved(true);
        toast("وُلّد الغلاف ورُفع سحابيًا وارتبط بالمقال تلقائيًا", "success");
      } else {
        toast("صُنع الغلاف من مضمون المقال — اعتمده أو ولّد بديلًا", "success");
      }
    } catch {
      setCoverError("انقطع الاتصال أثناء التوليد — أعد المحاولة");
    } finally {
      setCoverBusy(null);
    }
  };

  const adoptCover = async () => {
    if (!initial?.id || !coverPreview) return;
    setCoverBusy("adopt");
    try {
      const res = await fetch(`/api/articles/${initial.id}/cover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "adopt", image: coverPreview }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error || "تعذر اعتماد الغلاف", "error");
        return;
      }
      setCoverImage(data.url);
      setCoverPreview("");
      toast("اعُتمد الغلاف ورُفع سحابيًا وارتبط بالمقال", "success");
    } catch {
      toast("انقطع الاتصال أثناء الاعتماد — أعد المحاولة", "error");
    } finally {
      setCoverBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-32">
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
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              insertBlock(NOTE_TEMPLATE("نص الملاحظة الجانبية هنا.."));
              toast("أُدرجت بطاقة ملاحظة جانبية :::", "success");
            }}
          >
            ◌ ملاحظة جانبية
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              insertBlock(QUESTION_TEMPLATE("اكتب تساؤلك التأملي هنا.."));
              toast("أُدرجت بطاقة تساؤل تأملي :::", "success");
            }}
          >
            ؟ تساؤل تأملي
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

      {/* التغذية الفكرية السرية — عقل مساعد النقاش (سرّي تمامًا، لا يظهر للجمهور إطلاقًا) */}
      <Card className="space-y-3 border-dashed border-copper-300 p-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-steel-800">
            التغذية الفكرية لمساعد النقاش
            <span className="mr-2 rounded-full bg-copper-100 px-2.5 py-0.5 text-[10px] font-bold text-copper-700">
              خاص بالذكاء الاصطناعي — لا يظهر للجمهور
            </span>
          </h3>
          <Badge tone="steel">سرّي 🔒</Badge>
        </div>
        <p className="text-[11px] leading-5 text-steel-400">
          اكتب هنا ما وراء السطور: الهدف الحقيقي من المقال، الرسالة غير المباشرة المراد إيصالها،
          الردود المسبقة على الانتقادات المحتملة، والمفاهيم التي يجب على المساعد التركيز عليها والدفاع عنها
          أثناء نقاش القرّاء. يُحقن هذا الحقل حصريًا في توجيهات مساعد النقاش — لن يراه القارئ في الواجهة الأمامية مطلقًا.
        </p>
        <textarea
          value={authorIntent}
          onChange={(e) => setAuthorIntent(e.target.value)}
          rows={5}
          className="field resize-y leading-8"
          placeholder={"مثال: هدف المقال الحقيقي دفع القارئ لمراجعة علاقته بالوقت لا الشكوى من ضيقها..\nالرسالة غير المباشرة: النقد اللاذع للمشغولية البلا معنى يجب أن يصل بتغليف لطيف لا جارح..\nإذا انتقد القارئ الأسلوب، فالرد المسبق: الأسلوب المتعمد مأخوذ من بيت المفكرين المصريين في الستينات.."}
        />
        <p className="text-[10px] text-steel-400">
          اتركه فارغًا ليعتمد المساعد على متن المقال وحده.
        </p>
      </Card>

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

        {/* مولّد الغلاف التجريدي الذكي — من مضمون المقال بأسلوب فلسفي هادئ */}
        <div className="rounded-2xl border border-steel-100 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-steel-700">مولّد الغلاف الذكي</p>
              <p className="mt-0.5 text-[11px] text-steel-400">
                يصيغ فنًا تجريديًا فلسفيًا هادئًا يعبّر عن فكرة المقال — بلا أي نصوص مكتوبة
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={generateCover}
              disabled={coverBusy !== null || !initial?.id}
              title={!initial?.id ? "احفظ المقال كمسودة أولًا ليتاح التوليد" : ""}
            >
              {coverBusy === "generate"
                ? "جارٍ التوليد.. (قد يستغرق حتى دقيقة)"
                : "توليد غلاف تجريدي ذكي من مضمون المقال"}
            </Button>
          </div>
          {!initial?.id && (
            <p className="mt-2 text-[11px] text-copper-700">
              احفظ المقال كمسودة أولًا (زر «حفظ كمسودة» أدناه) ثم عُد ليتاح التوليد.
            </p>
          )}
          {coverError && (
            <div
              className="mt-3 rounded-xl border p-3 text-xs font-semibold leading-6"
              style={{ borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c" }}
              role="alert"
            >
              <p className="mb-1 font-bold">لم يتم التوليد — السبب بدقة:</p>
              {coverError}
              {coverError.includes("فوترة") && (
                <p className="mt-2 rounded-lg bg-white/70 p-2 text-[11px] leading-5 text-steel-600">
                  الخطوات: ai.google.dev → اضغط مفتاحك → Billing → فعّل الفوترة المجانية
                  (تظل الحصة المجانية كما هي ولا يُخصم شيء إلا عند تجاوزها) —
                  بعدها سيعمل الزر هنا مباشرة بلا أي تعديل كود.
                </p>
              )}
            </div>
          )}
          {coverPreview && (
            <div className="mt-4 space-y-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={coverPreview}
                alt="معاينة الغلاف المولّد"
                className="max-h-72 w-full rounded-xl border border-steel-100 object-cover"
              />
              {coverAutoSaved && (
                <p
                  className="rounded-xl border p-3 text-xs font-bold leading-6"
                  style={{ borderColor: "#bbf7d0", background: "#f0fdf4", color: "#15803d" }}
                >
                  ✓ اعتُمد الغلاف تلقائيًا: رُفع سحابيًا وارتبط بحقل صورة الغلاف،
                  وسيظهر في المقال فور حفظك أو حتى دون حفظ (حُفظ على الخادم مباشرة).
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {!coverAutoSaved && (
                  <Button size="sm" onClick={adoptCover} disabled={coverBusy !== null}>
                    {coverBusy === "adopt" ? "جارٍ الاعتماد والرفع.." : "اعتماد الغلاف ورفعه وربطه بالمقال"}
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={generateCover} disabled={coverBusy !== null}>
                  توليد بديل
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setCoverPreview("");
                    setCoverAutoSaved(false);
                  }}
                  disabled={coverBusy !== null}
                >
                  تجاهل
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          {/* الرفع السحابي الذكي — بدل إدخال الروابط يدويًا */}
          <ImageUploader
            value={coverImage}
            onChange={setCoverImage}
            folder="articles"
            label="صورة الغلاف — رفع سحابي مباشر"
          />
          <div>
            <AudioStudio
              articleId={initial?.id}
              audioUrl={audioUrl}
              durationSec={audioDurationSec}
              audioVoice={initial?.audioVoice}
              audioGeneratedAt={initial?.audioGeneratedAt}
              audioWordsCount={initial?.audioWordsCount}
              onAudioChange={setAudioUrl}
              onDurationChange={setAudioDurationSec}
            />
          </div>
        </div>
      </Card>

      {/* شريط الإجراءات — شريط سفلي ثابت ملتصق بأسفل الشاشة
          (كان صندوقًا عائمًا يغطي حقول الإدخال والنسخة المشكولة)
          الطبقة z-30 تحت الدرج (z-[60]) والـ Backdrop (z-[55])،
          ويختفي تمامًا مع تعطيل تفاعله لحظة فتح القائمة الجانبية */}
      <div
        className={`fixed inset-x-0 bottom-0 z-30 border-t border-steel-100 bg-white/95 p-3 backdrop-blur transition-opacity duration-200 dark:border-zinc-800 dark:bg-zinc-900/95 lg:pr-64 ${
          sidebarOpen ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-2.5 sm:justify-start">
          {/* زر حفظ التغييرات — يحفظ التعديلات مع بقاء حالة المقال كما هي
              (منشور يبقى منشورًا، مؤرشف يبقى مؤرشفًا) دون أي تحويل أو مطالبة بقائمة الفحص */}
          {(status === "PUBLISHED" || status === "ARCHIVED") && (
            <Button
              onClick={() => save(status)}
              disabled={busy}
              title="يحفظ تعديلاتك ويُحدّث الموقع فورًا مع بقاء حالة المقال كما هي"
            >
              {busy ? "جارٍ الحفظ.." : "حفظ التغييرات"}
            </Button>
          )}
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
        </div>
      </div>

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
