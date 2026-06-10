import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import CategoryChoiceChips from "@/components/CategoryChoiceChips";
import DateTimeField from "@/components/DateTimeField";
import ProjectSelect from "@/components/ProjectSelect";
import ProjectRecommendationBar from "@/components/ProjectRecommendationBar";
import { api } from "@/lib/api";
import { recommendProjects } from "@/lib/projectRecommendations";
import type { Category, CaptureInput, Project, Thread } from "@/lib/types";
import { toISODateTimeMinute } from "@/lib/periods";

type ThreadChoice = { kind: "inbox" } | { kind: "existing"; id: string } | { kind: "new" };

/**
 * Parse inline tags from capture text.
 * `#thread-name` matches a thread title (case-insensitive substring).
 * `@project-name` matches a project name (case-insensitive substring).
 * Returns matched ids + the cleaned text (matched tags stripped).
 */
function parseInlineTags(
  raw: string,
  threads: Thread[],
  projects: Array<{ id: string; name: string }>
): {
  cleanedText: string;
  matchedThreadId: string | null;
  matchedProjectId: string | null;
} {
  const threadPattern = /(?:^|\s)#([^\s#]+)/g;
  const projectPattern = /(?:^|\s)@([^\s@]+)/g;

  let matchedThreadId: string | null = null;
  let matchedProjectId: string | null = null;
  const threadTagsToRemove: string[] = [];
  const projectTagsToRemove: string[] = [];

  // Find thread tags
  let m: RegExpExecArray | null;
  while ((m = threadPattern.exec(raw)) !== null) {
    const tag = m[1].toLowerCase();
    const found = threads.find((t) => t.title.toLowerCase().includes(tag));
    if (found) {
      matchedThreadId = found.id;
      threadTagsToRemove.push(m[0]);
    }
  }

  // Find project tags
  while ((m = projectPattern.exec(raw)) !== null) {
    const tag = m[1].toLowerCase();
    const found = projects.find((p) => p.name.toLowerCase().includes(tag));
    if (found) {
      matchedProjectId = found.id;
      projectTagsToRemove.push(m[0]);
    }
  }

  // Strip matched tags from text
  let cleaned = raw;
  for (const tag of threadTagsToRemove) {
    cleaned = cleaned.replace(tag, "");
  }
  for (const tag of projectTagsToRemove) {
    cleaned = cleaned.replace(tag, "");
  }
  // Collapse multiple spaces
  cleaned = cleaned.replace(/\s{2,}/g, " ").trim();

  return { cleanedText: cleaned, matchedThreadId, matchedProjectId };
}

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
  const [expanded, setExpanded] = useState(false);
  const [category, setCategory] = useState<Category>("progress");
  const [date, setDate] = useState(() => toISODateTimeMinute(new Date()));
  const [projectId, setProjectId] = useState("");
  const [projectTouched, setProjectTouched] = useState(false);
  const [, setInlineProjectId] = useState<string | null>(null);
  const [choice, setChoice] = useState<ThreadChoice>(() =>
    defaultThreadId ? { kind: "existing", id: defaultThreadId } : { kind: "inbox" }
  );
  const [, setInlineThreadId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saveCount, setSaveCount] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: (): Promise<Project[]> => api.projects.list().then((r) => r.items),
    enabled: open,
  });
  const { data: threads = [] } = useQuery({
    queryKey: ["threads"],
    queryFn: (): Promise<Thread[]> => api.threads.list().then((r) => r.items),
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

  // Focus input on open
  useEffect(() => {
    if (!open) return;
    setText("");
    setExpanded(false);
    setCategory("progress");
    setDate(toISODateTimeMinute(new Date()));
    setProjectId("");
    setProjectTouched(Boolean(defaultThreadId));
    setChoice(defaultThreadId ? { kind: "existing", id: defaultThreadId } : { kind: "inbox" });
    setNewTitle("");
    setError(null);
    setSaveCount(0);
    setInlineThreadId(null);
    setInlineProjectId(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [defaultThreadId, open]);

  // Re-focus after save in continuous mode
  useEffect(() => {
    if (saveCount === 0 || !open) return;
    requestAnimationFrame(() => {
      if (expanded) textareaRef.current?.focus();
      else inputRef.current?.focus();
    });
  }, [saveCount, open, expanded]);

  // Default thread from context
  useEffect(() => {
    if (!open || !defaultThreadId) return;
    const defaultThread = threads.find((thread) => thread.id === defaultThreadId);
    if (defaultThread?.project_id) {
      setProjectId(defaultThread.project_id);
    }
  }, [defaultThreadId, open, threads]);

  // Auto-recommend project
  useEffect(() => {
    if (!open || projectTouched || choice.kind === "existing") return;
    const top = recommendations[0];
    if (top && top.score >= 80) {
      setProjectId(top.projectId);
    } else if (!top && !defaultThreadId) {
      setProjectId("");
    }
  }, [choice.kind, defaultThreadId, open, projectTouched, recommendations]);

  // Keep choice valid when visible threads change
  useEffect(() => {
    if (choice.kind !== "existing") return;
    if (visibleThreads.some((thread) => thread.id === choice.id)) return;
    setChoice({ kind: "inbox" });
  }, [choice, visibleThreads]);

  // Sync project when existing thread is picked
  useEffect(() => {
    if (choice.kind !== "existing") return;
    const selectedThread = threads.find((thread) => thread.id === choice.id);
    if (!selectedThread?.project_id) return;
    setProjectId(selectedThread.project_id);
  }, [choice, threads]);

  // Parse inline tags from text
  const parsedTags = useMemo(
    () => parseInlineTags(text, threads, projects),
    [text, threads, projects]
  );

  // Apply inline tag matches (only if user hasn't manually touched)
  useEffect(() => {
    if (parsedTags.matchedThreadId && choice.kind !== "existing") {
      setChoice({ kind: "existing", id: parsedTags.matchedThreadId });
      setInlineThreadId(parsedTags.matchedThreadId);
    }
  }, [parsedTags.matchedThreadId]);

  useEffect(() => {
    if (parsedTags.matchedProjectId && !projectTouched) {
      setProjectId(parsedTags.matchedProjectId);
      setInlineProjectId(parsedTags.matchedProjectId);
    }
  }, [parsedTags.matchedProjectId, projectTouched]);

  const save = useMutation({
    mutationFn: async () => {
      let threadId: string | null | undefined = undefined;
      if (choice.kind === "existing") threadId = choice.id;
      if (choice.kind === "new") {
        const title = newTitle.trim() || parsedTags.cleanedText.slice(0, 24);
        const t = await api.threads.create({ title, summary: "", project_id: projectId || null });
        threadId = t.id;
      }
      const payload: CaptureInput = {
        text: parsedTags.cleanedText || text.trim(),
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
      qc.invalidateQueries({ queryKey: ["activity"] });
      if (capture?.thread_id) {
        qc.invalidateQueries({ queryKey: ["thread", capture.thread_id] });
      }
      // Continuous mode: reset text but keep choices
      setText("");
      setError(null);
      setInlineThreadId(null);
      setInlineProjectId(null);
      setSaveCount((n) => n + 1);
    },
    onError: (e: Error) => setError(e.message),
  });

  // Keyboard shortcuts
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      // Cmd/Ctrl+Enter always submits
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (text.trim()) save.mutate();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, text, save, onClose]);

  if (!open) return null;

  const canSubmit = text.trim().length > 0;

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    // In single-line mode: Enter submits, Shift+Enter expands
    if (!expanded) {
      if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        if (canSubmit) save.mutate();
        return;
      }
      if (e.key === "Enter" && e.shiftKey) {
        e.preventDefault();
        setExpanded(true);
        requestAnimationFrame(() => textareaRef.current?.focus());
        return;
      }
    }
  };

  const handleTextareaKeyDown = (e: React.KeyboardEvent) => {
    // In expanded mode: Shift+Enter collapses back
    if (e.key === "Enter" && e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      setExpanded(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  // Detected inline tags for visual feedback
  const hasInlineThread = parsedTags.matchedThreadId !== null;
  const hasInlineProject = parsedTags.matchedProjectId !== null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[10vh] backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="panel w-full max-w-xl"
        style={{
          boxShadow:
            "0 1px 0 rgba(255,255,255,0.05) inset, 0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(94,230,197,0.08)",
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-line bg-canvas-sunken/70 px-5 py-2.5">
          <span className="dot-pulse" />
          <span className="eyebrow">QUICK CAPTURE</span>
          {saveCount > 0 && (
            <span className="chip chip-accent animate-pulse">已保存 {saveCount} 条</span>
          )}
          <span className="mono-meta ml-1 text-ink-faint">
            {expanded ? "⌘↵ 保存 · ⇧↵ 收起" : "↵ 保存 · ⇧↵ 换行"}
          </span>
          <div className="ml-auto flex items-center gap-1.5 mono-meta">
            <span className="kbd">ESC</span>
            <span>关闭</span>
          </div>
        </div>

        <div className="px-5 pb-5 pt-4">
          {/* Input area: single-line or expanded textarea */}
          {expanded ? (
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleTextareaKeyDown}
              placeholder="写详细点也行，⌘↵ 保存。"
              rows={4}
              className="h-32 w-full resize-none rounded-xl border border-line bg-canvas-sunken/60 px-4 py-3 font-mono text-[14px] leading-relaxed text-ink outline-none placeholder:text-ink-faint transition focus:border-accent/50 focus:bg-canvas-raised"
            />
          ) : (
            <div className="relative">
              <input
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="刚才发生了什么？↵ 直接保存。"
                className="w-full rounded-xl border border-line bg-canvas-sunken/60 px-4 py-3 pr-20 font-mono text-[14px] leading-relaxed text-ink outline-none placeholder:text-ink-faint transition focus:border-accent/50 focus:bg-canvas-raised"
              />
              <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                {(hasInlineThread || hasInlineProject) && (
                  <span className="text-[10px] text-accent opacity-70">
                    {hasInlineThread && "⟷"}
                    {hasInlineProject && "◈"}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setExpanded(true);
                    requestAnimationFrame(() => textareaRef.current?.focus());
                  }}
                  className="rounded-md px-1.5 py-0.5 text-[10px] text-ink-mute transition hover:bg-canvas-contrast hover:text-ink"
                  title="展开多行模式 (Shift+Enter)"
                >
                  ⤢
                </button>
              </div>
            </div>
          )}

          {/* Inline tag hints */}
          {(hasInlineThread || hasInlineProject) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {hasInlineThread && (
                <span className="chip chip-accent text-[10px]">
                  → 线程: {threads.find((t) => t.id === parsedTags.matchedThreadId)?.title}
                </span>
              )}
              {hasInlineProject && (
                <span className="chip chip-accent text-[10px]">
                  ◈ 项目: {projects.find((p) => p.id === parsedTags.matchedProjectId)?.name}
                </span>
              )}
            </div>
          )}

          {/* Category + Date row */}
          <div className="mt-4 grid grid-cols-[1fr_auto] items-start gap-4">
            <div>
              <div className="mb-1.5 eyebrow">分类</div>
              <CategoryChoiceChips value={category} onChange={setCategory} />
            </div>
            <div>
              <div className="mb-1.5 eyebrow">时间</div>
              <DateTimeField
                value={date}
                onChange={(next) => setDate(next ?? "")}
                className="w-60"
                buttonClassName="font-mono text-xs"
                popoverClassName="-right-1 left-auto"
              />
            </div>
          </div>

          {/* Project */}
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

          {/* Thread picker */}
          <div className="mt-4">
            <div className="mb-1.5 eyebrow">归入</div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setChoice({ kind: "inbox" });
                  setInlineThreadId(null);
                }}
                className={clsx("chip cursor-pointer", choice.kind === "inbox" && "chip-accent")}
              >
                收件箱（稍后整理）
              </button>
              <button
                type="button"
                onClick={() => setChoice({ kind: "new" })}
                className={clsx("chip cursor-pointer", choice.kind === "new" && "chip-accent")}
              >
                ＋新建线程
              </button>
              {visibleThreads.slice(0, 6).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setChoice({ kind: "existing", id: t.id });
                    setInlineThreadId(null);
                  }}
                  className={clsx(
                    "chip max-w-[220px] cursor-pointer truncate",
                    choice.kind === "existing" && choice.id === t.id && "chip-accent"
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

          {/* Footer */}
          <div className="mt-5 flex items-center justify-between gap-2">
            <span className="mono-meta">
              {saveCount > 0
                ? `${saveCount} 条已保存`
                : text.length > 0
                  ? `${text.length} 字`
                  : "用 #线程 @项目 快速归类"}
            </span>
            <div className="flex items-center gap-2">
              <button className="btn btn-ghost" onClick={onClose} disabled={save.isPending}>
                {saveCount > 0 ? "完成" : "取消"}
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
