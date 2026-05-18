import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import clsx from "clsx";
import { api } from "@/lib/api";
import {
  AUDIENCE_LABEL,
  dateKey,
  formatDateTime,
  parseDateTime,
} from "@/lib/periods";
import { todoPreview } from "@/lib/richText";
import type {
  InboxItem,
  Note,
  ReportSummary,
  Thread,
  Todo,
} from "@/lib/types";

type TimelineKind = "thread" | "inbox" | "todo" | "note" | "report";
type FilterKey = TimelineKind | "all";

type TimelineItem = {
  id: string;
  kind: TimelineKind;
  ts: Date;
  rawTimestamp: string;
  title: string;
  body: string;
  meta: string;
  to: string;
};

const KIND_META: Record<
  TimelineKind,
  { label: string; tone: string; short: string }
> = {
  thread: { label: "工作线", tone: "text-accent", short: "THREAD" },
  inbox: { label: "收件箱", tone: "text-signal-go", short: "INBOX" },
  todo: { label: "待办", tone: "text-signal-hold", short: "TODO" },
  note: { label: "记事", tone: "text-ink-soft", short: "NOTE" },
  report: { label: "汇报", tone: "text-signal-stop", short: "REPORT" },
};

const FILTER_ORDER: FilterKey[] = [
  "all",
  "thread",
  "inbox",
  "todo",
  "note",
  "report",
];

function preview(md: string): string {
  return md.replace(/[#*_`>-]/g, "").trim().replace(/\s+/g, " ").slice(0, 72);
}

function toItem(
  kind: TimelineKind,
  id: string,
  rawTimestamp: string | null | undefined,
  fields: Omit<TimelineItem, "id" | "kind" | "ts" | "rawTimestamp">
): TimelineItem | null {
  const ts = parseDateTime(rawTimestamp);
  if (!ts || !rawTimestamp) return null;
  return { id: `${kind}:${id}`, kind, ts, rawTimestamp, ...fields };
}

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

export default function Timeline() {
  const [filter, setFilter] = useState<FilterKey>("all");

  const results = useQueries({
    queries: [
      { queryKey: ["threads"], queryFn: () => api.threads.list() },
      { queryKey: ["inbox"], queryFn: api.captures.inbox },
      { queryKey: ["todos"], queryFn: () => api.todos.list() },
      { queryKey: ["notes"], queryFn: () => api.notes.list() },
      { queryKey: ["reports"], queryFn: () => api.reports.list() },
    ],
  });
  const [threadsQ, inboxQ, todosQ, notesQ, reportsQ] = results;
  const isLoading = results.some((r) => r.isLoading);

  const threads = (threadsQ.data ?? []) as Thread[];
  const inbox = (inboxQ.data ?? []) as InboxItem[];
  const todos = (todosQ.data ?? []) as Todo[];
  const notes = (notesQ.data ?? []) as Note[];
  const reports = (reportsQ.data ?? []) as ReportSummary[];

  const items = useMemo(() => {
    const buf: TimelineItem[] = [];

    for (const t of threads) {
      const item = toItem("thread", t.id, t.last_active_at, {
        title: t.title,
        body: t.summary || "工作线有新动态",
        meta: `${t.project || "未分项目"} · ${t.evidence_count ?? 0} 条证据`,
        to: `/threads/${t.id}`,
      });
      if (item) buf.push(item);
    }

    for (const c of inbox) {
      const item = toItem("inbox", c.id, c.event_date || c.created_at, {
        title: c.text,
        body: `${c.category} · 待整理`,
        meta: c.source_title || "收件箱闪记",
        to: "/inbox",
      });
      if (item) buf.push(item);
    }

    for (const td of todos) {
      const item = toItem("todo", td.id, td.done_at || td.created_at, {
        title: todoPreview(td.text),
        body: td.done ? "待办已完成" : "待办创建/更新",
        meta: `${td.thread_title || "未挂线程"}${
          td.due_date
            ? ` · 截止 ${formatDateTime(td.due_date, { withYear: false })}`
            : ""
        }`,
        to: "/todos",
      });
      if (item) buf.push(item);
    }

    for (const n of notes) {
      const item = toItem("note", n.id, n.updated_at, {
        title: n.title.trim() || "未命名笔记",
        body: preview(n.body_md) || "笔记更新",
        meta: formatDateTime(n.day, { includeTime: false }),
        to: "/notes",
      });
      if (item) buf.push(item);
    }

    for (const r of reports) {
      const item = toItem("report", r.id, r.updated_at, {
        title: r.title,
        body: `${r.period_label} · ${AUDIENCE_LABEL[r.audience]}`,
        meta: r.status === "draft" ? "草稿更新" : "报告更新",
        to: `/reports/${r.id}`,
      });
      if (item) buf.push(item);
    }

    return buf.sort((a, b) => b.ts.getTime() - a.ts.getTime());
  }, [threads, inbox, todos, notes, reports]);

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = {
      all: items.length,
      thread: 0,
      inbox: 0,
      todo: 0,
      note: 0,
      report: 0,
    };
    for (const it of items) c[it.kind] += 1;
    return c;
  }, [items]);

  const filtered = useMemo(
    () => (filter === "all" ? items : items.filter((i) => i.kind === filter)),
    [items, filter]
  );

  const grouped = useMemo(() => {
    const map = new Map<string, TimelineItem[]>();
    for (const it of filtered) {
      const key = dateKey(it.rawTimestamp);
      const bucket = map.get(key) ?? [];
      bucket.push(it);
      map.set(key, bucket);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div className="mx-auto max-w-5xl px-10 py-10">
      <header className="mb-8 flex items-end justify-between gap-6">
        <div>
          <div className="eyebrow">TIMELINE</div>
          <h1 className="mt-2 font-display text-[32px] font-semibold leading-none tracking-tight">
            时间线
          </h1>
          <p className="mt-2 text-sm text-ink-soft">
            把工作线、闪记、待办、记事和汇报放回同一条时间轴上。
          </p>
        </div>
        <div className="chip">{filtered.length} 条记录</div>
      </header>

      <div className="mb-6 flex flex-wrap gap-1.5">
        {FILTER_ORDER.map((key) => {
          const label = key === "all" ? "全部" : KIND_META[key].label;
          const disabled = key !== "all" && counts[key] === 0;
          return (
            <button
              key={key}
              type="button"
              onClick={() => !disabled && setFilter(key)}
              className={clsx(
                "chip",
                disabled
                  ? "cursor-not-allowed opacity-40"
                  : "cursor-pointer",
                filter === key && "chip-accent"
              )}
            >
              {label}
              <span className="mono-meta ml-1 !text-[10px]">
                {counts[key]}
              </span>
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="panel p-12 text-center text-sm text-ink-mute">
          加载中…
        </div>
      ) : grouped.length === 0 ? (
        <div className="panel p-12 text-center text-sm text-ink-mute">
          {items.length === 0
            ? "还没有可展示的活动记录。"
            : "当前筛选下没有匹配项。"}
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
                            {formatDateTime(item.rawTimestamp, {
                              withYear: false,
                              includeTime: true,
                            })}
                          </div>
                          <div
                            className={clsx(
                              "mt-1 font-mono text-[10px] tracking-wider",
                              meta.tone
                            )}
                          >
                            {meta.short}
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-ink">
                            {item.title}
                          </div>
                          <div className="mt-1 line-clamp-2 text-sm text-ink-soft">
                            {item.body}
                          </div>
                          <div className="mt-2 mono-meta">{item.meta}</div>
                        </div>
                        <span className="text-ink-mute">→</span>
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
