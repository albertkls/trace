import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { api } from "@/lib/api";
import StatusDot from "@/components/StatusDot";
import Skeleton from "@/components/Skeleton";
import { CategoryChip } from "@/components/EvidenceChip";
import { useQuickCapture } from "@/lib/quickCapture";
import { isoWeekLabel, toISODate } from "@/lib/periods";
import { todoPreview } from "@/lib/richText";
import type { Project, Thread } from "@/lib/types";

function yesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toISODate(d);
}

export default function Home() {
  const { open: openCapture } = useQuickCapture();
  const { data: threads = [], isLoading } = useQuery({
    queryKey: ["threads"],
    queryFn: (): Promise<Thread[]> => api.threads.list().then((r) => r.items),
  });
  const { data: reports = [] } = useQuery({
    queryKey: ["reports"],
    queryFn: () => api.reports.list(),
  });
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: (): Promise<Project[]> => api.projects.list().then((r) => r.items),
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
        rank[a.health?.health_status ?? "healthy"] - rank[b.health?.health_status ?? "healthy"]
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
    <div className="mx-auto max-w-6xl px-10 py-10">
      <header className="mb-8 flex items-start justify-between gap-8">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="dot-pulse" />
            <span className="eyebrow">TODAY DESK · {weekLabel}</span>
          </div>
          <h1 className="mt-3 font-display text-[36px] font-semibold leading-tight">今日</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-ink-soft">
            一个清晰的工作台：先处理收件箱，再看项目健康，最后把新的线索写进系统。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-line bg-canvas-raised/65 px-3 py-2 text-right">
            <div className="mono-meta text-ink-soft">{iso}</div>
            <div className="mono-meta opacity-70">local · trace-api</div>
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

      <section className="mb-6 grid gap-3 md:grid-cols-4">
        <MetricTile
          label="收件箱"
          value={inbox.length}
          tone={inbox.length > 0 ? "accent" : "muted"}
        />
        <MetricTile label="工作线" value={threads.length} tone="neutral" />
        <MetricTile label="项目" value={projects.length} tone="iris" />
        <MetricTile
          label="阻塞"
          value={blocked.length}
          tone={blocked.length > 0 ? "stop" : "muted"}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section className="panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <div className="flex items-center gap-2">
                <span className="eyebrow">FOCUS QUEUE</span>
                <span className="chip">{items.length}</span>
              </div>
              <span className="mono-meta">OPEN NEXT</span>
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
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-line bg-canvas-sunken text-[11px] text-ink-mute">
                        {String(i + 1).padStart(2, "0")}
                      </span>
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
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-line bg-canvas-sunken text-[11px] text-ink-mute">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="flex-1">{it.text}</span>
                  </li>
                )
              )}
            </ul>
          </section>

          <section className="panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <div className="flex items-center gap-2">
                <span className="eyebrow">THREADS · ACTIVITY</span>
                <span className="chip">{threads.length}</span>
              </div>
              <Link to="/threads" className="text-xs text-accent transition hover:brightness-125">
                查看全部 →
              </Link>
            </div>

            {isLoading ? (
              <div className="space-y-3 px-5 py-4">
                <Skeleton variant="text" count={5} />
              </div>
            ) : threads.length === 0 ? (
              <div className="py-12 text-center text-sm text-ink-mute">
                空窗期。开一个新线程把事情串起来。
              </div>
            ) : (
              <ul>
                {threads.map((t) => {
                  const pct = Math.max(4, Math.min(100, ((t.evidence_count ?? 0) / maxEv) * 100));
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
                            {t.pinned && <span className="chip chip-accent">置顶</span>}
                          </div>
                          <div className="mt-2 flex items-center gap-3">
                            <div className="relative h-1.5 flex-1 overflow-hidden rounded bg-canvas-sunken">
                              <div
                                className={clsx(
                                  "h-full rounded transition-all duration-500",
                                  t.status === "blocked" ? "bg-signal-stop" : "bg-accent"
                                )}
                                style={{ width: `${pct}%` }}
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

        <div className="space-y-6">
          {projects.length > 0 && (
            <section className="panel overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-5 py-3">
                <div className="flex items-center gap-2">
                  <span className="eyebrow">PROJECT HEALTH</span>
                  <span className="chip">{projects.length}</span>
                </div>
                <Link
                  to="/projects"
                  className="text-xs text-accent transition hover:brightness-125"
                >
                  项目 →
                </Link>
              </div>
              <div className="divide-y divide-line/60">
                {projects.slice(0, 4).map((project) => (
                  <Link
                    key={project.id}
                    to={`/projects/${project.id}`}
                    className="block px-5 py-4 transition hover:bg-canvas-contrast/40"
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
                      <MiniStat
                        label="活跃"
                        value={project.health?.week_active_thread_count ?? 0}
                      />
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {yesterday && (
            <section className="panel overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-5 py-3">
                <div className="flex items-center gap-2">
                  <span className="eyebrow">YESTERDAY</span>
                  <span className="chip">
                    {yesterday.capture_count}
                    {yesterday.todo_done_count > 0 && ` / ${yesterday.todo_done_count}`}
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
                  {yesterday.evidence.slice(0, 5).map((ev) => (
                    <li key={ev.id}>
                      <Link
                        to={ev.thread_id ? `/threads/${ev.thread_id}` : "/inbox"}
                        className="group relative flex items-start gap-3 border-b border-line/60 px-5 py-3 transition last:border-b-0 hover:bg-canvas-contrast/40"
                      >
                        <CategoryChip category={ev.category} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-ink">{ev.text}</p>
                          <div className="mt-1 flex items-center gap-2 text-[11px] text-ink-mute">
                            {ev.thread_title && <span className="truncate">{ev.thread_title}</span>}
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                  {yesterday.completed_todos.slice(0, 3).map((td) => (
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
                          <div className="mt-0.5 truncate text-[11px] text-ink-mute">
                            {td.thread_title}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>
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

function MetricTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "accent" | "iris" | "stop" | "muted";
}) {
  const toneClass = {
    neutral: "border-line bg-canvas-raised/70",
    accent: "border-accent/35 bg-accent/10",
    iris: "border-iris/35 bg-iris/10",
    stop: "border-signal-stop/35 bg-signal-stop/10",
    muted: "border-line bg-canvas-raised/45",
  }[tone];

  const valueClass = {
    neutral: "text-ink",
    accent: "text-accent",
    iris: "text-iris",
    stop: "text-signal-stop",
    muted: "text-ink-mute",
  }[tone];

  return (
    <div className={clsx("rounded-lg border px-4 py-3 shadow-chip", toneClass)}>
      <div className="eyebrow text-[9px]">{label}</div>
      <div className={clsx("mt-2 font-display text-[26px] font-semibold leading-none", valueClass)}>
        {value}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-canvas-sunken/70 px-2 py-1.5">
      <div className="mono-meta text-[10px]">{label}</div>
      <div className="text-sm font-semibold text-ink">{value}</div>
    </div>
  );
}
