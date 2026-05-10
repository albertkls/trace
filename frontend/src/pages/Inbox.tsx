import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import CategoryChoiceChips from "@/components/CategoryChoiceChips";
import ProjectRecommendationBar from "@/components/ProjectRecommendationBar";
import ProjectSelect from "@/components/ProjectSelect";
import { api } from "@/lib/api";
import type { InboxItem, Thread } from "@/lib/types";
import { recommendProjects } from "@/lib/projectRecommendations";
import { CategoryChip } from "@/components/EvidenceChip";
import { useQuickCapture } from "@/lib/quickCapture";

export default function Inbox() {
  const qc = useQueryClient();
  const { open: openCapture } = useQuickCapture();
  const { data: inbox = [], isLoading } = useQuery({
    queryKey: ["inbox"],
    queryFn: api.captures.inbox,
  });
  const { data: threads = [] } = useQuery({
    queryKey: ["threads"],
    queryFn: () => api.threads.list(),
  });
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: api.projects.list,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["inbox"] });
    qc.invalidateQueries({ queryKey: ["threads"] });
    qc.invalidateQueries({ queryKey: ["todos"] });
    qc.invalidateQueries({ queryKey: ["projects"] });
    qc.invalidateQueries({ queryKey: ["project"] });
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
        <button className="btn btn-accent" onClick={openCapture}>
          ＋ 写一笔
          <span className="ml-1 kbd !border-accent-ink/15 !bg-accent-ink/10 !text-accent-ink">
            ⌘⇧N
          </span>
        </button>
      </header>

      {isLoading ? (
        <div className="panel p-12 text-center text-sm text-ink-mute">
          加载中…
        </div>
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
        <ul className="space-y-3">
          {inbox.map((item) => (
            <InboxCard
              key={item.id}
              item={item}
              projects={projects}
              threads={threads}
              onChanged={invalidate}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function InboxCard({
  item,
  projects,
  threads,
  onChanged,
}: {
  item: InboxItem;
  projects: Array<{ id: string; name: string; status: string; summary: string }>;
  threads: Thread[];
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
  const createThread = useMutation({
    mutationFn: ({ title, projectId }: { title: string; projectId?: string }) =>
      api.threads.create({ title, project_id: projectId || null, adopt_evidence_id: item.id }),
    onSuccess: () => { setError(null); onChanged(); },
    onError: onMutError,
  });

  return (
    <li className="panel p-4">
      {error && (
        <div className="mb-3 rounded-lg border border-signal-stop/40 bg-signal-stop/10 px-3 py-1.5 text-xs text-signal-stop">
          操作失败：{error}
        </div>
      )}
      <div className="flex items-start gap-3">
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
              <a
                className="chip hover:border-accent/50 hover:text-accent"
                href={fileHref(item.source_file_path)}
                title={item.source_file_path}
                target="_blank"
                rel="noreferrer"
              >
                打开源文件
              </a>
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

function fileHref(path: string): string {
  return `file://${path.split("/").map(encodeURIComponent).join("/")}`;
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
