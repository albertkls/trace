import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import Modal from "@/components/Modal";
import ProjectModal from "@/components/ProjectModal";
import ProjectSelect from "@/components/ProjectSelect";
import type { Project, Thread } from "@/lib/types";

type Props = {
  open: boolean;
  onClose: () => void;
  defaultProjectId?: string;
  onCreated?: (t: Thread) => void;
};

export default function NewThreadModal({ open, onClose, defaultProjectId, onCreated }: Props) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState("");
  const [owner, setOwner] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [projectModalOpen, setProjectModalOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setProjectId(defaultProjectId ?? "");
    setOwner("");
    setError(null);
  }, [open, defaultProjectId]);

  const create = useMutation({
    mutationFn: () =>
      api.threads.create({
        title: title.trim(),
        project_id: projectId || null,
        owner: owner.trim() || null,
      }),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ["threads"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["project"] });
      onCreated?.(t);
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const canSubmit = title.trim().length > 0 && !create.isPending;

  return (
    <Modal open={open} onClose={onClose} title="NEW THREAD">
      <ProjectModal
        open={projectModalOpen}
        onClose={() => setProjectModalOpen(false)}
        onSaved={(project: Project) => {
          setProjectId(project.id);
          setProjectModalOpen(false);
        }}
      />

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
          <div className="mb-1.5 flex items-center justify-between">
            <span className="eyebrow">项目（可选）</span>
            <button
              type="button"
              className="text-xs text-accent"
              onClick={() => setProjectModalOpen(true)}
            >
              ＋ 新建项目
            </button>
          </div>
          <ProjectSelect value={projectId} onChange={setProjectId} />
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
          <button className="btn btn-ghost" onClick={onClose} disabled={create.isPending}>
            取消
          </button>
          <button className="btn btn-accent" onClick={() => create.mutate()} disabled={!canSubmit}>
            {create.isPending ? "创建中…" : "创建线程"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
