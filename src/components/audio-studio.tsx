"use client";

import { useCallback, useRef, useState } from "react";
import { Button, useToast } from "@/components/ui";

/*
 * استوديو الصوت الذكي — توليد القراءة الصوتية ومزامنة الكلمات بضغطة واحدة.
 * التوليد مقطّع: كل نداء يولّد مقطعًا واحدًا (حماية من مهل الدوال السحابية)
 * مع شريط تقدم حي، وإمكانية إكمال من المقطع الفاشل دون إعادة كل شيء.
 * يقبل أيضًا رفعًا يدويًا استثنائيًا (MP3/WAV ≤ 20MB) ويعرض حالة المزامنة.
 */

type WordTiming = { w: string; s: number; e: number };

type SegmentAcc = { audio: string; duration: number; words: WordTiming[] };

function fmtDur(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function AudioStudio({
  articleId,
  audioUrl,
  durationSec,
  audioVoice,
  audioGeneratedAt,
  audioWordsCount,
  onAudioChange,
  onDurationChange,
}: {
  articleId?: string;
  audioUrl: string;
  durationSec: number | null;
  audioVoice?: string | null;
  audioGeneratedAt?: string | null;
  audioWordsCount?: number;
  onAudioChange: (url: string) => void;
  onDurationChange: (sec: number | null) => void;
}) {
  const { toast } = useToast();
  const [phase, setPhase] = useState<"idle" | "working" | "error">("idle");
  const [progress, setProgress] = useState<{ i: number; total: number; preview: string } | null>(null);
  const [errorText, setErrorText] = useState("");
  const [lastResult, setLastResult] = useState<{ durationSec: number; wordsCount: number } | null>(null);
  const segmentsRef = useRef<SegmentAcc[]>([]);
  const abortRef = useRef(false);

  const generate = useCallback(
    async (fromIndex: number) => {
      if (!articleId) {
        toast("احفظ المقال أولًا (مسودة تكفي) ثم ولّد الصوت", "error");
        return;
      }
      setPhase("working");
      setErrorText("");
      abortRef.current = false;
      if (fromIndex === 0) segmentsRef.current = [];

      let total = fromIndex > 0 ? segmentsRef.current.length : 0;
      try {
        for (let i = fromIndex; ; i++) {
          if (abortRef.current) {
            setPhase("idle");
            return;
          }
          const res = await fetch(`/api/articles/${articleId}/audio/segment`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ index: i }),
          });
          const data = await res.json();
          if (!res.ok) {
            if (res.status === 400 && i > 0 && data.total) {
              /* تجاوزنا آخر مقطع — اكتمل التوليد */
              total = i;
              break;
            }
            throw new Error(data.error || "تعذر توليد المقطع");
          }
          total = Number(data.total ?? total);
          segmentsRef.current.push({
            audio: String(data.audio),
            duration: Number(data.duration ?? 0),
            words: (data.words ?? []) as WordTiming[],
          });
          setProgress({ i: i + 1, total, preview: String(data.previewText ?? "") });

          if (i + 1 >= total) break;
        }

        /* الختم: تجميع + رفع + حفظ المزامنة */
        setProgress((p) => (p ? { ...p, preview: "جارٍ الرفع والختم.." } : p));
        const fin = await fetch(`/api/articles/${articleId}/audio/finalize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ segments: segmentsRef.current }),
        });
        const finData = await fin.json();
        if (!fin.ok) throw new Error(finData.error || "تعذر ختم التوليد");

        onAudioChange(String(finData.audioUrl ?? ""));
        onDurationChange(Number(finData.durationSec ?? 0) || null);
        setLastResult({
          durationSec: Number(finData.durationSec ?? 0),
          wordsCount: Number(finData.wordsCount ?? 0),
        });
        setPhase("idle");
        setProgress(null);
        toast(
          `وُلّد الصوت وارتبط بالمقال — ${fmtDur(Number(finData.durationSec ?? 0))} و${Number(finData.wordsCount ?? 0)} كلمة مزامَنة`,
          "success",
        );
      } catch (err) {
        setPhase("error");
        setErrorText(err instanceof Error ? err.message : "خطأ غير متوقع");
      }
    },
    [articleId, onAudioChange, onDurationChange, toast],
  );

  const removeAudio = useCallback(async () => {
    if (!articleId) return;
    try {
      const res = await fetch(`/api/articles/${articleId}/audio`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast(d.error || "تعذر الإزالة", "error");
        return;
      }
      onAudioChange("");
      onDurationChange(null);
      setLastResult(null);
      toast("أُزيل الصوت ومزامنته من المقال", "success");
    } catch {
      toast("تعذر الاتصال بالخادم", "error");
    }
  }, [articleId, onAudioChange, onDurationChange, toast]);

  const manualUpload = useCallback(
    async (file: File) => {
      if (!articleId) {
        toast("احفظ المقال أولًا ثم ارفع الصوت", "error");
        return;
      }
      const form = new FormData();
      form.append("file", file);
      form.append("filename", file.name || "narration.mp3");
      try {
        const res = await fetch("/api/upload", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) {
          toast(data.error || "تعذر رفع الملف الصوتي", "error");
          return;
        }
        onAudioChange(String(data.url ?? ""));
        setLastResult(null);
        toast("رُفع الملف الصوتي وارتبط بالمقال — المزامنة اللحظية غير متاحة في الرفع اليدوي", "info");
      } catch {
        toast("تعذر الاتصال بالخادم", "error");
      }
    },
    [articleId, onAudioChange, toast],
  );

  const detectDuration = useCallback(
    (el: HTMLAudioElement | null) => {
      if (!el) return;
      const onMeta = () => {
        const d = el.duration;
        if (isFinite(d) && d > 0) onDurationChange(d);
      };
      el.addEventListener("loadedmetadata", onMeta, { once: true });
    },
    [onDurationChange],
  );

  const pct = progress && progress.total ? Math.round((progress.i / progress.total) * 100) : 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="block text-xs font-bold text-steel-700">
          القراءة الصوتية الذكية
          <span className="ms-2 font-normal text-steel-400">توليد آلي + تظليل الكلمة المقروءة لحظيًا</span>
        </label>
        {(audioGeneratedAt || lastResult) && (
          <span className="rounded-lg bg-success-400/10 px-2.5 py-1 text-[11px] font-bold text-success-600">
            {lastResult
              ? `جاهز — ${fmtDur(lastResult.durationSec)} · ${lastResult.wordsCount} كلمة مزامَنة`
              : `مولّد سابقًا${audioVoice ? ` بصوت ${audioVoice}` : ""}`}
          </span>
        )}
      </div>

      {audioUrl ? (
        <audio controls preload="metadata" src={audioUrl} ref={detectDuration} className="w-full" />
      ) : (
        <p className="rounded-xl bg-steel-50 p-3 text-[11px] leading-6 text-steel-400">
          لا صوت مرتبط بعد. التوليد الآلي يقرأ النسخة المشكولة لضمان النطق العربي السليم،
          ويستخرج طابعًا زمنيًا لكل كلمة، ويرفع الناتج إلى التخزين السحابي تلقائيًا.
        </p>
      )}

      {/* شريط التقدم */}
      {phase === "working" && progress && (
        <div className="rounded-xl border border-copper-500/30 bg-copper-500/5 p-3">
          <div className="mb-2 flex items-center justify-between text-[11px] font-bold text-copper-600">
            <span>
              توليد المقطع {progress.i} من {progress.total}..
            </span>
            <span>{pct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-steel-100">
            <div className="h-full rounded-full bg-copper-500 transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>
          {progress.preview && (
            <p className="mt-2 truncate text-[10px] text-steel-400" dir="rtl">
              {progress.preview}..
            </p>
          )}
          <button
            onClick={() => {
              abortRef.current = true;
            }}
            className="mt-2 text-[10px] font-bold text-steel-400 underline"
          >
            إيقاف التوليد
          </button>
        </div>
      )}

      {phase === "error" && (
        <div className="rounded-xl border border-danger-400/30 bg-danger-400/5 p-3">
          <p className="text-[11px] font-bold leading-6 text-danger-600">{errorText}</p>
          <button
            onClick={() => generate(segmentsRef.current.length)}
            className="mt-1.5 rounded-lg bg-danger-600 px-3 py-1.5 text-[10px] font-bold text-white"
          >
            إعادة المحاولة من المقطع {segmentsRef.current.length + 1}
          </button>
        </div>
      )}

      {/* الإجراءات */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => generate(phase === "error" ? segmentsRef.current.length : 0)}
          disabled={phase === "working"}
          className="transition-all"
        >
          {phase === "working"
            ? "جارٍ التوليد.."
            : segmentsRef.current.length > 0 && phase === "error"
              ? "إكمال التوليد من نقطة التوقف"
              : "توليد الصوت والمزامنة تلقائيًا بالذكاء الاصطناعي"}
        </Button>
        <label className="cursor-pointer rounded-xl border border-steel-200 px-4 py-2.5 text-xs font-bold text-steel-600 transition-colors hover:bg-steel-50">
          رفع ملف يدويًا (استثنائي)
          <input
            type="file"
            accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void manualUpload(f);
              e.currentTarget.value = "";
            }}
          />
        </label>
        {audioUrl && (
          <button
            onClick={removeAudio}
            disabled={phase === "working"}
            className="rounded-xl px-3 py-2.5 text-xs font-bold text-danger-600 transition-colors hover:bg-danger-400/10 disabled:opacity-40"
          >
            إزالة الصوت
          </button>
        )}
      </div>
    </div>
  );
}
