import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import ProjectStatusBadge from "@/components/ProjectStatusBadge";
import type { Project, ProjectStatus } from "@/lib/types";

const STATUS_OPTIONS: Array<{ value: ProjectStatus; label: string }> = [
  { value: "active", label: "进行中" },
  { value: "paused", label: "暂停" },
  { value: "done", label: "完成" },
  { value: "archived", label: "归档" },
];

type Props = {
  open: boolean;
  onClose: () => void;
  project?: Project | null;
  onSaved?: (project: Project) => void;
};

export default function ProjectModal({ open, onClose, project, onSaved }: Props) {
  const qc = useQueryClient();
  const editing = !!project;
  const [name, setName] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("active");
  const [owner, setOwner] = useState("");
  const [summary, setSummary] = useState("");
  const [color, setColor] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(project?.name ?? "");
    setStatus(project?.status ?? "active");
    setOwner(project?.owner ?? "");
    setSummary(project?.summary ?? "");
    setColor(project?.color ?? "");
    setError(null);
  }, [open, project]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        status,
        owner: owner.trim() || null,
        summary: summary.trim(),
        color: color.trim() || null,
      };
      if (editing && project) {
        return api.projects.patch(project.id, payload);
      }
      return api.projects.create(payload);
    },
    onSuccess: (saved) => {
      setError(null);
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["project"] });
      qc.invalidateQueries({ queryKey: ["threads"] });
      qc.invalidateQueries({ queryKey: ["notes"] });
      qc.invalidateQueries({ queryKey: ["reports"] });
      onSaved?.(saved);
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !save.isPending) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, save.isPending]);

  if (!open) return null;

  const canSubmit = name.trim().length > 0 && !save.isPending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[10vh] backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !save.isPending) onClose();
      }}
    >
      <div className="panel w-full max-w-xl overflow-hidden">
        <div className="flex items-center gap-3 border-b border-line bg-canvas-sunken/70 px-5 py-2.5">
          <span className="dot-pulse" />
          <span className="eyebrow">{editing ? "EDIT PROJECT" : "NEW PROJECT"}</span>
          {editing && <ProjectStatusBadge status={status} />}
        </div>

        <div className="space-y-4 px-5 pb-5 pt-4">
          <label className="block">
            <div className="mb-1.5 eyebrow">项目名称 *</div>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input w-full"
              placeholder="例如：Q3 增长实验"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <div className="mb-1.5 eyebrow">状态</div>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                className="input w-full"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <div className="mb-1.5 eyebrow">负责人</div>
              <input
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                className="input w-full"
                placeholder="例如：Albert"
              />
            </label>
          </div>

          <label className="block">
            <div className="mb-1.5 eyebrow">摘要</div>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="min-h-24 w-full rounded-lg border border-line bg-canvas-sunken/60 px-4 py-3 text-sm text-ink outline-none transition focus:border-accent/50"
              placeholder="一句话说明这个项目是什么、在做什么。"
            />
          </label>

          <label className="block">
            <div className="mb-1.5 eyebrow">颜色（可选）</div>
            <input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="input w-full"
              placeholder="例如：teal / violet / amber"
            />
          </label>

          {error && (
            <div className="rounded-xl border border-signal-stop/40 bg-signal-stop/10 px-4 py-2 text-xs text-signal-stop">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <button className="btn btn-ghost" onClick={onClose} disabled={save.isPending}>
              取消
            </button>
            <button className="btn btn-accent" onClick={() => save.mutate()} disabled={!canSubmit}>
              {save.isPending ? "保存中…" : editing ? "保存项目" : "创建项目"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
