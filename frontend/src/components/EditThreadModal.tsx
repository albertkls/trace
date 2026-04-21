import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import ProjectSelect from "@/components/ProjectSelect";
import { toISODate } from "@/lib/periods";
import type {
  ThreadDetail,
  ThreadPatchInput,
  ThreadStatus,
} from "@/lib/types";

type Props = {
  open: boolean;
  onClose: () => void;
  thread: ThreadDetail;
};

const STATUS_OPTIONS: Array<{ value: ThreadStatus; label: string }> = [
  { value: "active", label: "推进中" },
  { value: "blocked", label: "阻塞" },
  { value: "done", label: "已完成" },
  { value: "archived", label: "已归档" },
];

export default function EditThreadModal({ open, onClose, thread }: Props) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState("");
  const [owner, setOwner] = useState("");
  const [status, setStatus] = useState<ThreadStatus>("active");
  const [startedAt, setStartedAt] = useState("");
  const [pinned, setPinned] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = toISODate(new Date());

  useEffect(() => {
    if (!open) return;
    setTitle(thread.title);
    setProjectId(thread.project_id ?? "");
    setOwner(thread.owner ?? "");
    setStatus(thread.status);
    setStartedAt(thread.started_at.slice(0, 10));
    setPinned(Boolean(thread.pinned));
    setError(null);
  }, [
    open,
    thread.id,
    thread.owner,
    thread.pinned,
    thread.project_id,
    thread.started_at,
    thread.status,
    thread.title,
  ]);

  const save = useMutation({
    mutationFn: () => {
      const payload: ThreadPatchInput = {
        title: title.trim(),
        project_id: projectId || null,
        clear_project: !projectId,
        owner: owner.trim() || null,
        status,
        pinned,
        started_at: startedAt,
      };
      return api.threads.patch(thread.id, payload);
    },
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ["thread", thread.id] });
      qc.invalidateQueries({ queryKey: ["threads"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["project"] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (!save.isPending) onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, save.isPending]);

  if (!open) return null;

  const futureStartedAt = !!startedAt && startedAt > today;
  const canSubmit =
    title.trim().length > 0 &&
    !!startedAt &&
    !futureStartedAt &&
    !save.isPending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[10vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="编辑工作线"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !save.isPending) onClose();
      }}
    >
      <div
        className="panel w-full max-w-xl overflow-hidden"
        style={{
          boxShadow:
            "0 1px 0 rgba(255,255,255,0.05) inset, 0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(94,230,197,0.08)",
        }}
      >
        <div className="flex items-center gap-3 border-b border-line bg-canvas-sunken/70 px-5 py-2.5">
          <span className="dot-pulse" />
          <span className="eyebrow">EDIT THREAD</span>
        </div>

        <div className="space-y-4 px-5 pb-5 pt-4">
          <label className="block">
            <div className="mb-1.5 eyebrow">标题 *</div>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSubmit) save.mutate();
              }}
              placeholder="例如：用户权限模块重构"
              className="input w-full"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <div className="mb-1.5 eyebrow">项目</div>
              <ProjectSelect value={projectId} onChange={setProjectId} />
            </label>

            <label className="block">
              <div className="mb-1.5 eyebrow">负责人</div>
              <input
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="例如：张三"
                className="input w-full"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <div className="mb-1.5 eyebrow">状态</div>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ThreadStatus)}
                className="input w-full"
              >
                {STATUS_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <div className="mb-1.5 eyebrow">开始日期</div>
              <input
                type="date"
                value={startedAt}
                max={today}
                onChange={(e) => setStartedAt(e.target.value)}
                className="input w-full"
              />
            </label>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-canvas-sunken/60 px-4 py-3">
            <input
              type="checkbox"
              checked={pinned}
              onChange={(e) => setPinned(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-line bg-canvas-sunken text-accent"
            />
            <div>
              <div className="text-sm font-medium text-ink">置顶线程</div>
              <div className="mt-1 text-xs text-ink-mute">
                置顶后会在列表和首页优先展示。
              </div>
            </div>
          </label>

          <div className="rounded-xl border border-line bg-canvas-sunken/60 px-4 py-3">
            <div className="eyebrow">AI 概览</div>
            <div className="mt-2 text-xs leading-relaxed text-ink-mute">
              本次先保持 AI-only，不在编辑表单里手改。仍然通过详情页右侧
              “重写”按钮维护概览内容。
            </div>
          </div>

          {futureStartedAt && (
            <div className="rounded-xl border border-signal-stop/40 bg-signal-stop/10 px-4 py-2 text-xs text-signal-stop">
              开始日期不能晚于今天。
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-signal-stop/40 bg-signal-stop/10 px-4 py-2 text-xs text-signal-stop">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              className="btn btn-ghost"
              onClick={onClose}
              disabled={save.isPending}
            >
              取消（Esc）
            </button>
            <button
              className="btn btn-accent"
              onClick={() => save.mutate()}
              disabled={!canSubmit}
            >
              {save.isPending ? "保存中…" : "保存修改"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
