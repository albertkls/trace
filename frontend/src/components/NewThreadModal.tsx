import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Thread } from "@/lib/types";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated?: (t: Thread) => void;
};

export default function NewThreadModal({ open, onClose, onCreated }: Props) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [project, setProject] = useState("");
  const [owner, setOwner] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setProject("");
    setOwner("");
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const create = useMutation({
    mutationFn: () =>
      api.threads.create({
        title: title.trim(),
        project: project.trim() || null,
        owner: owner.trim() || null,
      }),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ["threads"] });
      onCreated?.(t);
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  if (!open) return null;

  const canSubmit = title.trim().length > 0 && !create.isPending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[10vh] backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="panel w-full max-w-md overflow-hidden"
        style={{
          boxShadow:
            "0 1px 0 rgba(255,255,255,0.05) inset, 0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(94,230,197,0.08)",
        }}
      >
        <div className="flex items-center gap-3 border-b border-line bg-canvas-sunken/70 px-5 py-2.5">
          <span className="dot-pulse" />
          <span className="eyebrow">NEW THREAD</span>
        </div>

        <div className="space-y-4 px-5 pb-5 pt-4">
          <label className="block">
            <div className="mb-1.5 eyebrow">线程名称 *</div>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSubmit) create.mutate();
              }}
              placeholder="例如：用户权限模块重构"
              className="input w-full"
            />
          </label>

          <label className="block">
            <div className="mb-1.5 eyebrow">项目（可选）</div>
            <input
              value={project}
              onChange={(e) => setProject(e.target.value)}
              placeholder="例如：平台侧"
              className="input w-full"
            />
          </label>

          <label className="block">
            <div className="mb-1.5 eyebrow">负责人（可选）</div>
            <input
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              placeholder="例如：张三"
              className="input w-full"
            />
          </label>

          {error && (
            <div className="rounded-xl border border-signal-stop/40 bg-signal-stop/10 px-4 py-2 text-xs text-signal-stop">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              className="btn btn-ghost"
              onClick={onClose}
              disabled={create.isPending}
            >
              取消（Esc）
            </button>
            <button
              className="btn btn-accent"
              onClick={() => create.mutate()}
              disabled={!canSubmit}
            >
              {create.isPending ? "创建中…" : "创建线程"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
