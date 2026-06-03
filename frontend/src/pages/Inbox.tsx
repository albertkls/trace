import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import CategoryChoiceChips from "@/components/CategoryChoiceChips";
import ProjectRecommendationBar from "@/components/ProjectRecommendationBar";
import AttachmentPanel from "@/components/AttachmentPanel";
import ProjectSelect from "@/components/ProjectSelect";
import { api } from "@/lib/api";
import type { Category, InboxItem, Project, Thread } from "@/lib/types";
import { recommendProjects } from "@/lib/projectRecommendations";
import { CategoryChip } from "@/components/EvidenceChip";
import { useQuickCapture } from "@/lib/quickCapture";
import { ThreadListSkeleton } from "@/components/Skeleton";

export default function Inbox() {
  const qc = useQueryClient();
  const { open: openCapture } = useQuickCapture();
  const { data: inbox = [], isLoading } = useQuery({
    queryKey: ["inbox"],
    queryFn: api.captures.inbox,
  });
  const { data: threads = [] } = useQuery({
    queryKey: ["threads"],
    queryFn: (): Promise<Thread[]> => api.threads.list().then((r) => r.items),
  });
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: (): Promise<Project[]> => api.projects.list().then((r) => r.items),
  });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [groupBySource, setGroupBySource] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected = inbox.length > 0 && selectedIds.length === inbox.length;
  const groupedInbox = useMemo(() => {
    const groups = new Map<string, { key: string; label: string; items: InboxItem[] }>();
    for (const item of inbox) {
      const label = item.source_file_path || item.source_title || item.source_kind || "闪记";
      const key = label;
      const group = groups.get(key) ?? { key, label, items: [] };
      group.items.push(item);
      groups.set(key, group);
    }
    return Array.from(groups.values());
  }, [inbox]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["inbox"] });
    qc.invalidateQueries({ queryKey: ["threads"] });
    qc.invalidateQueries({ queryKey: ["todos"] });
    qc.invalidateQueries({ queryKey: ["projects"] });
    qc.invalidateQueries({ queryKey: ["project"] });
  };
  const toggleSelected = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((itemId) => itemId !== id)
        : [...current, id]
    );
  };
  const clearSelection = () => setSelectedIds([]);
  const toggleAll = () => {
    setSelectedIds(allSelected ? [] : inbox.map((item) => item.id));
  };
  const toggleGroup = (key: string) => {
    setCollapsedGroups((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key]
    );
  };
  const onBatchDone = () => {
    clearSelection();
    invalidate();
  };

  return (
    <div className="mx-auto max-w-3xl px-10 py-10">
      <header className="mb-8 flex items-end justify-between gap-6">
        <div>
          <div className="eyebrow">INBOX</div>
          <h1 className="mt-2 font-display text-[32px] font-semibold leading-none tracking-tight">
            收件箱
          </h1>
          <p className="mt-2 text-sm text-ink-soft">
            {inbox.length === 0
              ? "干净。所有闪记都已归入线程。"
              : `${inbox.length} 条待整理 · 逐条归入线程，或升级为待办。`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className={clsx("btn", groupBySource ? "btn-accent" : "btn-ghost")}
            onClick={() => setGroupBySource((value) => !value)}
          >
            按源文件
          </button>
          <button className="btn btn-accent" onClick={openCapture}>
            ＋ 写一笔
            <span className="ml-1 kbd !border-accent-ink/15 !bg-accent-ink/10 !text-accent-ink">
              ⌘⇧N
            </span>
          </button>
        </div>
      </header>

      {isLoading ? (
        <ThreadListSkeleton count={4} />
      ) : inbox.length === 0 ? (
        <div className="panel p-12 text-center">
          <div className="mx-auto mb-3 inline-flex items-center gap-2 rounded-pill border border-line bg-canvas-sunken/70 px-3 py-1">
            <span className="dot dot-go" />
            <span className="mono-meta">INBOX ZERO</span>
          </div>
          <div className="text-sm text-ink-soft">
            空如新纸。按{" "}
            <span className="kbd">⌘⇧N</span> 写下第一笔。
          </div>
        </div>
      ) : (
        <>
          <BatchToolbar
            selectedIds={selectedIds}
            threads={threads}
            onDone={onBatchDone}
            onClear={clearSelection}
            onToggleAll={toggleAll}
            allSelected={allSelected}
          />
          {groupBySource ? (
            <div className="space-y-4">
              {groupedInbox.map((group) => {
                const collapsed = collapsedGroups.includes(group.key);
                return (
                  <section key={group.key} className="space-y-3">
                    <button
                      className="flex w-full items-center justify-between rounded-lg border border-line bg-canvas-sunken/50 px-4 py-2 text-left"
                      onClick={() => toggleGroup(group.key)}
                    >
                      <span className="truncate text-sm font-medium text-ink">
                        {collapsed ? "▸" : "▾"} {group.label}
                      </span>
                      <span className="chip">{group.items.length} 条</span>
                    </button>
                    {!collapsed && (
                      <ul className="space-y-3">
                        {group.items.map((item) => (
                          <InboxCard
                            key={item.id}
                            item={item}
                            projects={projects}
                            threads={threads}
                            selected={selectedSet.has(item.id)}
                            onToggleSelected={() => toggleSelected(item.id)}
                            onChanged={invalidate}
                          />
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
          ) : (
            <ul className="space-y-3">
              {inbox.map((item) => (
                <InboxCard
                  key={item.id}
                  item={item}
                  projects={projects}
                  threads={threads}
                  selected={selectedSet.has(item.id)}
                  onToggleSelected={() => toggleSelected(item.id)}
                  onChanged={invalidate}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function BatchToolbar({
  selectedIds,
  threads,
  allSelected,
  onDone,
  onClear,
  onToggleAll,
}: {
  selectedIds: string[];
  threads: Thread[];
  allSelected: boolean;
  onDone: () => void;
  onClear: () => void;
  onToggleAll: () => void;
}) {
  const [category, setCategory] = useState<Category>("progress");
  const [projectId, setProjectId] = useState("");
  const [threadId, setThreadId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const scopedThreads = projectId
    ? threads.filter((thread) => thread.project_id === projectId)
    : threads;
  const selectedCount = selectedIds.length;
  const batch = useMutation({
    mutationFn: (body: Parameters<typeof api.captures.batch>[0]) =>
      api.captures.batch(body),
    onSuccess: () => {
      setError(null);
      setThreadId("");
      onDone();
    },
    onError: (e: Error) => setError(e.message),
  });
  const disabled = selectedCount === 0 || batch.isPending;

  return (
    <div className="panel sticky top-4 z-20 mb-4 space-y-3 p-4">
      {error && (
        <div className="rounded-lg border border-signal-stop/40 bg-signal-stop/10 px-3 py-1.5 text-xs text-signal-stop">
          批量操作失败：{error}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-ghost text-xs" onClick={onToggleAll}>
          {allSelected ? "取消全选" : "全选"}
        </button>
        <span className="chip chip-accent">已选 {selectedCount} 条</span>
        {selectedCount > 0 && (
          <button className="text-xs text-ink-mute transition hover:text-accent" onClick={onClear}>
            清空选择
          </button>
        )}
      </div>
      <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
        <ProjectSelect
          value={projectId}
          onChange={(value) => {
            setProjectId(value);
            setThreadId("");
          }}
          emptyLabel="全部项目"
          className="input w-full !py-2 text-xs"
        />
        <select
          value={threadId}
          onChange={(e) => setThreadId(e.target.value)}
          className="input w-full !py-2 text-xs"
          disabled={disabled}
        >
          <option value="">选择归入线程</option>
          {scopedThreads.map((thread) => (
            <option key={thread.id} value={thread.id}>
              {thread.title}
            </option>
          ))}
        </select>
        <button
          className="btn btn-accent text-xs"
          disabled={disabled || !threadId}
          onClick={() =>
            batch.mutate({ ids: selectedIds, action: "assign_thread", thread_id: threadId })
          }
        >
          归入线程
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as Category)}
          className="input !w-auto !py-2 text-xs"
          disabled={disabled}
        >
          <option value="progress">进展</option>
          <option value="decision">决定</option>
          <option value="risk">风险</option>
          <option value="plan">计划</option>
          <option value="support">协同</option>
        </select>
        <button
          className="btn btn-ghost text-xs"
          disabled={disabled}
          onClick={() => batch.mutate({ ids: selectedIds, action: "category", category })}
        >
          批量改分类
        </button>
        <input
          type="datetime-local"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="input !w-auto !py-2 text-xs"
          disabled={disabled}
        />
        <button
          className="btn btn-ghost text-xs"
          disabled={disabled}
          onClick={() =>
            batch.mutate({
              ids: selectedIds,
              action: "promote_todo",
              due_date: dueDate || null,
            })
          }
        >
          转为待办
        </button>
        <button
          className="btn btn-ghost text-xs text-signal-stop hover:!bg-signal-stop/10 hover:!text-signal-stop"
          disabled={disabled}
          onClick={() => {
            if (window.confirm(`删除选中的 ${selectedCount} 条记录？`)) {
              batch.mutate({ ids: selectedIds, action: "delete" });
            }
          }}
        >
          批量删除
        </button>
      </div>
    </div>
  );
}

function InboxCard({
  item,
  projects,
  threads,
  selected,
  onToggleSelected,
  onChanged,
}: {
  item: InboxItem;
  projects: Array<{ id: string; name: string; status: string; summary: string }>;
  threads: Thread[];
  selected: boolean;
  onToggleSelected: () => void;
  onChanged: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerProjectId, setPickerProjectId] = useState("");
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promoted, setPromoted] = useState(false);
  const recommendations = recommendProjects({
    text: [item.source_title, item.text].filter(Boolean).join(" · "),
    projects,
    threads,
  });

  const onMutError = (e: Error) => setError(e.message);

  const update = useMutation({
    mutationFn: (patch: Parameters<typeof api.captures.update>[1]) =>
      api.captures.update(item.id, patch),
    onSuccess: () => { setError(null); onChanged(); },
    onError: onMutError,
  });
  const remove = useMutation({
    mutationFn: () => api.captures.remove(item.id),
    onSuccess: () => { setError(null); onChanged(); },
    onError: onMutError,
  });
  const promote = useMutation({
    mutationFn: (body: { text?: string; due_date?: string | null } = {}) =>
      api.captures.promoteToTodo(item.id, body),
    onSuccess: () => { setError(null); setPromoted(true); onChanged(); },
    onError: onMutError,
  });
  const revealSource = useMutation({
    mutationFn: (path: string) => api.library.reveal(path),
    onSuccess: () => setError(null),
    onError: onMutError,
  });
  const createThread = useMutation({
    mutationFn: ({ title, projectId }: { title: string; projectId?: string }) =>
      api.threads.create({ title, project_id: projectId || null, adopt_evidence_id: item.id }),
    onSuccess: () => { setError(null); onChanged(); },
    onError: onMutError,
  });

  return (
    <li className={clsx("panel p-4", selected && "border-accent/70 shadow-glow")}>
      {error && (
        <div className="mb-3 rounded-lg border border-signal-stop/40 bg-signal-stop/10 px-3 py-1.5 text-xs text-signal-stop">
          操作失败：{error}
        </div>
      )}
      <div className="flex items-start gap-3">
        <label className="mt-1 flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded border border-line bg-canvas-sunken">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelected}
            className="h-3.5 w-3.5 accent-[var(--color-accent)]"
            aria-label="选择记录"
          />
        </label>
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <CategoryChip category={item.category} />
            <span className="mono-meta">
              {item.event_date ?? "未定日期"}
            </span>
            {item.source_title && (
              <span className="chip">{item.source_title}</span>
            )}
            {item.source_file_path && (
              <button
                className="chip hover:border-accent/50 hover:text-accent"
                title={item.source_file_path}
                onClick={() => revealSource.mutate(item.source_file_path!)}
                disabled={revealSource.isPending}
              >
                {revealSource.isPending ? "定位中…" : "显示源文件"}
              </button>
            )}
          </div>
          <p className="text-[15px] leading-relaxed text-ink">{item.text}</p>

          <CategoryChoiceChips
            value={item.category}
            onChange={(category) => update.mutate({ category })}
            className="mt-3 items-center"
          />

          <div className="mt-3">
            <ProjectRecommendationBar
              recommendations={recommendations}
              selectedProjectId={pickerProjectId}
              onSelect={(projectId) => {
                setPickerProjectId(projectId);
                setPickerOpen(true);
              }}
              hint="点击后在该项目下筛线程"
            />
          </div>

          <AttachmentPanel
            ownerType="evidence"
            ownerId={item.id}
            title="关联文件"
            compact
            className="mt-3"
          />
        </div>

        <div className="relative flex flex-col items-end gap-1.5">
          <button
            className="btn btn-ghost text-xs"
            onClick={() => setPickerOpen((v) => !v)}
          >
            归入线程 ▾
          </button>
          <button
            className={clsx(
              "btn text-xs",
              promoted ? "btn-accent" : "btn-ghost"
            )}
            onClick={() => !promoted && setPromoteOpen(true)}
            disabled={promote.isPending || promoted}
          >
            {promoted ? "✓ 已转待办" : "→ 待办"}
          </button>
          {promoteOpen && (
            <PromoteDialog
              defaultText={item.text}
              onConfirm={(text, due_date) => {
                promote.mutate({ text, due_date });
                setPromoteOpen(false);
              }}
              onClose={() => setPromoteOpen(false)}
            />
          )}
          <button
            className="btn btn-ghost text-xs text-signal-stop hover:!bg-signal-stop/10 hover:!text-signal-stop"
            onClick={() => {
              if (window.confirm("删除这条记录？")) remove.mutate();
            }}
            disabled={remove.isPending}
          >
            删除
          </button>
          {pickerOpen && (
            <ThreadPicker
              threads={threads}
              initialProjectId={pickerProjectId}
              onPickExisting={(id) => {
                update.mutate({ thread_id: id });
                setPickerOpen(false);
              }}
              onCreate={(title, projectId) => {
                createThread.mutate({ title, projectId });
                setPickerOpen(false);
              }}
              onClose={() => setPickerOpen(false)}
            />
          )}
        </div>
      </div>
    </li>
  );
}

function PromoteDialog({
  defaultText,
  onConfirm,
  onClose,
}: {
  defaultText: string;
  onConfirm: (text: string, due_date: string | null) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(defaultText);
  const [due, setDue] = useState("");

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[12vh] backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="panel w-full max-w-md p-5">
        <div className="mb-3 flex items-center gap-2">
          <span className="chip chip-accent">→ 转待办</span>
          <span className="mono-meta text-ink-faint">编辑后确认</span>
        </div>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          className="input mb-3 w-full !py-2 text-sm"
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
          }}
        />
        <label className="chip mb-4 inline-flex cursor-pointer items-center gap-2">
          <span className="mono-meta">截止时间</span>
          <input
            type="datetime-local"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="bg-transparent font-mono text-[11px] text-ink outline-none"
          />
        </label>
        <div className="flex items-center justify-end gap-2">
          <button className="btn btn-ghost" onClick={onClose}>取消</button>
          <button
            className="btn btn-accent"
            disabled={!text.trim()}
            onClick={() => onConfirm(text.trim(), due || null)}
          >
            确认转为待办
          </button>
        </div>
      </div>
    </div>
  );
}

function ThreadPicker({
  threads,
  initialProjectId,
  onPickExisting,
  onCreate,
  onClose,
}: {
  threads: Thread[];
  initialProjectId?: string;
  onPickExisting: (id: string) => void;
  onCreate: (title: string, projectId?: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [projectId, setProjectId] = useState(initialProjectId ?? "");
  const scopedThreads = projectId
    ? threads.filter((thread) => thread.project_id === projectId)
    : threads;
  const filtered = q
    ? scopedThreads.filter((t) =>
        t.title.toLowerCase().includes(q.toLowerCase())
      )
    : scopedThreads;
  return (
    <div className="panel absolute right-0 top-9 z-30 w-72 p-2">
      <div className="mb-2">
        <ProjectSelect
          value={projectId}
          onChange={setProjectId}
          emptyLabel="全部项目"
          className="input w-full !py-1 !text-sm"
        />
      </div>
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="搜索或新建…"
        className="input mb-1 !py-1 !text-sm"
        onKeyDown={(e) => {
          if (e.key === "Enter" && q.trim() && filtered.length === 0) {
            onCreate(q.trim(), projectId || undefined);
          }
          if (e.key === "Escape") onClose();
        }}
      />
      <ul className="max-h-60 overflow-y-auto">
        {filtered.map((t) => (
          <li key={t.id}>
            <button
              onClick={() => onPickExisting(t.id)}
              className="block w-full truncate rounded-md px-2 py-1.5 text-left text-sm text-ink-soft transition hover:bg-canvas-contrast hover:text-ink"
            >
              {t.title}
            </button>
          </li>
        ))}
        {q.trim() && !filtered.some((t) => t.title === q.trim()) && (
          <li>
            <button
              onClick={() => onCreate(q.trim(), projectId || undefined)}
              className="block w-full rounded-md px-2 py-1.5 text-left text-sm text-accent transition hover:bg-canvas-contrast"
            >
              ＋ 新建线程「{q.trim()}」
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}
