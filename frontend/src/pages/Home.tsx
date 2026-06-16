import { useMemo, useState, useEffect, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import {
  AlertCircle,
  Bot,
  Check,
  ChevronRight,
  GitBranch,
  Inbox,
  LayoutDashboard,
  ListChecks,
  Plus,
  Radar,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Skeleton from "@/components/Skeleton";
import StatusDot from "@/components/StatusDot";
import NewThreadModal from "@/components/NewThreadModal";
import { api } from "@/lib/api";
import { isoWeekLabel, toISODate } from "@/lib/periods";
import { useQuickCapture } from "@/lib/quickCapture";
import type {
  Thread,
  TodoInput,
  TodoPatch,
  WorkbenchFocusItem,
  WorkbenchMetric,
  WorkbenchOverview,
  WorkbenchPlanItem,
  WorkbenchThreadPickerItem,
  WorkbenchWorklineColumn,
  WorkbenchSummaryLine,
} from "@/lib/types";

const METRIC_ICONS: Record<WorkbenchMetric["id"], LucideIcon> = {
  pending: Inbox,
  active_threads: GitBranch,
  projects: LayoutDashboard,
  blocked: ShieldAlert,
};

export default function Home() {
  const { open: openCapture } = useQuickCapture();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [newThreadOpen, setNewThreadOpen] = useState(false);
  const today = useMemo(() => new Date(), []);
  const iso = toISODate(today);

  const {
    data: overview,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["workbench", iso],
    queryFn: (): Promise<WorkbenchOverview> => api.workbench.overview(iso),
  });

  const invalidateWorkbenchData = () => {
    queryClient.invalidateQueries({ queryKey: ["workbench"] });
    queryClient.invalidateQueries({ queryKey: ["todos"] });
    queryClient.invalidateQueries({ queryKey: ["threads"] });
    queryClient.invalidateQueries({ queryKey: ["projects"] });
    queryClient.invalidateQueries({ queryKey: ["inbox"] });
  };

  const createTimelineTodo = useMutation({
    mutationFn: (body: TodoInput) => api.todos.create(body),
    onSuccess: invalidateWorkbenchData,
  });

  const updateTimelineTodo = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TodoPatch }) => api.todos.patch(id, patch),
    onSuccess: invalidateWorkbenchData,
  });

  const removeTimelineTodo = useMutation({
    mutationFn: (id: string) => api.todos.remove(id),
    onSuccess: invalidateWorkbenchData,
  });

  const weekLabel = overview?.week_label ?? isoWeekLabel(today);
  const busy =
    createTimelineTodo.isPending ||
    updateTimelineTodo.isPending ||
    removeTimelineTodo.isPending;

  return (
    <div className="workbench-page pm-workbench-page">
      <NewThreadModal
        open={newThreadOpen}
        onClose={() => setNewThreadOpen(false)}
        onCreated={(thread: Thread) => {
          setNewThreadOpen(false);
          invalidateWorkbenchData();
          navigate(`/threads/${thread.id}`);
        }}
      />

      <div className="pm-workbench-container mx-auto w-full max-w-[1500px] px-4 py-4 lg:px-5">
        <header className="pm-workbench-header mb-4">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="dot-pulse" />
              <span className="eyebrow">工作台 · {weekLabel}</span>
              <span className="chip chip-go">个人推进系统</span>
            </div>
            <div>
              <h1 className="font-display text-[30px] font-semibold leading-tight text-ink">
                今天要推进什么？
              </h1>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-soft">
                用一个清晰的工作台统筹待办、工作线、项目状态和周报素材，先处理最重要的下一步。
              </p>
            </div>
          </div>
          <div className="pm-workbench-actions">
            <button type="button" className="btn btn-accent" aria-label="在工作台写一笔" onClick={openCapture}>
              <Plus size={15} />
              写一笔
            </button>
          </div>
        </header>

        {isError ? (
          <WorkbenchError
            message={error instanceof Error ? error.message : "工作台加载失败"}
            onRetry={() => refetch()}
          />
        ) : isLoading && !overview ? (
          <WorkbenchLoading />
        ) : overview ? (
          <>
            <section className="pm-metric-grid mb-4" aria-label="工作台概览">
              {overview.metrics.map((metric) => (
                <SignalTile key={metric.id} metric={metric} />
              ))}
            </section>

            <section className="pm-command-grid mb-4">
              <TodayFocusPanel items={overview.focus_items} />
              <WorklineBoardPanel
                columns={overview.workline_columns}
                loading={isLoading}
                onCreateThread={() => setNewThreadOpen(true)}
              />
              <WorkbenchSummaryPanel lines={overview.summary} />
            </section>

            <WorkPlannerPanel
              overview={overview}
              iso={iso}
              onCreateThread={() => setNewThreadOpen(true)}
              onCreateItem={(body) => createTimelineTodo.mutateAsync(body)}
              onUpdateItem={(id, patch) => updateTimelineTodo.mutateAsync({ id, patch })}
              onRemoveItem={(id) => removeTimelineTodo.mutateAsync(id)}
              busy={busy}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

function WorkbenchLoading() {
  return (
    <div className="space-y-4">
      <section className="pm-metric-grid" aria-label="工作台概览加载中">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="rounded-lg border border-line bg-canvas-raised/45 px-4 py-3 shadow-chip">
            <Skeleton variant="text" count={2} />
          </div>
        ))}
      </section>
      <section className="pm-command-grid">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="workbench-panel p-4">
            <Skeleton variant="text" count={6} />
          </div>
        ))}
      </section>
    </div>
  );
}

