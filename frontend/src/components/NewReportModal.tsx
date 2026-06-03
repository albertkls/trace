import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import ProjectSelect from "@/components/ProjectSelect";
import ThreadMultiSelectChips from "@/components/ThreadMultiSelectChips";
import { api } from "@/lib/api";
import type { Report, ReportAudience, Project, Thread } from "@/lib/types";
import {
  AUDIENCE_OPTIONS,
  PRESETS,
  REPORT_TEMPLATES,
  toISODateTimeMinute,
  toDateTimeInputValue,
} from "@/lib/periods";

type Props = {
  open: boolean;
  onClose: () => void;
  defaultProjectId?: string;
  onCreated?: (r: Report) => void;
};

export default function NewReportModal({
  open,
  onClose,
  defaultProjectId,
  onCreated,
}: Props) {
  const qc = useQueryClient();
  const [presetKey, setPresetKey] = useState<string>("this_week");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [audience, setAudience] = useState<ReportAudience>("boss");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [selectedThreads, setSelectedThreads] = useState<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("standard");
  const [error, setError] = useState<string | null>(null);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: (): Promise<Project[]> => api.projects.list().then((r) => r.items),
    enabled: open,
  });
  const { data: threads = [] } = useQuery({
    queryKey: ["threads"],
    queryFn: (): Promise<Thread[]> => api.threads.list().then((r) => r.items),
    enabled: open,
  });

  const preset = useMemo(
    () => PRESETS.find((p) => p.key === presetKey) ?? PRESETS[0],
    [presetKey]
  );

  useEffect(() => {
    if (!open) return;
    const r = preset.range();
    if (r) {
      setStart(r.start);
      setEnd(r.end);
    }
    setError(null);
  }, [preset, open]);

  useEffect(() => {
    if (!open) return;
    setPresetKey("this_week");
    setAudience("boss");
    setSelectedProjectId(defaultProjectId ?? "");
    setCustomLabel("");
    setCustomTitle("");
    setSelectedThreads([]);
    setSelectedTemplate("standard");
    setError(null);
    const now = toISODateTimeMinute(new Date());
    if (!start) setStart(now);
    if (!end) setEnd(now);
  }, [open, defaultProjectId]);

  const visibleThreads = useMemo(
    () =>
      selectedProjectId
        ? threads.filter((thread) => thread.project_id === selectedProjectId)
        : threads,
    [selectedProjectId, threads]
  );
  const selectedThreadObjects = useMemo(
    () => threads.filter((thread) => selectedThreads.includes(thread.id)),
    [selectedThreads, threads]
  );
  const selectedThreadProjectNames = useMemo(
    () =>
      Array.from(
        new Set(selectedThreadObjects.map((thread) => thread.project).filter(Boolean))
      ) as string[],
    [selectedThreadObjects]
  );
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;

  useEffect(() => {
    setSelectedThreads((prev) =>
      prev.filter((threadId) => visibleThreads.some((thread) => thread.id === threadId))
    );
  }, [visibleThreads]);

  useEffect(() => {
    if (!open) return;
    if (selectedProjectId && !customTitle.trim()) {
      setCustomTitle(`${selectedProject?.name || "项目"} · 本周项目报告`);
    } else if (!selectedProjectId && defaultProjectId) {
      setCustomTitle("");
    }
  }, [defaultProjectId, open, selectedProject?.name, selectedProjectId]);

  useEffect(() => {
    if (!open) return;
    if (selectedProjectId && selectedTemplate === "standard") {
      setSelectedTemplate("project");
    }
  }, [open, selectedProjectId, selectedTemplate]);

  const toggleThread = (id: string) => {
    setSelectedThreads(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  const create = useMutation({
    mutationFn: () => {
      const template = REPORT_TEMPLATES.find(t => t.key === selectedTemplate);
      return api.reports.create({
        period_start: start,
        period_end: end,
        audience,
        project_id: selectedProjectId || null,
        period_label: customLabel.trim() || undefined,
        title: customTitle.trim() || undefined,
        thread_ids: selectedThreads.length > 0 ? selectedThreads : undefined,
        body_md: template?.body || "",
      });
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["reports"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["project"] });
      onCreated?.(r);
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

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

  if (!open) return null;

  const canSubmit = !!start && !!end && start <= end && !create.isPending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[10vh] backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
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
          <span className="eyebrow">NEW REPORT</span>
          <span className="mono-meta ml-1 text-ink-faint">
            /reports → draft
          </span>
        </div>

        <div className="px-5 pb-5 pt-4">
          <p className="mb-4 text-xs text-ink-mute">
            先选周期与视角，正文可稍后由 AI 生成。
          </p>

          <div className="mb-4">
            <div className="mb-1.5 eyebrow">周期</div>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPresetKey(p.key)}
                  className={clsx(
                    "chip cursor-pointer",
                    presetKey === p.key && "chip-accent"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mono-meta">开始</span>
                <input
                  type="datetime-local"
                  value={toDateTimeInputValue(start)}
                  onChange={(e) => {
                    setStart(e.target.value);
                    setPresetKey("custom");
                  }}
                  className="input mt-1 !py-1.5 font-mono"
                />
              </label>
              <label className="block">
                <span className="mono-meta">结束</span>
                <input
                  type="datetime-local"
                  value={toDateTimeInputValue(end)}
                  onChange={(e) => {
                    setEnd(e.target.value);
                    setPresetKey("custom");
                  }}
                  className="input mt-1 !py-1.5 font-mono"
                />
              </label>
            </div>
            {start && end && start > end && (
              <div className="mt-2 text-xs text-signal-stop">
                开始日期不能晚于结束日期
              </div>
            )}
          </div>

          <div className="mb-4">
            <div className="mb-1.5 eyebrow">视角</div>
            <div className="flex flex-wrap gap-1.5">
              {AUDIENCE_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setAudience(o.value)}
                  className={clsx(
                    "chip cursor-pointer",
                    audience === o.value && "chip-accent"
                  )}
                  title={o.hint}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <div className="mb-1.5 eyebrow">项目（可选）</div>
            <ProjectSelect value={selectedProjectId} onChange={setSelectedProjectId} />
          </div>

          <div className="mb-4">
            <div className="mb-1.5 eyebrow">限定线程（可选）</div>
            <p className="mb-2 text-xs text-ink-mute">不选则包含所有线程的证据</p>
            <ThreadMultiSelectChips
              threads={visibleThreads}
              selectedIds={selectedThreads}
              onToggle={toggleThread}
              className="max-h-32 overflow-y-auto"
            />
          </div>

          {!selectedProjectId && selectedThreadProjectNames.length > 1 && (
            <div className="mb-4 rounded-xl border border-signal-hold/40 bg-signal-hold/10 px-4 py-2 text-xs text-signal-hold">
              当前选择的线程跨多个项目，建议绑定一个明确项目，或只保留同一项目下的线程。
            </div>
          )}

          <div className="mb-4">
            <div className="mb-1.5 eyebrow">模板</div>
            <div className="flex flex-wrap gap-1.5">
              {REPORT_TEMPLATES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setSelectedTemplate(t.key)}
                  className={clsx(
                    "chip cursor-pointer text-xs",
                    selectedTemplate === t.key && "chip-accent"
                  )}
                  title={t.hint}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <details className="mb-4 text-xs text-ink-mute">
            <summary className="cursor-pointer select-none hover:text-ink-soft">
              高级：自定义周期标签 / 标题
            </summary>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mono-meta">周期标签（留空则自动）</span>
                <input
                  value={customLabel}
                  onChange={(e) => setCustomLabel(e.target.value)}
                  placeholder="例如 Sprint-12"
                  className="input mt-1 !py-1.5"
                />
              </label>
              <label className="block">
                <span className="mono-meta">标题（留空则自动）</span>
                <input
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="例如 Q1 项目复盘"
                  className="input mt-1 !py-1.5"
                />
              </label>
            </div>
          </details>

          {error && (
            <div className="mb-4 rounded-xl border border-signal-stop/40 bg-signal-stop/10 px-4 py-2 text-xs text-signal-stop">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
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
              {create.isPending ? "创建中…" : "创建空白草稿"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
