import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { api } from "@/lib/api";
import StatusDot from "@/components/StatusDot";
import { CategoryChip } from "@/components/EvidenceChip";
import { useQuickCapture } from "@/lib/quickCapture";
import { isoWeekLabel, toISODate, formatDateTime } from "@/lib/periods";
import { todoPreview } from "@/lib/richText";

function yesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toISODate(d);
}

export default function Home() {
  const { open: openCapture } = useQuickCapture();
  const { data: threads = [], isLoading } = useQuery({
    queryKey: ["threads"],
    queryFn: () => api.threads.list(),
  });
  const { data: reports = [] } = useQuery({
    queryKey: ["reports"],
    queryFn: () => api.reports.list(),
  });
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: api.projects.list,
  });
  const { data: inbox = [] } = useQuery({
    queryKey: ["inbox"],
    queryFn: api.captures.inbox,
  });
  const { data: yesterday } = useQuery({
    queryKey: ["activity", yesterdayISO()],
    queryFn: () => api.activity.daily(yesterdayISO()),
  });

  const maxEv = Math.max(1, ...threads.map((t) => t.evidence_count ?? 0));
  const draftReport = reports.find((r) => r.status === "draft");
  const projectAlerts = projects
    .filter((project) =>
      ["blocked", "quiet", "reporting"].includes(project.health?.health_status ?? "")
    )
    .sort((a, b) => {
      const rank = { blocked: 0, quiet: 1, reporting: 2, active: 3, healthy: 4 };
      return (
        rank[a.health?.health_status ?? "healthy"] -
        rank[b.health?.health_status ?? "healthy"]
      );
    })
    .slice(0, 3);

  const today = new Date();
  const weekLabel = isoWeekLabel(today);
  const iso = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");

  const items: { text: string; to?: string }[] = [];
  if (inbox.length > 0) {
    items.push({ text: `${inbox.length} 条闪记待归线程`, to: "/inbox" });
  }
  if (draftReport) {
    items.push({
      text: `「${draftReport.period_label} 周报」草稿等你定稿`,
      to: `/reports/${draftReport.id}`,
    });
  } else {
    items.push({ text: "本周尚未起草周报", to: "/reports" });
  }
  const blocked = threads.filter((t) => t.status === "blocked");
  if (blocked.length > 0) {
    items.push({
      text: `${blocked.length} 条工作线处于阻塞`,
      to: "/threads",
    });
  }
  for (const project of projectAlerts) {
    items.push({
      text: `${project.name} · ${project.health?.next_action}`,
      to: `/projects/${project.id}`,
    });
  }
  if (items.length === 0) {
    items.push({ text: "收件箱干净，没有紧急需要关注的事。" });
  }

  return (
    <div className="mx-auto max-w-5xl px-10 py-12">
      <header className="mb-10 flex items-end justify-between gap-8">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="dot-pulse" />
            <span className="eyebrow">
              TODAY · {weekLabel}
            </span>
          </div>
          <h1 className="mt-4 font-display text-[44px] font-semibold leading-none tracking-tight">
            今日
          </h1>
          <p className="mt-3 max-w-md text-sm text-ink-soft">
            把这一刻的想法留下，系统会自动把它织进你的工作线。
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="mono-meta text-ink-soft">{iso}</div>
            <div className="mono-meta opacity-60">local · trace-api</div>
          </div>
          <button className="btn btn-accent" onClick={openCapture}>
            <span>＋</span>
            <span>写一笔</span>
            <span className="kbd ml-1 !border-accent-ink/15 !bg-accent-ink/10 !text-accent-ink">
              ⌘⇧N
            </span>
          </button>
        </div>
      </header>

      {/* Focus Queue */}
      <section className="panel mb-6 overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="eyebrow">FOCUS QUEUE</span>
            <span className="chip">{items.length}</span>
          </div>
          <span className="mono-meta">TAP TO OPEN ↗</span>
        </div>
        <ul>
          {items.map((it, i) =>
            it.to ? (
              <li key={i}>
                <Link
                  to={it.to}
                  className="group relative flex items-center gap-4 border-b border-line/60 px-5 py-3.5 text-sm text-ink transition last:border-b-0 hover:bg-canvas-contrast/50"
                >
                  <span className="absolute inset-y-0 left-0 w-px bg-accent/0 transition-all group-hover:w-[2px] group-hover:bg-accent" />
                  <span className="flex-1">{it.text}</span>
                  <span className="text-ink-mute transition group-hover:translate-x-0.5 group-hover:text-accent">
                    →
                  </span>
                </Link>
              </li>
            ) : (
              <li
                key={i}
                className="flex items-center gap-4 border-b border-line/60 px-5 py-3.5 text-sm text-ink-soft last:border-b-0"
              >
                <span className="flex-1">{it.text}</span>
              </li>
            )
          )}
        </ul>
      </section>

      {/* Yesterday Review */}
      {projects.length > 0 && (
        <section className="panel mb-6 overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <div className="flex items-center gap-2">
              <span className="eyebrow">PROJECT HEALTH</span>
              <span className="chip">{projects.length}</span>
            </div>
            <Link to="/projects" className="text-xs text-accent transition hover:brightness-125">
              项目 →
            </Link>
          </div>
          <div className="grid gap-px bg-line/50 sm:grid-cols-2 lg:grid-cols-4">
            {projects.slice(0, 4).map((project) => (
              <Link
                key={project.id}
                to={`/projects/${project.id}`}
                className="bg-canvas-raised px-5 py-4 transition hover:bg-canvas-contrast/40"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-ink">{project.name}</span>
                  <HealthChip status={project.health?.health_status ?? "healthy"} />
                </div>
                <p className="truncate text-xs text-ink-soft">
                  {project.health?.next_action ?? "暂无紧急动作"}
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <MiniStat label="证据" value={project.health?.week_evidence_count ?? 0} />
                  <MiniStat label="完成" value={project.health?.week_done_todo_count ?? 0} />
                  <MiniStat label="活跃" value={project.health?.week_active_thread_count ?? 0} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Yesterday Review */}
      {yesterday && (
        <section className="panel mb-6 overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <div className="flex items-center gap-2">
              <span className="eyebrow">YESTERDAY · {yesterday.date}</span>
              <span className="chip">
                {yesterday.capture_count} 条记录
                {yesterday.todo_done_count > 0 && ` · ${yesterday.todo_done_count} 项完成`}
              </span>
            </div>
            <Link
              to="/timeline"
              className="text-xs text-accent transition hover:brightness-125"
            >
              时间线 →
            </Link>
          </div>

          {yesterday.capture_count === 0 && yesterday.todo_done_count === 0 ? (
            <div className="px-5 py-6 text-center text-sm text-ink-mute">
              昨天没有活动记录。
            </div>
          ) : (
            <ul>
              {/* Evidence items */}
              {yesterday.evidence.map((ev) => (
                <li key={ev.id}>
                  <Link
                    to={ev.thread_id ? `/threads/${ev.thread_id}` : "/inbox"}
                    className="group relative flex items-start gap-3 border-b border-line/60 px-5 py-3 transition last:border-b-0 hover:bg-canvas-contrast/40"
                  >
                    <span className="absolute inset-y-0 left-0 w-px bg-accent/0 transition-all group-hover:w-[2px] group-hover:bg-accent" />
                    <CategoryChip category={ev.category} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink">{ev.text}</p>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-ink-mute">
                        {ev.thread_title && <span>{ev.thread_title}</span>}
                        {ev.thread_project && (
                          <>
                            <span className="opacity-40">·</span>
                            <span>{ev.thread_project}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <span className="mono-meta shrink-0 text-[10px]">
                      {formatDateTime(ev.event_date, { withYear: false, includeTime: true })}
                    </span>
                  </Link>
                </li>
              ))}

              {/* Completed todos */}
              {yesterday.completed_todos.map((td) => (
                <li
                  key={td.id}
                  className="flex items-center gap-3 border-b border-line/60 px-5 py-3 last:border-b-0"
                >
                  <span className="text-accent">✓</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink-soft line-through decoration-ink-mute/40">
                      {todoPreview(td.text)}
                    </p>
                    {td.thread_title && (
                      <div className="mt-0.5 text-[11px] text-ink-mute">
                        {td.thread_title}
                      </div>
                    )}
                  </div>
                  <span className="mono-meta shrink-0 text-[10px]">
                    {formatDateTime(td.done_at, { withYear: false, includeTime: true })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Threads · Activity */}
      <section className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="eyebrow">THREADS · ACTIVITY</span>
            <span className="chip">{threads.length}</span>
          </div>
          <Link
            to="/threads"
            className="text-xs text-accent transition hover:brightness-125"
          >
            查看全部 →
          </Link>
        </div>

        {isLoading ? (
          <div className="py-10 text-center text-sm text-ink-mute">加载中…</div>
        ) : threads.length === 0 ? (
          <div className="py-12 text-center text-sm text-ink-mute">
            空窗期。开一个新线程把事情串起来。
          </div>
        ) : (
          <ul>
            {threads.map((t) => {
              const pct = Math.max(
                4,
                Math.min(100, ((t.evidence_count ?? 0) / maxEv) * 100)
              );
              return (
                <li key={t.id}>
                  <Link
                    to={`/threads/${t.id}`}
                    className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 border-b border-line/60 px-5 py-4 transition last:border-b-0 hover:bg-canvas-contrast/40"
                  >
                    <StatusDot status={t.status} withLabel={false} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[15px] font-medium text-ink transition group-hover:text-accent">
                          {t.title}
                        </span>
                        {t.pinned && (
                          <span className="chip chip-accent">置顶</span>
                        )}
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <div className="relative h-1.5 flex-1 overflow-hidden rounded-pill bg-canvas-sunken">
                          <div
                            className={clsx(
                              "h-full rounded-pill transition-all duration-500",
                              t.status === "blocked"
                                ? "bg-signal-stop"
                                : "bg-accent"
                            )}
                            style={{
                              width: `${pct}%`,
                              boxShadow:
                                t.status === "blocked"
                                  ? "0 0 12px rgba(255,107,107,0.45)"
                                  : "0 0 12px rgba(94,230,197,0.5)",
                            }}
                          />
                        </div>
                        <span className="mono-meta whitespace-nowrap">
                          {String(t.evidence_count ?? 0).padStart(2, "0")} · ev
                        </span>
                      </div>
                    </div>
                    <span className="text-ink-mute transition group-hover:translate-x-0.5 group-hover:text-accent">
                      →
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
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
  return <span className={clsx("chip", tone)}>{label}</span>;
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-canvas-sunken/70 px-2 py-1.5">
      <div className="mono-meta text-[10px]">{label}</div>
      <div className="text-sm font-semibold text-ink">{value}</div>
    </div>
  );
}
