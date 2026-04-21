import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { api } from "@/lib/api";
import { AUDIENCE_LABEL, dateKey, formatDateTime, parseDateTime } from "@/lib/periods";

type TimelineKind = "evidence" | "thread" | "todo" | "note" | "report";
type FilterKey = TimelineKind | "all";

type TimelineItem = {
  id: string;
  kind: TimelineKind;
  ts: string;
  title: string;
  body: string;
  meta: string;
  to: string;
};

const KIND_META: Record<TimelineKind, { label: string; tone: string; short: string }> = {
  evidence: { label: "证据", tone: "text-signal-go", short: "EVID" },
  thread: { label: "线程", tone: "text-accent", short: "THRD" },
  todo: { label: "待办", tone: "text-signal-hold", short: "TODO" },
  note: { label: "记事", tone: "text-ink-soft", short: "NOTE" },
  report: { label: "汇报", tone: "text-signal-stop", short: "RPT" },
};

const FILTER_ORDER: FilterKey[] = ["all", "evidence", "thread", "todo", "note", "report"];

function dayLabel(key: string): string {
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (key === todayKey) return "今天";
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  const yKey = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`;
  if (key === yKey) return "昨天";
  return formatDateTime(key, { includeTime: false });
}

export default function ProjectTimeline() {
  const { id = "" } = useParams();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");

  const { data: project, isLoading } = useQuery({
    queryKey: ["project", id],
    queryFn: () => api.projects.get(id),
    enabled: !!id,
  });

  const items = useMemo(() => {
    if (!project) return [];
    const rows: TimelineItem[] = [
      ...project.evidence.map((evidence) => ({
        id: `evidence:${evidence.id}`,
        kind: "evidence" as const,
        ts: evidence.event_date || evidence.created_at,
        title: evidence.text,
        body: evidence.thread_title || "未挂线程",
        meta: `${evidence.category} · ${evidence.thread_project || "未分项目"}`,
        to: evidence.thread_id ? `/threads/${evidence.thread_id}` : "/inbox",
      })),
      ...project.threads.map((thread) => ({
        id: `thread:${thread.id}`,
        kind: "thread" as const,
        ts: thread.last_active_at,
        title: thread.title,
        body: thread.summary || "工作线有更新",
        meta: `${thread.evidence_count ?? 0} 条证据`,
        to: `/threads/${thread.id}`,
      })),
      ...project.todos.map((todo) => ({
        id: `todo:${todo.id}`,
        kind: "todo" as const,
        ts: todo.done_at || todo.created_at,
        title: todo.text,
        body: todo.done ? "待办已完成" : "待办创建/更新",
        meta: `${todo.thread_title || "未挂线程"}${todo.due_date ? ` · 截止 ${todo.due_date}` : ""}`,
        to: "/todos",
      })),
      ...project.notes.map((note) => ({
        id: `note:${note.id}`,
        kind: "note" as const,
        ts: note.updated_at,
        title: note.title || "未命名笔记",
        body: note.body_md || "笔记更新",
        meta: note.day,
        to: `/notes?project_id=${project.id}&note_id=${note.id}`,
      })),
      ...project.reports.map((report) => ({
        id: `report:${report.id}`,
        kind: "report" as const,
        ts: report.updated_at,
        title: report.title,
        body: `${report.period_label} · ${AUDIENCE_LABEL[report.audience]}`,
        meta: report.status,
        to: `/reports/${report.id}`,
      })),
    ];

    return rows
      .filter((row) => !!parseDateTime(row.ts))
      .sort((a, b) => (parseDateTime(b.ts)?.getTime() ?? 0) - (parseDateTime(a.ts)?.getTime() ?? 0));
  }, [project]);

  const counts = useMemo(() => {
    const bucket: Record<FilterKey, number> = {
      all: items.length,
      evidence: 0,
      thread: 0,
      todo: 0,
      note: 0,
      report: 0,
    };
    for (const item of items) bucket[item.kind] += 1;
    return bucket;
  }, [items]);

  const searchText = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    const scoped = filter === "all" ? items : items.filter((item) => item.kind === filter);
    if (!searchText) return scoped;
    return scoped.filter(
      (item) =>
        item.title.toLowerCase().includes(searchText) ||
        item.body.toLowerCase().includes(searchText) ||
        item.meta.toLowerCase().includes(searchText)
    );
  }, [filter, items, searchText]);

  const grouped = useMemo(() => {
    const map = new Map<string, TimelineItem[]>();
    for (const item of filtered) {
      const key = dateKey(item.ts);
      const bucket = map.get(key) ?? [];
      bucket.push(item);
      map.set(key, bucket);
    }
    return Array.from(map.entries());
  }, [filtered]);

  if (isLoading || !project) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-mute">
        加载项目时间线…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-10 py-10">
      <header className="mb-8 flex items-end justify-between gap-6">
        <div>
          <Link to={`/projects/${project.id}`} className="text-xs text-ink-mute transition hover:text-accent">
            ← {project.name}
          </Link>
          <div className="eyebrow mt-3">PROJECT TIMELINE</div>
          <h1 className="mt-2 font-display text-[32px] font-semibold leading-none tracking-tight">
            项目时间线
          </h1>
          <p className="mt-2 text-sm text-ink-soft">
            把项目下的证据、线程、待办、记事和汇报放回同一条时间轴上。
          </p>
        </div>
        <div className="chip">{filtered.length} 条记录</div>
      </header>

      <div className="mb-6">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索当前项目时间线…"
          className="input w-full"
        />
      </div>

      <div className="mb-6 flex flex-wrap gap-1.5">
        {FILTER_ORDER.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={clsx("chip cursor-pointer", filter === key && "chip-accent")}
          >
            {key === "all" ? "全部" : KIND_META[key].label}
            <span className="mono-meta ml-1 !text-[10px]">{counts[key]}</span>
          </button>
        ))}
      </div>

      {grouped.length === 0 ? (
        <div className="panel p-12 text-center text-sm text-ink-mute">
          当前筛选条件下没有匹配活动。
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map(([day, dayItems]) => (
            <section key={day}>
              <div className="mb-3 flex items-center gap-3">
                <span className="eyebrow">{dayLabel(day)}</span>
                <span className="h-px flex-1 bg-line" />
                <span className="mono-meta">{dayItems.length}</span>
              </div>
              <ol className="space-y-2">
                {dayItems.map((item) => {
                  const meta = KIND_META[item.kind];
                  return (
                    <li key={item.id}>
                      <Link
                        to={item.to}
                        className="panel flex items-start gap-4 p-4 transition hover:border-accent/40 hover:bg-canvas-contrast/30"
                      >
                        <div className="min-w-[88px] text-right">
                          <div className="mono-meta">
                            {formatDateTime(item.ts, { withYear: false })}
                          </div>
                          <div className={clsx("mt-1 text-[11px]", meta.tone)}>{meta.short}</div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-ink">{item.title}</div>
                          <div className="mt-1 text-sm text-ink-soft">{item.body}</div>
                          <div className="mt-2 text-xs text-ink-mute">{item.meta}</div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
