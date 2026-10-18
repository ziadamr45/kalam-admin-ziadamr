"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * ============================================================
 * التيرمينال السيادي — Web-Terminal Interface
 * ============================================================
 * نافذة سطر أوامر مدمجة تُفتح بـ Ctrl+~ (أو زر الشريط الجانبي)،
 * بخطوط Mono وسمات ألوان المنصة. المحرك خادمي صارم الصلاحية
 * (/api/admin/cli) ويوثق كل أمر في سجل التدقيق.
 */

type CliLine = { type: string; text: string };

const TYPE_CLASS: Record<string, string> = {
  cmd: "text-copper-400",
  info: "text-steel-100",
  ok: "text-emerald-400",
  warn: "text-amber-400",
  error: "text-rose-400",
  muted: "text-steel-400",
};

const BANNER: CliLine[] = [
  { type: "info", text: "«كلام له لازمة» — التيرمينال السيادي v2.7.0" },
  { type: "muted", text: "اكتب help لعرض قائمة الأوامر — كل أمر يُنفَّذ على الإنتاج مباشرة ويُوثَّق في سجل التدقيق" },
];

export function SovereignTerminal({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const [lines, setLines] = useState<CliLine[]>(BANNER);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyAt, setHistoryAt] = useState(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /* التركيز والتمرير */
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 60);
  }, [open]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lines]);

  /* الاختصار العالمي Ctrl+~ (Backquote) — و ESC للإغلاق */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "`" || e.key === "~" || e.code === "Backquote")) {
        e.preventDefault();
        onToggle();
      }
      if (e.key === "Escape" && open) onToggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onToggle]);

  const submit = useCallback(
    async (raw: string) => {
      const command = raw.trim();
      if (!command || busy) return;

      setLines((prev) => [...prev, { type: "cmd", text: command }]);

      if (command.toLowerCase() === "clear") {
        setLines([]);
        setInput("");
        return;
      }

      setHistory((prev) => [...prev.filter((h) => h !== command), command].slice(-60));
      setHistoryAt(-1);
      setInput("");
      setBusy(true);

      try {
        const res = await fetch("/api/admin/cli", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command }),
        });
        const data = await res.json();
        if (data.lines) {
          setLines((prev) => [...prev, ...(data.lines as CliLine[])]);
        } else {
          setLines((prev) => [...prev, { type: "error", text: data.error ?? "تعذر التنفيذ" }]);
        }
      } catch {
        setLines((prev) => [...prev, { type: "error", text: "تعذر الاتصال بمحرك الأوامر" }]);
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  /* التنقل في تاريخ الأوامر */
  const onHistoryKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!history.length) return;
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = historyAt < 0 ? history.length - 1 : Math.max(0, historyAt - 1);
      setHistoryAt(next);
      setInput(history[next]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyAt < 0) return;
      const next = historyAt + 1;
      if (next >= history.length) {
        setHistoryAt(-1);
        setInput("");
      } else {
        setHistoryAt(next);
        setInput(history[next]);
      }
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[80] flex h-[62vh] min-h-80 flex-col border-t-2 border-copper-600/60 bg-steel-950 shadow-[0_-20px_60px_rgba(0,0,0,0.5)]" role="dialog" aria-label="التيرمينال السيادي">
      {/* شريط العنوان */}
      <div className="flex items-center justify-between border-b border-steel-800 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-rose-500/80" />
          <span className="h-3 w-3 rounded-full bg-amber-400/80" />
          <span className="h-3 w-3 rounded-full bg-emerald-500/80" />
          <span className="mr-2 font-mono text-xs font-bold text-steel-300">kalam@sovereign — /api/admin/cli</span>
        </div>
        <button
          onClick={onToggle}
          className="rounded-lg px-2 py-1 font-mono text-[10px] text-steel-400 transition-colors hover:bg-steel-800 hover:text-steel-100"
          title="إغلاق (Esc)"
        >
          Ctrl+~ ✕
        </button>
      </div>

      {/* السجل */}
      <div ref={scrollRef} className="no-scrollbar flex-1 overflow-y-auto px-4 py-3">
        {lines.map((l, i) => (
          <p key={i} className={`whitespace-pre-wrap break-all py-0.5 font-mono text-[12px] leading-relaxed ${TYPE_CLASS[l.type] ?? "text-steel-200"}`} dir="auto">
            {l.type === "cmd" ? `▸ ${l.text}` : l.text}
          </p>
        ))}
        {busy && <p className="animate-pulse py-0.5 font-mono text-[12px] text-copper-400">▸ جارٍ التنفيذ…</p>}
      </div>

      {/* سطر الإدخال */}
      <div className="flex items-center gap-2 border-t border-steel-800 bg-steel-900/60 px-4 py-3">
        <span className="shrink-0 font-mono text-xs font-bold text-emerald-400" dir="ltr">
          kalam@sovereign:~$
        </span>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit(input);
            else onHistoryKey(e);
          }}
          disabled={busy}
          spellCheck={false}
          autoComplete="off"
          className="w-full bg-transparent font-mono text-sm text-steel-100 caret-copper-400 outline-none placeholder:text-steel-600"
          placeholder="اكتب أمرًا… (help | sys info | cache purge | user inspect …)"
        />
      </div>
    </div>
  );
}
