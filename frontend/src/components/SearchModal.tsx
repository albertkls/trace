import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import type { SearchResult } from "@/lib/types";
import { CategoryChip } from "./EvidenceChip";

export default function SearchModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setResults(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setResults(null);
      setSearchError(false);
      return;
    }
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setSearchError(false);
      try {
        const data = await api.search(trimmed);
        setResults(data);
      } catch {
        setSearchError(true);
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [q]);

  const go = (path: string) => {
    navigate(path);
    onClose();
  };

  const total = results
    ? results.threads.length +
      results.projects.length +
      results.evidence.length +
      results.todos.length +
      results.notes.length
    : 0;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[8vh] backdrop-blur-sm"
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
        <div className="flex items-center gap-3 border-b border-line bg-canvas-sunken/70 px-4 py-2.5">
          <span className="mono-meta text-accent">⌘K</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索项目、线程、证据、待办、笔记…"
            className="flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-faint"
          />
          {loading && (
            <span className="mono-meta animate-pulse text-ink-mute">搜索中</span>
          )}
          {searchError && !loading && (
            <span className="mono-meta text-signal-stop">搜索失败</span>
          )}
          <span className="mono-meta text-ink-faint">ESC 关闭</span>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {!q.trim() ? (
            <div className="py-8 text-center text-sm text-ink-mute">
              输入关键字开始搜索
            </div>
          ) : results && total === 0 ? (
            <div className="py-8 text-center text-sm text-ink-mute">
              未找到与「{q.trim()}」相关的内容
            </div>
          ) : results ? (
            <div className="divide-y divide-line/50">
              {results.projects.length > 0 && (
                <section className="px-2 py-2">
                  <div className="mb-1 px-2 eyebrow text-[9px]">项目</div>
                  {results.projects.map((project) => (
                    <button
                      key={project.id}
                      onClick={() => go(`/projects/${project.id}`)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-canvas-contrast/50"
                    >
                      <span className="text-accent">▣</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-ink">
                          {project.name}
                        </div>
                        {project.summary && (
                          <div className="truncate text-xs text-ink-mute">
                            {project.summary}
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </section>
              )}

              {results.threads.length > 0 && (
                <section className="px-2 py-2">
                  <div className="mb-1 px-2 eyebrow text-[9px]">工作线</div>
                  {results.threads.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => go(`/threads/${t.id}`)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-canvas-contrast/50"
                    >
                      <span className="text-accent">≋</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-ink">
                          {t.title}
                        </div>
                        {t.project && (
                          <div className="truncate text-xs text-ink-mute">
                            {t.project}
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </section>
              )}

              {results.evidence.length > 0 && (
                <section className="px-2 py-2">
                  <div className="mb-1 px-2 eyebrow text-[9px]">证据</div>
                  {results.evidence.map((ev) => (
                    <button
                      key={ev.id}
                      onClick={() =>
                        go(ev.thread_id ? `/threads/${ev.thread_id}` : "/inbox")
                      }
                      className="flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-canvas-contrast/50"
                    >
                      <div className="mt-0.5 shrink-0">
                        <CategoryChip category={ev.category} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="line-clamp-2 text-sm text-ink">
                          {ev.text}
                        </div>
                        {ev.thread_title && (
                          <div className="mt-0.5 truncate text-xs text-ink-mute">
                            {ev.thread_title}
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </section>
              )}

              {results.todos.length > 0 && (
                <section className="px-2 py-2">
                  <div className="mb-1 px-2 eyebrow text-[9px]">待办</div>
                  {results.todos.map((td) => (
                    <button
                      key={td.id}
                      onClick={() => go("/todos")}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-canvas-contrast/50"
                    >
                      <span className="text-ink-mute">☐</span>
                      <span
                        className={
                          td.done
                            ? "truncate text-sm text-ink-faint line-through"
                            : "truncate text-sm text-ink"
                        }
                      >
                        {td.text}
                      </span>
                    </button>
                  ))}
                </section>
              )}

              {results.notes.length > 0 && (
                <section className="px-2 py-2">
                  <div className="mb-1 px-2 eyebrow text-[9px]">笔记</div>
                  {results.notes.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => go(`/notes?note_id=${n.id}`)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-canvas-contrast/50"
                    >
                      <span className="text-ink-mute">✎</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-ink">
                          {n.title || "（无标题）"}
                        </div>
                        <div className="mono-meta">{n.day}</div>
                      </div>
                    </button>
                  ))}
                </section>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
