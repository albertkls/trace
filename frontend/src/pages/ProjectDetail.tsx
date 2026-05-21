import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import NewReportModal from "@/components/NewReportModal";
import NewThreadModal from "@/components/NewThreadModal";
import ProjectModal from "@/components/ProjectModal";
import ProjectStatusBadge from "@/components/ProjectStatusBadge";
import AttachmentPanel from "@/components/AttachmentPanel";
import { api } from "@/lib/api";
import { formatDateTime, parseDateTime, PRESETS } from "@/lib/periods";
import { todoPreview } from "@/lib/richText";

type ActivityItem = {
  id: string;
  kind: "evidence" | "thread" | "note" | "report" | "todo";
  title: string;
  to: string;
  ts: string;
  meta: string;
};

export default function ProjectDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [newThreadOpen, setNewThreadOpen] = useState(false);
  const [newReportOpen, setNewReportOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: project, isLoading } = useQuery({
    queryKey: ["project", id],
    queryFn: () => api.projects.get(id),
    enabled: !!id,
  });
  const recentActivity = useMemo(() => {
    if (!project) return [];
    const items: ActivityItem[] = [
      ...project.evidence.slice(0, 20).map((evidence) => ({
        id: `evidence:${evidence.id}`,
        kind: "evidence" as const,
        title: evidence.text,
        to: evidence.thread_id ? `/threads/${evidence.thread_id}` : "/inbox",
        ts: evidence.event_date || evidence.created_at,
        meta: `${evidence.thread_title || "未挂线程"} · ${evidence.category}`,
      })),
      ...project.threads.map((thread) => ({
        id: `thread:${thread.id}`,
        kind: "thread" as const,
        title: thread.title,
        to: `/threads/${thread.id}`,
        ts: thread.last_active_at,
        meta: `${thread.evidence_count ?? 0} 条证据`,
      })),
      ...project.notes.map((note) => ({
        id: `note:${note.id}`,
        kind: "note" as const,
        title: note.title || "未命名笔记",
        to: `/notes?project_id=${project.id}&note_id=${note.id}`,
        ts: note.updated_at,
        meta: note.day,
      })),
      ...project.reports.map((report) => ({
        id: `report:${report.id}`,
        kind: "report" as const,
        title: report.title,
        to: `/reports/${report.id}`,
        ts: report.updated_at,
        meta: `${report.period_label} · ${report.status}`,
      })),
      ...project.todos.map((todo) => ({
        id: `todo:${todo.id}`,
        kind: "todo" as const,
        title: todoPreview(todo.text),
        to: "/todos",
        ts: todo.done_at || todo.created_at,
        meta: `${todo.done ? "已完成" : "待处理"} · ${todo.thread_title || "未挂线程"}`,
      })),
    ];

    return items
      .filter((item) => !!parseDateTime(item.ts))
      .sort(
        (a, b) =>
          (parseDateTime(b.ts)?.getTime() ?? 0) - (parseDateTime(a.ts)?.getTime() ?? 0)
      )
      .slice(0, 12);
  }, [project]);

  const searchText = query.trim().toLowerCase();
  const filteredThreads = useMemo(
    () =>
      !searchText
        ? project?.threads ?? []
        : (project?.threads ?? []).filter(
            (thread) =>
              thread.title.toLowerCase().includes(searchText) ||
              (thread.summary || "").toLowerCase().includes(searchText)
          ),
    [project?.threads, searchText]
  );
  const filteredReports = useMemo(
    () =>
      !searchText
        ? project?.reports ?? []
        : (project?.reports ?? []).filter(
            (report) =>
              report.title.toLowerCase().includes(searchText) ||
              report.period_label.toLowerCase().includes(searchText)
          ),
    [project?.reports, searchText]
  );
  const filteredNotes = useMemo(
    () =>
      !searchText
        ? project?.notes ?? []
        : (project?.notes ?? []).filter(
            (note) =>
              (note.title || "").toLowerCase().includes(searchText) ||
              (note.body_md || "").toLowerCase().includes(searchText)
          ),
    [project?.notes, searchText]
  );
  const filteredTodos = useMemo(
    () =>
      !searchText
        ? project?.todos ?? []
        : (project?.todos ?? []).filter(
            (todo) =>
              todoPreview(todo.text).toLowerCase().includes(searchText) ||
              (todo.thread_title || "").toLowerCase().includes(searchText)
          ),
    [project?.todos, searchText]
  );
  const filteredActivity = useMemo(
    () =>
      !searchText
        ? recentActivity
        : recentActivity.filter(
            (item) =>
              item.title.toLowerCase().includes(searchText) ||
              item.meta.toLowerCase().includes(searchText)
          ),
    [recentActivity, searchText]
  );
  const safeProjectId = project?.id ?? id;
  const safeProjectName = project?.name ?? "项目";

  const summarize = useMutation({
    mutationFn: () => api.projects.summarize(id),
    onSuccess: () => {
      setActionError(null);
      qc.invalidateQueries({ queryKey: ["project", id] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (e: Error) => setActionError(`项目摘要生成失败：${e.message}`),
  });

  const createWeeklyReport = useMutation({
    mutationFn: async () => {
      const currentWeek = PRESETS.find((preset) => preset.key === "this_week")?.range();
      if (!currentWeek) throw new Error("无法计算本周时间范围");
      return api.reports.create({
        period_start: currentWeek.start,
        period_end: currentWeek.end,
        audience: "boss",
        project_id: safeProjectId,
        title: `${safeProjectName} · 本周项目报告`,
        body_md: "## 项目综述\n\n-\n\n## 关键推进\n\n-\n\n## 风险与阻塞\n\n-\n\n## 下一步\n\n- ",
      });
    },
    onSuccess: (report) => {
      setActionError(null);
      qc.invalidateQueries({ queryKey: ["reports"] });
      qc.invalidateQueries({ queryKey: ["project", id] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      navigate(`/reports/${report.id}`);
    },
    onError: (e: Error) => setActionError(`创建本周项目报告失败：${e.message}`),
  });

  if (isLoading || !project) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-mute">
        加载项目…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-10 py-10">
      <ProjectModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onDeleted={() => navigate("/projects")}
        project={project}
      />
      <NewThreadModal
        open={newThreadOpen}
        onClose={() => setNewThreadOpen(false)}
        defaultProjectId={project.id}
        onCreated={(thread) => navigate(`/threads/${thread.id}`)}
      />
      <NewReportModal
        open={newReportOpen}
        onClose={() => setNewReportOpen(false)}
        defaultProjectId={project.id}
        onCreated={(report) => navigate(`/reports/${report.id}`)}
      />

      <header className="mb-8">
        <Link to="/projects" className="text-xs text-ink-mute transition hover:text-accent">
          ← 项目
        </Link>
        <div className="mt-3 flex items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-display text-[32px] font-semibold leading-tight tracking-tight">
                {project.name}
              </h1>
              <ProjectStatusBadge status={project.status} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-mute">
              {project.owner && <span className="chip">负责人 · {project.owner}</span>}
              <span className="chip">{project.thread_count ?? project.threads.length} 条线程</span>
              <span className="chip">{project.note_count ?? project.notes.length} 条记事</span>
              <span className="chip">{project.report_count ?? project.reports.length} 份汇报</span>
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-soft">
              {project.summary || "还没有项目摘要。"}
            </p>
          </div>
          <div className="flex gap-2">
            <button className="btn" onClick={() => setEditOpen(true)}>
              编辑项目
            </button>
            <button className="btn" onClick={() => summarize.mutate()} disabled={summarize.isPending}>
              {summarize.isPending ? "生成摘要中…" : "生成项目摘要"}
            </button>
            <button
              className="btn"
              onClick={() => navigate(`/notes?project_id=${project.id}&new=1`)}
            >
              ＋ 新建记事
            </button>
            <button className="btn" onClick={() => setNewThreadOpen(true)}>
              ＋ 新建线程
            </button>
            <button
              className="btn"
              onClick={() => createWeeklyReport.mutate()}
              disabled={createWeeklyReport.isPending}
            >
              {createWeeklyReport.isPending ? "创建中…" : "一键本周报告"}
            </button>
            <button className="btn btn-accent" onClick={() => setNewReportOpen(true)}>
              写项目报告
            </button>
          </div>
        </div>
      </header>

      <div className="mb-8 grid grid-cols-3 gap-4">
        <MetricCard label="线程" value={project.thread_count ?? project.threads.length} />
        <MetricCard label="记事" value={project.note_count ?? project.notes.length} />
        <MetricCard label="汇报" value={project.report_count ?? project.reports.length} />
      </div>

      {actionError && (
        <div className="mb-6 rounded-xl border border-signal-stop/40 bg-signal-stop/10 px-4 py-3 text-sm text-signal-stop">
          {actionError}
        </div>
      )}

      <div className="mb-8">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="在当前项目内搜索线程、记事、待办、汇报…"
          className="input w-full"
        />
      </div>

      {project.health && (
        <section className="panel mb-8 overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <div className="flex items-center gap-2">
              <div className="eyebrow">PROJECT HEALTH</div>
              <HealthChip status={project.health.health_status} />
            </div>
            <span className="text-xs text-ink-soft">{project.health.next_action}</span>
          </div>
          <div className="grid gap-px bg-line/50 md:grid-cols-4">
            <HealthMetric label="阻塞线程" value={project.health.blocked_thread_count} tone="stop" />
            <HealthMetric label="沉默线程" value={project.health.stale_thread_count} tone="hold" />
            <HealthMetric label="待办未完成" value={project.health.open_todo_count} tone="accent" />
            <HealthMetric label="报告草稿" value={project.health.draft_report_count} tone="muted" />
          </div>
          <div className="grid gap-px bg-line/50 border-t border-line md:grid-cols-3">
            <HealthMetric label="本周新增证据" value={project.health.week_evidence_count} tone="go" />
            <HealthMetric label="本周完成待办" value={project.health.week_done_todo_count} tone="go" />
            <HealthMetric label="本周活跃线程" value={project.health.week_active_thread_count} tone="accent" />
          </div>
        </section>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)_340px] gap-6">
        <section className="space-y-6">
          <div className="panel p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="eyebrow">THREADS</div>
              <div className="flex items-center gap-3">
                <Link to={`/projects/${project.id}/timeline`} className="text-xs text-accent">
                  查看时间线 →
                </Link>
                <button className="text-xs text-accent" onClick={() => setNewThreadOpen(true)}>
                  ＋ 新建线程
                </button>
              </div>
            </div>
            {filteredThreads.length === 0 ? (
              <div className="text-sm text-ink-mute">这个项目还没有工作线。</div>
            ) : (
              <ul className="space-y-2">
                {filteredThreads.map((thread) => (
                  <li key={thread.id}>
                    <Link
                      to={`/threads/${thread.id}`}
                      className="flex items-center justify-between rounded-lg border border-line bg-canvas-sunken/40 px-4 py-3 transition hover:border-accent/40"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-ink">{thread.title}</div>
                        <div className="mt-1 text-xs text-ink-mute">
                          {thread.summary || "暂无摘要"}
                        </div>
                      </div>
                      <span className="mono-meta">{thread.evidence_count ?? 0} · ev</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="panel p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="eyebrow">REPORTS</div>
              <button className="text-xs text-accent" onClick={() => setNewReportOpen(true)}>
                ＋ 新建项目报告
              </button>
            </div>
            {filteredReports.length === 0 ? (
              <div className="text-sm text-ink-mute">这个项目还没有汇报。</div>
            ) : (
              <ul className="space-y-2">
                {filteredReports.map((report) => (
                  <li key={report.id}>
                    <Link
                      to={`/reports/${report.id}`}
                      className="block rounded-lg border border-line bg-canvas-sunken/40 px-4 py-3 transition hover:border-accent/40"
                    >
                      <div className="text-sm font-medium text-ink">{report.title}</div>
                      <div className="mt-1 text-xs text-ink-mute">
                        {report.period_label} · {report.status}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <aside className="space-y-6">
          <AttachmentPanel ownerType="project" ownerId={project.id} />

          <div className="panel p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="eyebrow">NOTES</div>
              <Link to={`/notes?project_id=${project.id}`} className="text-xs text-accent">
                去记事页 →
              </Link>
            </div>
            {filteredNotes.length === 0 ? (
              <div className="text-sm text-ink-mute">这个项目还没有挂靠记事。</div>
            ) : (
              <ul className="space-y-2">
                {filteredNotes.slice(0, 8).map((note) => (
                  <li key={note.id}>
                    <Link
                      to={`/notes?project_id=${project.id}&note_id=${note.id}`}
                      className="block rounded-lg border border-line bg-canvas-sunken/40 px-4 py-3 transition hover:border-accent/40"
                    >
                      <div className="truncate text-sm font-medium text-ink">
                        {note.title || "未命名笔记"}
                      </div>
                      <div className="mt-1 text-xs text-ink-mute">
                        {note.day}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="panel p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="eyebrow">TODOS</div>
              <Link to="/todos" className="text-xs text-accent">
                去待办页 →
              </Link>
            </div>
            {filteredTodos.length === 0 ? (
              <div className="text-sm text-ink-mute">这个项目还没有关联待办。</div>
            ) : (
              <ul className="space-y-2">
                {filteredTodos.slice(0, 8).map((todo) => (
                  <li key={todo.id}>
                    <Link
                      to="/todos"
                      className="block rounded-lg border border-line bg-canvas-sunken/40 px-4 py-3 transition hover:border-accent/40"
                    >
                      <div className="truncate text-sm font-medium text-ink">
                        {todoPreview(todo.text)}
                      </div>
                      <div className="mt-1 text-xs text-ink-mute">
                        {todo.thread_title || "未挂线程"}
                        {todo.due_date ? ` · 截止 ${todo.due_date}` : ""}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="panel p-5">
            <div className="mb-3 eyebrow">RECENT ACTIVITY</div>
            {filteredActivity.length === 0 ? (
              <div className="text-sm text-ink-mute">这个项目还没有最近活动。</div>
            ) : (
              <ul className="space-y-2">
                {filteredActivity.map((item) => (
                  <li key={item.id}>
                    <Link
                      to={item.to}
                      className="flex items-start justify-between gap-3 rounded-lg border border-line bg-canvas-sunken/40 px-4 py-3 transition hover:border-accent/40"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-ink">{item.title}</div>
                        <div className="mt-1 text-xs text-ink-mute">
                          {item.kind.toUpperCase()} · {item.meta}
                        </div>
                      </div>
                      <span className="mono-meta whitespace-nowrap">
                        {formatDateTime(item.ts, { withYear: false })}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="panel p-5">
      <div className="eyebrow">{label}</div>
      <div className="mt-3 font-display text-[28px] font-semibold text-ink">{value}</div>
    </div>
  );
}

function HealthChip({
  status,
}: {
  status: "healthy" | "active" | "blocked" | "quiet" | "reporting";
}) {
  const label = {
    healthy: "健康",
    active: "活跃",
    blocked: "阻塞",
    quiet: "沉默",
    reporting: "待汇报",
  }[status];
  const tone = {
    healthy: "chip-go",
    active: "chip-accent",
    blocked: "chip-stop",
    quiet: "chip-hold",
    reporting: "chip",
  }[status];
  return <span className={`chip ${tone}`}>{label}</span>;
}

function HealthMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "go" | "hold" | "stop" | "accent" | "muted";
}) {
  const color = {
    go: "text-signal-go",
    hold: "text-signal-hold",
    stop: "text-signal-stop",
    accent: "text-accent",
    muted: "text-ink-soft",
  }[tone];
  return (
    <div className="bg-canvas-raised px-5 py-4">
      <div className="eyebrow">{label}</div>
      <div className={`mt-2 font-display text-[26px] font-semibold ${color}`}>
        {value}
      </div>
    </div>
  );
}
