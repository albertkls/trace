import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { todoPreview } from "@/lib/richText";
import type { SearchResult } from "@/lib/types";
import { CategoryChip } from "./EvidenceChip";

const HISTORY_KEY = "trace:search-history";
const MAX_HISTORY = 10;

function getHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveHistory(q: string) {
  const trimmed = q.trim();
  if (!trimmed || trimmed.length < 2) return;
  const history = getHistory().filter((h) => h !== trimmed);
  localStorage.setItem(HISTORY_KEY, JSON.stringify([trimmed, ...history].slice(0, MAX_HISTORY)));
}

function clearHistory() {
  localStorage.removeItem(HISTORY_KEY);
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-accent/30 rounded-sm px-px">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

interface FlatItem {
  id: string;
  path: string;
  label: string;
  sub?: string;
}

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
  const [history, setHistory] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const flatItems = useRef<FlatItem[]>([]);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setResults(null);
    setSearchError(false);
    setSelectedIndex(-1);
    setHistory(getHistory());
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
      setSelectedIndex(-1);
      return;
    }
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setSearchError(false);
      setSelectedIndex(-1);
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

  // Rebuild flat list when results change
  useEffect(() => {
    const items: FlatItem[] = [];
    if (!results) {
      flatItems.current = items;
      return;
    }
    for (const p of results.projects) {
      items.push({ id: `p-${p.id}`, path: `/projects/${p.id}`, label: p.name, sub: p.summary ?? undefined });
    }
    for (const t of results.threads) {
      items.push({ id: `t-${t.id}`, path: `/threads/${t.id}`, label: t.title, sub: t.project ?? undefined });
    }
    for (const ev of results.evidence) {
      items.push({ id: `e-${ev.id}`, path: ev.thread_id ? `/threads/${ev.id}` : "/inbox", label: ev.text, sub: ev.thread_title ?? undefined });
    }
    for (const td of results.todos) {
      items.push({ id: `td-${td.id}`, path: "/todos", label: todoPreview(td.text) });
    }
    for (const n of results.notes) {
      items.push({ id: `n-${n.id}`, path: `/notes?note_id=${n.id}`, label: n.title || "（无标题）", sub: n.day });
    }
    flatItems.current = items;
  }, [results]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, flatItems.current.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, -1));
      } else if (e.key === "Enter" && selectedIndex >= 0) {
        e.preventDefault();
        const item = flatItems.current[selectedIndex];
        if (item) {
          saveHistory(q);
          go(item.path);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, selectedIndex, q]);

  const go = (path: string) => {
    navigate(path);
    onClose();
  };

  const handleResultClick = (path: string) => {
    saveHistory(q);
    go(path);
  };

  const total = results
    ? results.threads.length +
      results.projects.length +
      results.evidence.length +
      results.todos.length +
      results.notes.length
    : 0;

  const query = q.trim();

  const retrySearch = async () => {
    if (!query) return;
    setLoading(true);
    setSearchError(false);
    try {
      const data = await api.search(query);
      setResults(data);
    } catch {
      setSearchError(true);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  // Build a flat index counter for keyboard selection
  let flatIdx = 0;

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
          {!query ? (
            history.length > 0 ? (
              <div className="py-2">
                <div className="mb-1 flex items-center justify-between px-4 pt-2">
                  <span className="eyebrow text-[9px] text-ink-faint">最近搜索</span>
                  <button
                    onClick={() => {
                      clearHistory();
                      setHistory([]);
                    }}
                    className="eyebrow text-[9px] text-ink-faint hover:text-ink transition"
                  >
                    清除历史
                  </button>
                </div>
                {history.map((h, i) => (
                  <button
                    key={i}
                    onClick={() => setQ(h)}
                    className="flex w-full items-center gap-3 rounded-lg px-4 py-2 text-left text-sm text-ink-mute transition hover:bg-canvas-contrast/50"
                  >
                    <span className="text-ink-faint">&#8634;</span>
                    <span>{h}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-ink-mute">
                输入关键字开始搜索
              </div>
            )
          ) : searchError && !loading ? (
            <div className="flex flex-col items-center gap-3 py-8 text-sm text-ink-mute">
              <span>搜索失败，请重试</span>
              <button
                onClick={retrySearch}
                className="rounded-lg bg-canvas-contrast px-4 py-1.5 text-sm text-ink transition hover:bg-canvas-contrast/80"
              >
                重试
              </button>
            </div>
          ) : results && total === 0 ? (
            <div className="py-8 text-center text-sm text-ink-mute">
              未找到与「{query}」相关的内容
            </div>
          ) : results ? (
            <div className="divide-y divide-line/50">
              {total > 0 && (
                <div className="px-4 py-1.5">
                  <span className="eyebrow text-[9px] text-ink-faint">
                    找到 {total} 条结果
                  </span>
                </div>
              )}
              {results.projects.length > 0 && (
                <section className="px-2 py-2">
                  <div className="mb-1 px-2 eyebrow text-[9px]">项目</div>
                  {results.projects.map((project) => {
                    const idx = flatIdx++;
                    return (
                      <button
                        key={project.id}
                        onClick={() => handleResultClick(`/projects/${project.id}`)}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition ${
                          selectedIndex === idx
                            ? "bg-accent/20 ring-1 ring-accent/50"
                            : "hover:bg-canvas-contrast/50"
                        }`}
                      >
                        <span className="text-accent">▣</span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-ink">
                            <Highlight text={project.name} query={query} />
                          </div>
                          {project.summary && (
                            <div className="truncate text-xs text-ink-mute">
                              <Highlight text={project.summary} query={query} />
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </section>
              )}

              {results.threads.length > 0 && (
                <section className="px-2 py-2">
                  <div className="mb-1 px-2 eyebrow text-[9px]">工作线</div>
                  {results.threads.map((t) => {
                    const idx = flatIdx++;
                    return (
                      <button
                        key={t.id}
                        onClick={() => handleResultClick(`/threads/${t.id}`)}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition ${
                          selectedIndex === idx
                            ? "bg-accent/20 ring-1 ring-accent/50"
                            : "hover:bg-canvas-contrast/50"
                        }`}
                      >
                        <span className="text-accent">≋</span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-ink">
                            <Highlight text={t.title} query={query} />
                          </div>
                          {t.project && (
                            <div className="truncate text-xs text-ink-mute">
                              <Highlight text={t.project} query={query} />
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </section>
              )}

              {results.evidence.length > 0 && (
                <section className="px-2 py-2">
                  <div className="mb-1 px-2 eyebrow text-[9px]">证据</div>
                  {results.evidence.map((ev) => {
                    const idx = flatIdx++;
                    return (
                      <button
                        key={ev.id}
                        onClick={() =>
                          handleResultClick(ev.thread_id ? `/threads/${ev.thread_id}` : "/inbox")
                        }
                        className={`flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition ${
                          selectedIndex === idx
                            ? "bg-accent/20 ring-1 ring-accent/50"
                            : "hover:bg-canvas-contrast/50"
                        }`}
                      >
                        <div className="mt-0.5 shrink-0">
                          <CategoryChip category={ev.category} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="line-clamp-2 text-sm text-ink">
                            <Highlight text={ev.text} query={query} />
                          </div>
                          {ev.thread_title && (
                            <div className="mt-0.5 truncate text-xs text-ink-mute">
                              <Highlight text={ev.thread_title} query={query} />
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </section>
              )}

              {results.todos.length > 0 && (
                <section className="px-2 py-2">
                  <div className="mb-1 px-2 eyebrow text-[9px]">待办</div>
                  {results.todos.map((td) => {
                    const idx = flatIdx++;
                    return (
                      <button
                        key={td.id}
                        onClick={() => handleResultClick("/todos")}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition ${
                          selectedIndex === idx
                            ? "bg-accent/20 ring-1 ring-accent/50"
                            : "hover:bg-canvas-contrast/50"
                        }`}
                      >
                        <span className="text-ink-mute">☐</span>
                        <span
                          className={
                            td.done
                              ? "truncate text-sm text-ink-faint line-through"
                              : "truncate text-sm text-ink"
                          }
                        >
                          <Highlight text={todoPreview(td.text)} query={query} />
                        </span>
                      </button>
                    );
                  })}
                </section>
              )}

              {results.notes.length > 0 && (
                <section className="px-2 py-2">
                  <div className="mb-1 px-2 eyebrow text-[9px]">笔记</div>
                  {results.notes.map((n) => {
                    const idx = flatIdx++;
                    return (
                      <button
                        key={n.id}
                        onClick={() => handleResultClick(`/notes?note_id=${n.id}`)}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition ${
                          selectedIndex === idx
                            ? "bg-accent/20 ring-1 ring-accent/50"
                            : "hover:bg-canvas-contrast/50"
                        }`}
                      >
                        <span className="text-ink-mute">✎</span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm text-ink">
                            <Highlight text={n.title || "（无标题）"} query={query} />
                          </div>
                          <div className="mono-meta">{n.day}</div>
                        </div>
                      </button>
                    );
                  })}
                </section>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
