"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, useToast } from "@/components/ui";

type StatusPayload = {
  audioStatus?: "NONE" | "PROCESSING" | "READY" | "FAILED";
  audioUrl?: string | null;
  durationSec?: number | null;
  done?: number;
  total?: number;
  error?: string | null;
  wordsCount?: number;
  stale?: boolean;
};

type AudioStatus = "NONE" | "PROCESSING" | "READY" | "FAILED";

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
  const [status, setStatus] = useState<AudioStatus>(audioUrl ? "READY" : "NONE");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [note, setNote] = useState("");
  const [errorText, setErrorText] = useState("");
  const [stale, setStale] = useState(false);
  const [starting, setStarting] = useState(false);
  const [lastResult, setLastResult] = useState<{ durationSec: number; wordsCount: number } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /* عند إزالة الصوت محليًا قبل الحفظ لا يعيد الاستعلام الأول فرض القديم */
  const locallyRemovedRef = useRef(false);

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const applyStatus = useCallback(
    (d: StatusPayload) => {
      const s = d.audioStatus ?? "NONE";
      if (s === "PROCESSING") {
        locallyRemovedRef.current = false;
        setStatus("PROCESSING");
        setProgress({ done: Number(d.done ?? 0), total: Number(d.total ?? 0) });
        setNote(typeof d.error === "string" ? d.error : "");
        setStale(Boolean(d.stale));
        return;
      }
      stopPoll();
      setStale(false);
      setNote("");
      if (s === "READY") {
        if (locallyRemovedRef.current) return;
        setStatus("READY");
        setProgress(null);
        setErrorText("");
        if (d.audioUrl) onAudioChange(d.audioUrl);
        onDurationChange(Number(d.durationSec ?? 0) || null);
        setLastResult({
          durationSec: Number(d.durationSec ?? 0),
          wordsCount: Number(d.wordsCount ?? 0),
        });
      } else if (s === "FAILED") {
        setStatus("FAILED");
        const done = Number(d.done ?? 0);
        const total = Number(d.total ?? 0);
        setProgress(total > 0 ? { done, total } : null);
        setErrorText(d.error || "فشل التوليد الصوتي — أعد المحاولة");
      } else {
        setStatus("NONE");
        setProgress(null);
        setErrorText("");
      }
    },
    [onAudioChange, onDurationChange, stopPoll],
  );

  const fetchStatus = useCallback(async () => {
    if (!articleId) return;
    try {
      const res = await fetch(`/api/articles/${articleId}/audio`, { cache: "no-store" });
      if (!res.ok) return;
      const d = (await res.json()) as StatusPayload;
      applyStatus(d);
    } catch {}
  }, [articleId, applyStatus]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (status !== "PROCESSING" || !articleId) {
      stopPoll();
      return;
    }
    pollRef.current = setInterval(() => {
      void fetchStatus();
    }, 5000);
    return stopPoll;
  }, [status, articleId, fetchStatus, stopPoll]);

  const start = useCallback(
    async (resume = false) => {
      if (!articleId) {
        toast("احفظ المقال أولًا (مسودة تكفي) ثم ولّد الصوت", "error");
        return;
      }
      locallyRemovedRef.current = false;
      setStarting(true);
      setErrorText("");
      try {
        const res = await fetch(`/api/articles/${articleId}/audio`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resume }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        if (!res.ok) {
          toast(data.error || "تعذر بدء التوليد الصوتي", "error");
          setStarting(false);
          return;
        }
        setStatus("PROCESSING");
        setProgress({ done: 0, total: 0 });
        setNote("");
        setStale(false);
        toast(String(data.message || "بدأت المعالجة الصوتية في الخلفية"), "info");
      } catch {
        toast("تعذر الاتصال بالخادم", "error");
      }
      setStarting(false);
    },
    [articleId, toast],
  );

  /* مبدأ عدم التطبيق قبل الحفظ:
     - إن كانت المعالجة جارية: تُوقف فورًا عبر DELETE.
     - إن كان الصوت منشورًا: يُزال من حالة المحرر فقط ولا يُحذف من المنصة العامة
       إلا عند ضغط زر «حفظ التغييرات»! */
  const removeAudio = useCallback(async () => {
    if (!articleId) return;
    if (status === "PROCESSING") {
      try {
        const res = await fetch(`/api/articles/${articleId}/audio`, { method: "DELETE" });
        if (!res.ok) {
          const d = (await res.json().catch(() => ({}))) as { error?: string };
          toast(d.error || "تعذر إيقاف المعالجة", "error");
          return;
        }
        stopPoll();
        setStatus("NONE");
        setProgress(null);
        setNote("");
        setStale(false);
        setErrorText("");
        setLastResult(null);
        onAudioChange("");
        onDurationChange(null);
        toast("أُوقفت المعالجة الصوتية الجارية", "info");
      } catch {
        toast("تعذر الاتصال بالخادم", "error");
      }
      return;
    }

    locallyRemovedRef.current = true;
    setStatus("NONE");
    setProgress(null);
    setNote("");
    setStale(false);
    setErrorText("");
    setLastResult(null);
    onAudioChange("");
    onDurationChange(null);
    toast("أُزيل الصوت من المحرر — اضغط «حفظ» لتطبيق التغيير على المنصة", "info");
  }, [articleId, onAudioChange, onDurationChange, status, stopPoll, toast]);

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
        const data = (await res.json()) as { url?: string; error?: string };
        if (!res.ok) {
          toast(data.error || "تعذر رفع الملف الصوتي", "error");
          return;
        }
        locallyRemovedRef.current = false;
        onAudioChange(String(data.url ?? ""));
        setLastResult(null);
        toast("رُفع الملف الصوتي مؤقتًا — اضغط «حفظ» لتطبيقه على المقال", "info");
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

  const done = progress?.done ?? 0;
  const total = progress?.total ?? 0;
  const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const processing = status === "PROCESSING";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="block text-xs font-bold text-steel-700">
          القراءة الصوتية الذكية
          <span className="ms-2 font-normal text-steel-400">توليد خلفي لا ينقطع + تظليل الكلمة المقروءة لحظيًا</span>
        </label>
        {status === "READY" && (lastResult || audioGeneratedAt) && (
          <span className="rounded-lg bg-success-400/10 px-2.5 py-1 text-[11px] font-bold text-success-600">
            {lastResult
              ? `جاهز — ${fmtDur(lastResult.durationSec)} · ${lastResult.wordsCount} كلمة مزامَنة`
              : `مولّد سابقًا${audioVoice ? ` بصوت ${audioVoice}` : ""}`}
          </span>
        )}
        {processing && (
          <span className="rounded-lg bg-copper-500/10 px-2.5 py-1 text-[11px] font-bold text-copper-600">
            جارٍ التوليد في الخلفية..
          </span>
        )}
        {status === "FAILED" && (
          <span className="rounded-lg bg-danger-400/10 px-2.5 py-1 text-[11px] font-bold text-danger-600">
            فشل التوليد
          </span>
        )}
      </div>

      {audioUrl ? (
        <audio controls preload="metadata" src={audioUrl} ref={detectDuration} className="w-full" />
      ) : (
        <p className="rounded-xl bg-steel-50 p-3 text-[11px] leading-6 text-steel-400">
          لا صوت مرتبط في المسودة الحالية. أي تعديل أو إزالة لا يظهر على المنصة العامة إلا بعد ضغط زر «حفظ».
        </p>
      )}

      {processing && (
        <div className="rounded-xl border border-copper-500/30 bg-copper-500/5 p-3">
          <div className="mb-2 flex items-center justify-between text-[11px] font-bold text-copper-600">
            <span>{total ? `توليد المقطع ${Math.min(done + 1, total)} من ${total}..` : "تحضير خطة المقاطع الصوتية.."}</span>
            <span>{total ? `${pct}%` : "..."}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-steel-100">
            {total ? (
              <div className="h-full rounded-full bg-copper-500 transition-all duration-500" style={{ width: `${pct}%` }} />
            ) : (
              <div className="h-full w-1/3 animate-pulse rounded-full bg-copper-500/60" />
            )}
          </div>
          <p className="mt-2 text-[10px] leading-5 text-steel-500">
            المعالجة تجري في خلفية الخادم — يمكنك حفظ المقال أو نشره أو مغادرة الصفحة بأمان،
            وسيظهر المشغّل تلقائيًا هنا فور الاكتمال.
          </p>
          {note && <p className="mt-1 text-[10px] font-bold leading-5 text-copper-600">{note}</p>}
          {stale && (
            <div className="mt-2 rounded-lg border border-amber-400/40 bg-amber-400/5 p-2">
              <p className="text-[10px] font-bold leading-5 text-amber-600">
                بدت السلسلة معلقة (لا نبض منذ دقائق) — النظام يعيد إطلاقها تلقائيًا خلال لحظات،
                ويمكنك إعادة إطلاقها الآن فتُكمل من حيث توقفت:
              </p>
              <button
                onClick={() => start(true)}
                className="mt-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-[10px] font-bold text-white transition-transform active:scale-[0.98]"
              >
                استئناف المعالجة
              </button>
            </div>
          )}
        </div>
      )}

      {status === "FAILED" && (
        <div className="rounded-xl border border-danger-400/30 bg-danger-400/5 p-3">
          <p className="text-[11px] font-bold leading-6 text-danger-600">{errorText}</p>
          {progress && progress.done > 0 && (
            <p className="mt-1 text-[10px] font-bold leading-5 text-success-600">
              تقدمك محفوظ: اكتمل {progress.done} من {progress.total} مقطعًا — المتابعة لن تعيد ما أُنجز
            </p>
          )}
          <button
            onClick={() => start(false)}
            className="mt-1.5 rounded-lg bg-danger-600 px-3 py-1.5 text-[10px] font-bold text-white transition-transform active:scale-[0.98]"
          >
            {progress && progress.done > 0 ? "متابعة التوليد من حيث توقف" : "إعادة المحاولة"}
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => start(false)} disabled={processing || starting} className="transition-all">
          {processing || starting ? "جارٍ التوليد في الخلفية.." : "توليد الصوت والمزامنة تلقائيًا بالذكاء الاصطناعي"}
        </Button>
        <label
          className={`cursor-pointer rounded-xl border border-steel-200 px-4 py-2.5 text-xs font-bold text-steel-600 transition-colors hover:bg-steel-50 ${
            processing ? "pointer-events-none opacity-40" : ""
          }`}
        >
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
        {(audioUrl || processing) && (
          <button
            type="button"
            onClick={() => void removeAudio()}
            className="rounded-xl px-3 py-2.5 text-xs font-bold text-danger-600 transition-colors hover:bg-danger-400/10"
          >
            {processing ? "إيقاف المعالجة وإزالة الصوت" : "إزالة الصوت"}
          </button>
        )}
      </div>
    </div>
  );
}
