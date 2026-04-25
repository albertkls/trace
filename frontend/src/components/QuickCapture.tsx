import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import CategoryChoiceChips from "@/components/CategoryChoiceChips";
import ProjectSelect from "@/components/ProjectSelect";
import ProjectRecommendationBar from "@/components/ProjectRecommendationBar";
import { api } from "@/lib/api";
import { recommendProjects } from "@/lib/projectRecommendations";
import type { Category, CaptureInput } from "@/lib/types";
import { toISODateTimeMinute } from "@/lib/periods";

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
  const [projectId, setProjectId] = useState("");
  const [projectTouched, setProjectTouched] = useState(false);
  const [choice, setChoice] = useState<ThreadChoice>(() =>
    defaultThreadId ? { kind: "existing", id: defaultThreadId } : { kind: "inbox" }
  );
  const [newTitle, setNewTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement | null>(null);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: api.projects.list,
    enabled: open,
  });
  const { data: threads = [] } = useQuery({
    queryKey: ["threads"],
    queryFn: () => api.threads.list(),
    enabled: open,
  });

  const orderedThreads = useMemo(
    () => [...threads].sort((a, b) => (b.pinned ?? 0) - (a.pinned ?? 0)),
    [threads]
  );
  const visibleThreads = useMemo(
    () =>
      projectId
        ? orderedThreads.filter((thread) => thread.project_id === projectId)
        : orderedThreads,
    [orderedThreads, projectId]
  );
  const recommendations = useMemo(
    () => recommendProjects({ text, projects, threads }),
    [projects, text, threads]
  );

  useEffect(() => {
    if (!open) return;
    setText("");
    setCategory("progress");
    setDate(toISODateTimeMinute(new Date()));
    setProjectId("");
    setProjectTouched(Boolean(defaultThreadId));
    setChoice(defaultThreadId ? { kind: "existing", id: defaultThreadId } : { kind: "inbox" });
    setNewTitle("");
    setError(null);
    requestAnimationFrame(() => textRef.current?.focus());
  }, [defaultThreadId, open]);

  useEffect(() => {
    if (!open || !defaultThreadId) return;
    const defaultThread = threads.find((thread) => thread.id === defaultThreadId);
    if (defaultThread?.project_id) {
      setProjectId(defaultThread.project_id);
    }
  }, [defaultThreadId, open, threads]);

  useEffect(() => {
    if (!open || projectTouched || choice.kind === "existing") return;
    const top = recommendations[0];
    if (top && top.score >= 80) {
      setProjectId(top.projectId);
    } else if (!top && !defaultThreadId) {
      setProjectId("");
    }
  }, [choice.kind, defaultThreadId, open, projectTouched, recommendations]);

  useEffect(() => {
    if (choice.kind !== "existing") return;
    if (visibleThreads.some((thread) => thread.id === choice.id)) return;
    setChoice({ kind: "inbox" });
  }, [choice, visibleThreads]);

  useEffect(() => {
    if (choice.kind !== "existing") return;
    const selectedThread = threads.find((thread) => thread.id === choice.id);
    if (!selectedThread?.project_id) return;
    setProjectId(selectedThread.project_id);
  }, [choice, threads]);

  const save = useMutation({
    mutationFn: async () => {
      let threadId: string | null | undefined = undefined;
      if (choice.kind === "existing") threadId = choice.id;
      if (choice.kind === "new") {
        const title = newTitle.trim() || text.slice(0, 24);
        const t = await api.threads.create({ title, summary: "", project_id: projectId || null });
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
    onSuccess: (capture) => {
      qc.invalidateQueries({ queryKey: ["inbox"] });
      qc.invalidateQueries({ queryKey: ["threads"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["project"] });
      // Refresh the thread detail page if evidence was added to a specific thread
      if (capture?.thread_id) {
        qc.invalidateQueries({ queryKey: ["thread", capture.thread_id] });
      }
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
              <CategoryChoiceChips value={category} onChange={setCategory} />
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
            <div className="mb-1.5 eyebrow">项目（可选）</div>
            <ProjectSelect
              value={projectId}
              onChange={(value) => {
                setProjectTouched(true);
                setProjectId(value);
              }}
            />
          </div>

          <div className="mt-4">
            <ProjectRecommendationBar
              recommendations={recommendations}
              selectedProjectId={projectId}
              onSelect={(value) => {
                setProjectTouched(true);
                setProjectId(value);
              }}
              hint="根据当前输入自动推荐"
            />
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
              {visibleThreads.slice(0, 6).map((t) => (
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
            {choice.kind === "inbox" && projectId && (
              <div className="mt-3 text-xs text-ink-mute">
                当前已选项目，但如果仍保存到收件箱，这条记录不会直接挂到项目；项目只会在归入线程或新建线程时生效。
              </div>
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
