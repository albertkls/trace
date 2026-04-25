import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { useSearchParams } from "react-router-dom";
import CategoryChoiceChips from "@/components/CategoryChoiceChips";
import ProjectModal from "@/components/ProjectModal";
import ProjectSelect from "@/components/ProjectSelect";
import ProjectRecommendationBar from "@/components/ProjectRecommendationBar";
import ThreadMultiSelectChips from "@/components/ThreadMultiSelectChips";
import { api } from "@/lib/api";
import { recommendProjects } from "@/lib/projectRecommendations";
import type { Note, NotePatch, Thread, Category, Project } from "@/lib/types";
import { dateKey, formatDateTime, toDateTimeInputValue } from "@/lib/periods";

export default function Notes() {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryProjectId = searchParams.get("project_id") ?? "";
  const queryNoteId = searchParams.get("note_id");
  const [projectFilter, setProjectFilter] = useState(queryProjectId);
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: api.projects.list,
  });
  const { data: notes = [], isLoading } = useQuery({
    queryKey: ["notes", projectFilter],
    queryFn: () => api.notes.list(projectFilter || undefined),
  });
  const { data: threads = [] } = useQuery({
    queryKey: ["threads"],
    queryFn: () => api.threads.list(),
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const autoCreatedFromQuery = useRef(false);

  useEffect(() => {
    setProjectFilter(queryProjectId);
  }, [queryProjectId]);

  useEffect(() => {
    if (queryNoteId && notes.find((note) => note.id === queryNoteId)) {
      setSelectedId(queryNoteId);
      return;
    }
    if (!selectedId && notes.length > 0) {
      setSelectedId(notes[0].id);
    }
    if (selectedId && !notes.find((n) => n.id === selectedId)) {
      setSelectedId(notes[0]?.id ?? null);
    }
  }, [notes, queryNoteId, selectedId]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["notes"] });
    qc.invalidateQueries({ queryKey: ["threads"] });
    qc.invalidateQueries({ queryKey: ["projects"] });
    qc.invalidateQueries({ queryKey: ["project"] });
  };

  const create = useMutation({
    mutationFn: api.notes.create,
    onSuccess: (n) => {
      invalidate();
      setSelectedId(n.id);
    },
  });

  useEffect(() => {
    if (searchParams.get("new") !== "1" || autoCreatedFromQuery.current) return;
    autoCreatedFromQuery.current = true;
    create.mutate(
      {
        title: "",
        body_md: "",
        project_id: queryProjectId || null,
      },
      {
        onSuccess: () => {
          const next = new URLSearchParams(searchParams);
          next.delete("new");
          setSearchParams(next, { replace: true });
        },
      }
    );
  }, [create, queryProjectId, searchParams, setSearchParams]);

  const byDay = useMemo(() => {
    const groups = new Map<string, Note[]>();
    for (const n of notes) {
      const key = dateKey(n.day);
      const arr = groups.get(key) ?? [];
      arr.push(n);
      groups.set(key, arr);
    }
    return Array.from(groups.entries());
  }, [notes]);

  const selected = notes.find((n) => n.id === selectedId) ?? null;

  return (
    <div className="mx-auto max-w-6xl px-10 py-10">
      <header className="mb-6 flex items-end justify-between gap-6">
        <div>
          <div className="eyebrow">NOTES</div>
          <h1 className="mt-2 font-display text-[32px] font-semibold leading-none tracking-tight">
            记事
          </h1>
          <p className="mt-2 text-sm text-ink-soft">
            轻量速记，可随时晋升为证据或挂到线程。
          </p>
        </div>
        <button
          className="btn btn-accent"
          onClick={() =>
            create.mutate({
              title: "",
              body_md: "",
              project_id: projectFilter || null,
            })
          }
          disabled={create.isPending}
        >
          ＋ 新建
        </button>
      </header>

      <div className="mb-6 flex items-center gap-3">
        <span className="eyebrow">按项目过滤</span>
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="input w-72"
        >
          <option value="">全部项目</option>
          {projects
            .filter((project) => project.status !== "archived")
            .map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
        </select>
      </div>

      {isLoading ? (
        <div className="panel p-12 text-center text-sm text-ink-mute">
          加载中…
        </div>
      ) : notes.length === 0 ? (
        <div className="panel p-12 text-center text-sm text-ink-mute">
          空如新纸。点「＋ 新建」写下第一条。
        </div>
      ) : (
        <div className="grid grid-cols-[260px_1fr] gap-5">
          {/* Sidebar */}
          <aside className="panel max-h-[72vh] overflow-y-auto p-2">
            {byDay.map(([day, dayNotes]) => (
              <div key={day} className="mb-3 last:mb-1">
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <span className="eyebrow text-[9px]">
                    {formatDateTime(day, { includeTime: false, withYear: false })}
                  </span>
                  <span className="h-px flex-1 bg-line" />
                  <span className="mono-meta text-[10px]">
                    {dayNotes.length}
                  </span>
                </div>
                <ul>
                  {dayNotes.map((n) => (
                    <li key={n.id}>
                      <button
                        onClick={() => {
                          setSelectedId(n.id);
                          const next = new URLSearchParams(searchParams);
                          next.set("note_id", n.id);
                          if (projectFilter) next.set("project_id", projectFilter);
                          setSearchParams(next, { replace: true });
                        }}
                        className={clsx(
                          "block w-full truncate rounded-md px-2 py-1.5 text-left text-sm transition",
                          selectedId === n.id
                            ? "bg-accent/10 text-accent"
                            : "text-ink-soft hover:bg-canvas-contrast hover:text-ink"
                        )}
                      >
                        <div className="truncate">{n.title.trim() || preview(n.body_md) || "未命名"}</div>
                        <div className="truncate text-[10px] text-ink-faint">
                          {n.day.slice(0, 10)}
                          {n.project_name ? ` · ${n.project_name}` : ""}
                          {" · "}
                          {n.thread_ids.length > 0 ? `挂靠 ${n.thread_ids.length} 线程` : "未挂靠"}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </aside>

          {/* Editor */}
          <section className="panel p-5">
            {selected ? (
              <NoteEditor
                note={selected}
                threads={threads}
                projects={projects}
                projectFilter={projectFilter}
                onChanged={invalidate}
                onDeleted={() => setSelectedId(null)}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-ink-mute">
                选择一条笔记开始编辑。
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function preview(md: string): string {
  return md.replace(/[#*_`>-]/g, "").trim().split("\n")[0].slice(0, 40);
}

function NoteEditor({
  note,
  threads,
  projects,
  projectFilter,
  onChanged,
  onDeleted,
}: {
  note: Note;
  threads: Thread[];
  projects: Array<{ id: string; name: string }>;
  projectFilter: string;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body_md);
  const [day, setDay] = useState(note.day);
  const [projectId, setProjectId] = useState(note.project_id ?? projectFilter);
  const [threadIds, setThreadIds] = useState<string[]>(note.thread_ids ?? []);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [promoting, setPromoting] = useState(false);
  const [promoteCategory, setPromoteCategory] = useState<Category>("progress");
  const [promoteThreadId, setPromoteThreadId] = useState<string>("");
  const [projectModalOpen, setProjectModalOpen] = useState(false);

  useEffect(() => {
    setTitle(note.title);
    setBody(note.body_md);
    setDay(note.day);
    setProjectId(note.project_id ?? projectFilter);
    setThreadIds(note.thread_ids ?? []);
    setSavedAt(null);
    setPromoting(false);
    setPromoteCategory("progress");
    setPromoteThreadId(note.thread_ids?.[0] ?? "");
  }, [note.id, note.title, note.body_md, note.day, note.project_id, note.thread_ids, projectFilter]);

  const patch = useMutation({
    mutationFn: (p: NotePatch) => api.notes.patch(note.id, p),
    onSuccess: () => {
      setSavedAt(new Date().toLocaleTimeString());
      onChanged();
    },
  });
  const remove = useMutation({
    mutationFn: () => api.notes.remove(note.id),
    onSuccess: () => {
      onDeleted();
      onChanged();
    },
  });
  const promote = useMutation({
    mutationFn: () => {
      const text = body.trim() || title.trim();
      if (!text) return Promise.reject(new Error("内容为空"));
      return api.captures.promoteNoteToEvidence(note.id, {
        text,
        category: promoteCategory,
        event_date: day,
        thread_id: promoteThreadId,
      });
    },
    onSuccess: (evidence) => {
      setPromoting(false);
      qc.invalidateQueries({ queryKey: ["inbox"] });
      if (evidence.thread_id) {
        qc.invalidateQueries({ queryKey: ["thread", evidence.thread_id] });
      }
      onChanged();
    },
  });

  const dirty =
    title !== note.title ||
    body !== note.body_md ||
    day !== note.day ||
    projectId !== (note.project_id ?? projectFilter) ||
    JSON.stringify(threadIds) !== JSON.stringify(note.thread_ids ?? []);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!dirty) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      patch.mutate({
        title,
        body_md: body,
        day,
        project_id: projectId || null,
        clear_project: !projectId,
        thread_ids: threadIds,
      });
    }, 800);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, body, day, projectId, threadIds, dirty]);

  const toggleThread = (id: string) => {
    setThreadIds(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  const selectedThreadObjects = useMemo(
    () => threads.filter((thread) => threadIds.includes(thread.id)),
    [threadIds, threads]
  );
  const conflictingThreads = useMemo(
    () =>
      selectedThreadObjects.filter(
        (thread) => !!projectId && !!thread.project_id && thread.project_id !== projectId
      ),
    [projectId, selectedThreadObjects]
  );
  const threadProjectIds = useMemo(
    () =>
      Array.from(
        new Set(selectedThreadObjects.map((thread) => thread.project_id).filter(Boolean))
      ) as string[],
    [selectedThreadObjects]
  );
  const selectedProjectName =
    projects.find((project) => project.id === projectId)?.name ?? note.project_name ?? "";
  const recommendations = useMemo(
    () =>
      recommendProjects({
        text: [title, body].filter(Boolean).join("\n"),
        projects,
        threads,
        selectedThreadIds: threadIds,
      }),
    [body, projects, threadIds, threads, title]
  );

  return (
    <div className="flex h-full flex-col gap-3">
      <ProjectModal
        open={projectModalOpen}
        onClose={() => setProjectModalOpen(false)}
        onSaved={(project: Project) => {
          setProjectId(project.id);
          setProjectModalOpen(false);
        }}
      />
      <div className="flex items-center gap-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="标题（可留空）"
          className="flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 font-display text-lg font-semibold text-ink outline-none hover:border-line focus:border-accent/60"
        />
        <input
          type="datetime-local"
          value={toDateTimeInputValue(day)}
          onChange={(e) => setDay(e.target.value)}
          className="rounded-md border border-line bg-canvas-sunken/70 px-2 py-1 font-mono text-[11px] text-ink outline-none focus:border-accent/60"
        />
        <button
          className="btn btn-ghost text-xs"
          onClick={() => {
            setPromoteCategory("progress");
            setPromoteThreadId(note.thread_ids?.[0] ?? "");
            setPromoting(true);
          }}
        >
          晋升为证据
        </button>
        <button
          className="btn btn-ghost text-xs text-signal-stop hover:!bg-signal-stop/10 hover:!text-signal-stop"
          onClick={() => {
            if (window.confirm("删除这条笔记？")) remove.mutate();
          }}
        >
          删除
        </button>
      </div>

      {/* Thread attachment */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-ink-mute">所属项目：</span>
        <div className="w-64">
          <ProjectSelect value={projectId} onChange={setProjectId} />
        </div>
        <button
          type="button"
          className="btn btn-ghost text-xs"
          onClick={() => setProjectModalOpen(true)}
        >
          ＋ 新建项目
        </button>
      </div>

      <ProjectRecommendationBar
        recommendations={recommendations}
        selectedProjectId={projectId}
        onSelect={setProjectId}
        hint="根据笔记内容与挂靠线程推荐"
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-ink-mute">挂靠线程：</span>
        <ThreadMultiSelectChips
          threads={threads}
          selectedIds={threadIds}
          onToggle={toggleThread}
        />
      </div>

      {conflictingThreads.length > 0 && (
        <div className="rounded-lg border border-signal-stop/40 bg-signal-stop/10 px-3 py-2 text-xs text-signal-stop">
          当前记事属于「{selectedProjectName || "当前项目"}」，但所选线程中有{" "}
          {conflictingThreads.length} 条属于其他项目。
        </div>
      )}

      {!projectId && threadProjectIds.length > 1 && (
        <div className="rounded-lg border border-signal-hold/40 bg-signal-hold/10 px-3 py-2 text-xs text-signal-hold">
          当前挂靠线程跨多个项目，建议明确这条记事的项目归属。
        </div>
      )}

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="支持 Markdown。# 标题 / - 列表 / **加粗** / `code`"
        className="min-h-[45vh] flex-1 resize-y rounded-lg border border-line bg-canvas-sunken/60 px-4 py-3 font-mono text-[13px] leading-relaxed text-ink outline-none transition focus:border-accent/50 focus:bg-canvas-raised"
      />
      <div className="flex items-center justify-between mono-meta">
        <span className="flex items-center gap-2">
          {patch.isPending ? (
            <>
              <span className="dot-pulse" />
              <span>保存中…</span>
            </>
          ) : dirty ? (
            <>
              <span className="dot dot-hold" />
              <span>有未保存改动</span>
            </>
          ) : savedAt ? (
            <>
              <span className="dot dot-go" />
              <span>已保存 · {savedAt}</span>
            </>
          ) : (
            <>
              <span className="dot dot-mute" />
              <span>
                上次更新 {note.updated_at.slice(0, 16).replace("T", " ")}
              </span>
            </>
          )}
        </span>
        <span>{body.length} 字符</span>
      </div>

      {/* Promote to evidence modal */}
      {promoting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="panel w-full max-w-md p-5">
            <div className="mb-4 flex items-center gap-2">
              <span className="chip chip-accent">晋升为证据</span>
              <span className="mono-meta text-ink-faint">选择分类与目标线程</span>
            </div>
            <div className="mb-4">
              <div className="mb-2 text-xs text-ink-mute">分类</div>
              <CategoryChoiceChips value={promoteCategory} onChange={setPromoteCategory} />
            </div>
            <div className="mb-4">
              <div className="mb-2 text-xs text-ink-mute">目标线程</div>
              <select
                value={promoteThreadId}
                onChange={e => setPromoteThreadId(e.target.value)}
                className="w-full rounded-lg border border-line bg-canvas-sunken/70 px-3 py-2 text-sm outline-none focus:border-accent/60"
              >
                <option value="">收件箱（稍后整理）</option>
                {threads.map(t => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </div>
            {promote.error instanceof Error && (
              <div className="mb-4 rounded-lg border border-signal-stop/40 bg-signal-stop/10 px-3 py-2 text-xs text-signal-stop">
                晋升失败：{promote.error.message}
              </div>
            )}
            <div className="flex gap-2">
              <button
                className="btn btn-ghost flex-1"
                onClick={() => setPromoting(false)}
                disabled={promote.isPending}
              >
                取消
              </button>
              <button
                className="btn btn-accent flex-1"
                onClick={() => promote.mutate()}
                disabled={promote.isPending || (!body.trim() && !title.trim())}
              >
                {promote.isPending ? "晋升中…" : "确认晋升"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