function WorkbenchError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="workbench-panel flex items-start gap-3 p-5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-signal-stop/35 bg-signal-stop/10 text-signal-stop">
        <AlertCircle size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-ink">工作台暂时无法加载</div>
        <p className="mt-1 break-words text-sm leading-6 text-ink-soft">{message}</p>
        <button type="button" className="btn mt-3" onClick={onRetry}>
          重新加载
        </button>
      </div>
    </section>
  );
}

function TodayFocusPanel({ items }: { items: WorkbenchFocusItem[] }) {
  return (
    <WorkbenchPanel
      icon={Radar}
      title="今日推进"
      meta={`${items.length} 个动作`}
      action={
        <Link to="/todos" className="text-xs text-accent hover:brightness-125">
          待办
        </Link>
      }
      className="pm-focus-panel"
    >
      <div className="px-4 py-4">
        <div className="divide-y divide-line/60 rounded-lg border border-line/70 bg-canvas-raised/55">
          {items.map((item, index) => (
            <ActionRow
              key={item.id}
              index={index + 1}
              label={item.label}
              detail={item.detail}
              to={item.to}
              tone={item.tone}
            />
          ))}
        </div>
      </div>
    </WorkbenchPanel>
  );
}

function WorklineBoardPanel({
  columns,
  loading,
  onCreateThread,
}: {
  columns: WorkbenchWorklineColumn[];
  loading: boolean;
  onCreateThread: () => void;
}) {
  const total = columns.reduce((sum, column) => sum + column.count, 0);
  return (
    <WorkbenchPanel
      icon={GitBranch}
      title="工作线看板"
      meta={`${total} 条工作线`}
      action={
        <button type="button" className="btn btn-ghost !px-2 !py-1 text-xs" onClick={onCreateThread}>
          <Plus size={13} />
          新建
        </button>
      }
      className="pm-board-panel"
    >
      {loading ? (
        <div className="p-4">
          <Skeleton variant="text" count={5} />
        </div>
      ) : total === 0 ? (
        <button type="button" className="pm-empty-board" onClick={onCreateThread}>
          <Plus size={16} />
          创建第一条工作线
        </button>
      ) : (
        <div className="pm-board-columns">
          {columns.map((column) => (
            <div key={column.id} className={clsx("pm-board-column", `pm-board-column-${column.id}`)}>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-ink">{column.title}</span>
                <span className="mono-meta">{column.count}</span>
              </div>
              <div className="space-y-2">
                {column.items.map((thread) => (
                  <Link key={thread.id} to={`/threads/${thread.id}`} className="pm-thread-card">
                    <div className="mb-2 flex items-center gap-2">
                      <StatusDot status={thread.status} withLabel={false} />
                      <span className="truncate text-sm font-medium text-ink">{thread.title}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[11px] text-ink-mute">
                      <span className="truncate">{thread.project || "未归项目"}</span>
                      <span>{thread.evidence_count ?? 0} 证据</span>
                    </div>
                  </Link>
                ))}
                {column.items.length === 0 && <div className="pm-board-empty-column">暂无</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </WorkbenchPanel>
  );
}

function WorkbenchSummaryPanel({ lines }: { lines: WorkbenchSummaryLine[] }) {
  return (
    <WorkbenchPanel
      icon={Bot}
      title="今日简报"
      meta="summary"
      action={
        <Link className="text-xs text-accent hover:brightness-125" to="/reports">
          周报
        </Link>
      }
      className="pm-summary-panel"
    >
      <div className="space-y-3 px-4 py-4">
        {lines.map((line) => (
          <SynthesisLine key={line.id} label={line.label} text={line.text} tone={line.tone} />
        ))}
      </div>
    </WorkbenchPanel>
  );
}

function WorkPlannerPanel({
  overview,
  iso,
  onCreateThread,
  onCreateItem,
  onUpdateItem,
  onRemoveItem,
  busy,
}: {
  overview: WorkbenchOverview;
  iso: string;
  onCreateThread: () => void;
  onCreateItem: (body: TodoInput) => Promise<unknown>;
  onUpdateItem: (id: string, patch: TodoPatch) => Promise<unknown>;
  onRemoveItem: (id: string) => Promise<unknown>;
  busy: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const selectedItem = editingId
    ? overview.week_plan.items.find((item) => item.id === editingId) ?? null
    : null;
  const openCreate = () => {
    setEditingId(null);
    setCreating(true);
  };
  const openEdit = (id: string) => {
    setCreating(false);
    setEditingId(id);
  };
  const closeEditor = () => {
    setCreating(false);
    setEditingId(null);
  };

  return (
    <section className="pm-planner-panel mb-4">
      <div className="pm-panel-header">
        <div>
          <div className="eyebrow">WEEK PLAN</div>
          <h2 className="mt-1 text-base font-semibold text-ink">本周计划</h2>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="chip">{overview.week_plan.due_today_count} 今日到期</span>
          <span className="chip">{overview.week_plan.unplanned_count} 未排期</span>
          <button type="button" className="btn btn-ghost !px-2 !py-1 text-xs" onClick={onCreateThread}>
            <Plus size={13} />
            新建工作线
          </button>
          <button type="button" className="btn btn-accent !px-2 !py-1 text-xs" onClick={openCreate}>
            <Plus size={13} />
            新建任务
          </button>
        </div>
      </div>

      <div className="pm-week-strip" aria-label="未来七天任务密度">
        {overview.week_plan.days.map((day) => (
          <div key={day.date} className={clsx("pm-week-day", day.is_today && "pm-week-day-today")}>
            <div className="text-xs font-semibold text-ink">{day.day}</div>
            <div className="mono-meta mt-1 text-[10px]">{day.weekday}</div>
            <div className="mt-2 text-[11px] text-ink-mute">{day.count} 项</div>
          </div>
        ))}
      </div>

      <div className="pm-plan-layout">
        <div className="pm-task-list">
          {overview.week_plan.items.length === 0 ? (
            <button type="button" className="pm-empty-task" onClick={openCreate}>
              <Plus size={16} />
              添加第一条任务
            </button>
          ) : (
            overview.week_plan.items.map((item) => (
              <button
                type="button"
                key={item.id}
                aria-label={`编辑任务：${item.label}`}
                className={clsx("pm-task-row", `tone-${item.tone}`)}
                onClick={() => openEdit(item.id)}
              >
                <span className="pm-task-status" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{item.label}</span>
                  <span className="mt-1 block truncate text-xs text-ink-mute">
                    {item.due_date ?? "未排期"}
                    {item.thread_title ? ` · ${item.thread_title}` : ""}
                  </span>
                </span>
                <ChevronRight size={15} className="text-ink-mute" />
              </button>
            ))
          )}
        </div>

        <aside className="pm-thread-rail">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-ink">活跃工作线</div>
            <Link to="/threads" className="text-xs text-accent hover:brightness-125">
              全部
            </Link>
          </div>
          <div className="space-y-2">
            {overview.threads_for_picker.slice(0, 5).map((thread) => (
              <Link key={thread.id} to={`/threads/${thread.id}`} className="pm-thread-pill">
                <StatusDot status={thread.status} withLabel={false} />
                <span className="min-w-0 flex-1 truncate">{thread.title}</span>
                <span className="mono-meta truncate">{thread.project || "未归项目"}</span>
              </Link>
            ))}
            {overview.threads_for_picker.length === 0 && (
              <button type="button" className="pm-thread-pill justify-center text-ink-mute" onClick={onCreateThread}>
                <Plus size={14} />
                新建第一条工作线
              </button>
            )}
          </div>
        </aside>
      </div>

      {(creating || selectedItem) && (
        <TimelineItemEditor
          item={selectedItem}
          threads={overview.threads_for_picker}
          iso={iso}
          busy={busy}
          onCancel={closeEditor}
          onCreate={async (body) => {
            await onCreateItem(body);
            closeEditor();
          }}
          onUpdate={async (id, patch) => {
            await onUpdateItem(id, patch);
            closeEditor();
          }}
          onRemove={async (id) => {
            await onRemoveItem(id);
            closeEditor();
          }}
        />
      )}
    </section>
  );
}

function TimelineItemEditor({
  item,
  threads,
  iso,
  busy,
  onCancel,
  onCreate,
  onUpdate,
  onRemove,
}: {
  item: WorkbenchPlanItem | null;
  threads: WorkbenchThreadPickerItem[];
  iso: string;
  busy: boolean;
  onCancel: () => void;
  onCreate: (body: TodoInput) => Promise<unknown>;
  onUpdate: (id: string, patch: TodoPatch) => Promise<unknown>;
  onRemove: (id: string) => Promise<unknown>;
}) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(iso);
  const [threadId, setThreadId] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(item?.text ?? "");
    setDueDate(item?.due_date ?? iso);
    setThreadId(item?.thread_id ?? "");
    setDone(false);
    setError(null);
  }, [item, iso]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle) {
      setError("标题不能为空");
      return;
    }
    setError(null);
    try {
      if (item) {
        await onUpdate(item.id, {
          text: nextTitle,
          done,
          ...(dueDate ? { due_date: dueDate } : { clear_due_date: true }),
          ...(threadId ? { thread_id: threadId } : { clear_thread: true }),
        });
      } else {
        await onCreate({
          text: nextTitle,
          due_date: dueDate || null,
          thread_id: threadId || null,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    }
  };

  const handleRemove = async () => {
    if (!item) return;
    if (!window.confirm("删除这个任务？")) return;
    setError(null);
    try {
      await onRemove(item.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    }
  };

  return (
    <form className="pm-task-editor" onSubmit={handleSubmit}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-ink">{item ? "编辑任务" : "新建任务"}</div>
          <div className="mono-meta mt-1 text-[10px]">
            {item ? "同步到待办列表" : "创建后会出现在今日任务和本周计划"}
          </div>
        </div>
        <button type="button" className="btn-icon !h-7 !w-7" onClick={onCancel} aria-label="关闭任务编辑">
          <X size={14} />
        </button>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_9rem_11rem]">
        <label className="block">
          <span className="mb-1.5 block text-xs text-ink-soft">任务标题</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="input"
            placeholder="例如：组件库验收"
            autoFocus
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs text-ink-soft">日期</span>
          <input
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            className="input"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs text-ink-soft">关联工作线</span>
          <select value={threadId} onChange={(event) => setThreadId(event.target.value)} className="input">
            <option value="">不关联</option>
            {threads.map((thread) => (
              <option key={thread.id} value={thread.id}>
                {thread.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {item && (
          <label className="chip cursor-pointer gap-2">
            <input
              type="checkbox"
              checked={done}
              onChange={(event) => setDone(event.target.checked)}
              className="accent-[rgb(var(--color-accent))]"
            />
            标记完成
          </label>
        )}
        {item?.thread_id && (
          <Link className="btn btn-ghost !px-2 !py-1 text-xs" to={`/threads/${item.thread_id}`}>
            <GitBranch size={13} />
            打开工作线
          </Link>
        )}
        <Link className="btn btn-ghost !px-2 !py-1 text-xs" to="/todos">
          <ListChecks size={13} />
          待办列表
        </Link>
        <div className="ml-auto flex items-center gap-2">
          {item && (
            <button
              type="button"
              className="btn btn-ghost !px-2 !py-1 text-xs text-signal-stop hover:!bg-signal-stop/10"
              onClick={handleRemove}
              disabled={busy}
            >
              <Trash2 size={13} />
              删除
            </button>
          )}
          <button type="button" className="btn btn-ghost !px-2 !py-1 text-xs" onClick={onCancel} disabled={busy}>
            取消
          </button>
          <button type="submit" className="btn btn-accent !px-2 !py-1 text-xs" disabled={busy || !title.trim()}>
            {item ? <Check size={13} /> : <Plus size={13} />}
            保存任务
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-signal-stop/40 bg-signal-stop/10 px-3 py-2 text-xs text-signal-stop">
          {error}
        </div>
      )}
    </form>
  );
}

function WorkbenchPanel({
  icon: Icon,
  title,
  meta,
  action,
  className,
  children,
}: {
  icon: LucideIcon;
  title: string;
  meta?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={clsx("workbench-panel h-full overflow-hidden", className)}>
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md border border-accent/30 bg-accent/10 text-accent">
            <Icon size={15} />
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-ink">{title}</div>
            {meta && <div className="mono-meta mt-0.5 text-[10px]">{meta}</div>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function ActionRow({
  index,
  label,
  detail,
  to,
  tone,
}: {
  index: number;
  label: string;
  detail: string;
  to: string | null;
  tone: "accent" | "warn" | "stop";
}) {
  const content = (
    <>
      <span
        className={clsx(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border font-mono text-[11px]",
          tone === "stop"
            ? "border-signal-stop/35 bg-signal-stop/10 text-signal-stop"
            : tone === "warn"
              ? "border-signal-hold/35 bg-signal-hold/10 text-signal-hold"
              : "border-accent/35 bg-accent/10 text-accent"
        )}
      >
        {String(index).padStart(2, "0")}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">{label}</span>
        <span className="mt-0.5 block truncate text-xs text-ink-mute">{detail}</span>
      </span>
      {to && <ChevronRight size={15} className="text-ink-mute" />}
    </>
  );
  const className =
    "group flex items-center gap-3 px-4 py-3 text-left transition hover:bg-canvas-contrast/45";
  if (!to) return <div className={className}>{content}</div>;
  return (
    <Link to={to} className={className}>
      {content}
    </Link>
  );
}

function SignalTile({ metric }: { metric: WorkbenchMetric }) {
  const Icon = METRIC_ICONS[metric.id];
  const toneClass = {
    neutral: "border-line bg-canvas-raised/45 text-ink",
    accent: "border-accent/35 bg-accent/10 text-accent",
    iris: "border-iris/35 bg-iris/10 text-iris",
    warn: "border-signal-hold/35 bg-signal-hold/10 text-signal-hold",
    stop: "border-signal-stop/35 bg-signal-stop/10 text-signal-stop",
  }[metric.tone];
  return (
    <div className={clsx("rounded-lg border px-4 py-3 shadow-chip", toneClass)}>
      <div className="flex items-center justify-between">
        <span className="eyebrow text-[9px]">{metric.label}</span>
        <Icon size={15} />
      </div>
      <div className="mt-3 font-display text-[28px] font-semibold leading-none">{metric.value}</div>
      <div className="mt-2 truncate text-xs opacity-75">{metric.detail}</div>
    </div>
  );
}

function SynthesisLine({
  label,
  text,
  tone,
}: {
  label: string;
  text: string;
  tone: "accent" | "warn" | "stop";
}) {
  const labelClass =
    tone === "stop"
      ? "text-signal-stop"
      : tone === "warn"
        ? "text-signal-hold"
        : "text-accent";
  return (
    <div className="rounded-lg border border-line bg-canvas-sunken/55 px-3 py-2">
      <div className={clsx("mb-1 text-[11px] font-semibold", labelClass)}>{label}</div>
      <div className="text-sm leading-5 text-ink-soft">{text}</div>
    </div>
  );
}
