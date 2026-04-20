import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { api } from "@/lib/api";
import type { Category, CaptureInput } from "@/lib/types";
import { toISODateTimeMinute } from "@/lib/periods";

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "progress", label: "进展" },
  { value: "decision", label: "决定" },
  { value: "risk", label: "风险" },
  { value: "plan", label: "计划" },
  { value: "support", label: "协同" },
];

type ThreadChoice =
  | { kind: "inbox" }
  | { kind: "existing"; id: string }
  | { kind: "new" };

export default function QuickCapture({
  open,
  onClose,
  defaultThreadId,
}: {
  open: boolean;
  onClose: () => void;
  defaultThreadId?: string;
}) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [category, setCategory] = useState<Category>("progress");
  const [date, setDate] = useState(() => toISODateTimeMinute(new Date()));
  const [choice, setChoice] = useState<ThreadChoice>(() =>
    defaultThreadId ? { kind: "existing", id: defaultThreadId } : { kind: "inbox" }
  );
  const [newTitle, setNewTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement | null>(null);

  const { data: threads = [] } = useQuery({
    queryKey: ["threads"],
    queryFn: api.threads.list,
    enabled: open,
  });

  const orderedThreads = useMemo(
    () => [...threads].sort((a, b) => (b.pinned ?? 0) - (a.pinned ?? 0)),
    [threads]
  );

  useEffect(() => {
    if (!open) return;
    setText("");
    setCategory("progress");
    setDate(toISODateTimeMinute(new Date()));
    setChoice(defaultThreadId ? { kind: "existing", id: defaultThreadId } : { kind: "inbox" });
    setNewTitle("");
    setError(null);
    requestAnimationFrame(() => textRef.current?.focus());
  }, [open]);

  const save = useMutation({
    mutationFn: async () => {
      let threadId: string | null | undefined = undefined;
      if (choice.kind === "existing") threadId = choice.id;
      if (choice.kind === "new") {
        const title = newTitle.trim() || text.slice(0, 24);
        const t = await api.threads.create({ title, summary: "" });
        threadId = t.id;
      }
      const payload: CaptureInput = {
        text: text.trim(),
        event_date: date,
        category,
      };
      if (threadId) payload.thread_id = threadId;
      return api.captures.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inbox"] });
      qc.invalidateQueries({ queryKey: ["threads"] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (text.trim()) save.mutate();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, text, choice, newTitle, category, date]);

  if (!open) return null;

  const canSubmit =
    text.trim().length > 0 &&
    (choice.kind !== "new" || newTitle.trim().length > 0 || text.trim().length > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[10vh] backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="panel w-full max-w-xl overflow-hidden"
        style={{
          boxShadow:
            "0 1px 0 rgba(255,255,255,0.05) inset, 0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(94,230,197,0.08)",
        }}
      >
        {/* command-bar style header */}
        <div className="flex items-center gap-3 border-b border-line bg-canvas-sunken/70 px-5 py-2.5">
          <span className="dot-pulse" />
          <span className="eyebrow">QUICK CAPTURE</span>
          <span className="mono-meta ml-1 text-ink-faint">
            /capture → inbox
          </span>
          <div className="ml-auto flex items-center gap-1.5 mono-meta">
            <span className="kbd">⌘</span>
            <span className="kbd">↵</span>
            <span>保存</span>
            <span className="ml-2 kbd">ESC</span>
            <span>关闭</span>
          </div>
        </div>

        <div className="px-5 pb-5 pt-4">
          <textarea
            ref={textRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="刚才发生了什么？一行字也行。"
            className="h-32 w-full resize-none rounded-xl border border-line bg-canvas-sunken/60 px-4 py-3 font-mono text-[14px] leading-relaxed text-ink outline-none placeholder:text-ink-faint transition focus:border-accent/50 focus:bg-canvas-raised"
          />

          <div className="mt-4 grid grid-cols-[1fr_auto] items-start gap-4">
            <div>
              <div className="mb-1.5 eyebrow">分类</div>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setCategory(c.value)}
                    className={clsx(
                      "chip cursor-pointer",
                      category === c.value && "chip-accent"
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1.5 eyebrow">时间</div>
              <input
                type="datetime-local"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-lg border border-line bg-canvas-sunken/70 px-3 py-1.5 font-mono text-xs text-ink outline-none focus:border-accent/60 focus:bg-canvas-raised"
              />
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-1.5 eyebrow">归入</div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setChoice({ kind: "inbox" })}
                className={clsx(
                  "chip cursor-pointer",
                  choice.kind === "inbox" && "chip-accent"
                )}
              >
                收件箱（稍后整理）
              </button>
              <button
                type="button"
                onClick={() => setChoice({ kind: "new" })}
                className={clsx(
                  "chip cursor-pointer",
                  choice.kind === "new" && "chip-accent"
                )}
              >
                ＋新建线程
              </button>
              {orderedThreads.slice(0, 6).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setChoice({ kind: "existing", id: t.id })}
                  className={clsx(
                    "chip max-w-[220px] cursor-pointer truncate",
                    choice.kind === "existing" &&
                      choice.id === t.id &&
                      "chip-accent"
                  )}
                  title={t.title}
                >
                  {t.title}
                </button>
              ))}
            </div>
            {choice.kind === "new" && (
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="新线程的名字（留空则使用首段文字）"
                className="input mt-3"
              />
            )}
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-signal-stop/40 bg-signal-stop/10 px-4 py-2 text-xs text-signal-stop">
              {error}
            </div>
          )}

          <div className="mt-5 flex items-center justify-between gap-2">
            <span className="mono-meta">
              {text.length > 0 ? `${text.length} 字` : "待输入"}
            </span>
            <div className="flex items-center gap-2">
              <button
                className="btn btn-ghost"
                onClick={onClose}
                disabled={save.isPending}
              >
                取消
              </button>
              <button
                className="btn btn-accent"
                onClick={() => save.mutate()}
                disabled={!canSubmit || save.isPending}
              >
                {save.isPending ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
