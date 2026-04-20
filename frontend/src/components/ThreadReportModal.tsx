import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { api } from "@/lib/api";
import type { Report, ReportAudience, ThreadDetail } from "@/lib/types";
import {
  AUDIENCE_OPTIONS,
  parseDateTime,
  toDateTimeInputValue,
  toISODateTimeMinute,
} from "@/lib/periods";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated?: (report: Report) => void;
  thread: ThreadDetail;
};

type RangePreset = "recent_3d" | "recent_7d" | "recent_14d" | "custom";

const PRESETS: { key: RangePreset; label: string; days: number | null }[] = [
  { key: "recent_3d", label: "最近 3 天", days: 3 },
  { key: "recent_7d", label: "最近 7 天", days: 7 },
  { key: "recent_14d", label: "最近 14 天", days: 14 },
  { key: "custom", label: "自定义", days: null },
];

function clampToThreadStart(now: Date, threadStartedAt: string, days: number): string {
  const startedAt = parseDateTime(threadStartedAt) ?? now;
  const candidate = new Date(now);
  candidate.setDate(candidate.getDate() - (days - 1));
  return toISODateTimeMinute(candidate > startedAt ? candidate : startedAt);
}

export default function ThreadReportModal({
  open,
  onClose,
  onCreated,
  thread,
}: Props) {
  const qc = useQueryClient();
  const [preset, setPreset] = useState<RangePreset>("recent_7d");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [audience, setAudience] = useState<ReportAudience>("boss");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const presetConfig = useMemo(
    () => PRESETS.find((item) => item.key === preset) ?? PRESETS[1],
    [preset]
  );

  const defaultTitle = useMemo(() => `${thread.title} · 汇报片段`, [thread.title]);
  const evidenceCount = thread.evidence.length;

  useEffect(() => {
    if (!open) return;
    const now = new Date();
    setEnd(toISODateTimeMinute(now));
    setStart(clampToThreadStart(now, thread.started_at, 7));
    setTitle(defaultTitle);
    setAudience("boss");
    setError(null);
    setPreset("recent_7d");
  }, [open, thread.id, thread.started_at, defaultTitle]);

  useEffect(() => {
    if (!open || presetConfig.days == null) return;
    const now = new Date();
    setEnd(toISODateTimeMinute(now));
    setStart(clampToThreadStart(now, thread.started_at, presetConfig.days));
  }, [open, presetConfig, thread.started_at]);

  const create = useMutation({
    mutationFn: () =>
      api.reports.create({
        period_start: start,
        period_end: end,
        audience,
        title: title.trim() || defaultTitle,
        thread_ids: [thread.id],
      }),
    onSuccess: (report) => {
      setError(null);
      qc.invalidateQueries({ queryKey: ["reports"] });
      onCreated?.(report);
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (!create.isPending) onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, create.isPending]);

  const startDate = useMemo(() => parseDateTime(start), [start]);
  const endDate = useMemo(() => parseDateTime(end), [end]);
  const rangeInverted =
    !!startDate && !!endDate && startDate.getTime() > endDate.getTime();
  const valid =
    !!startDate &&
    !!endDate &&
    !rangeInverted &&
    evidenceCount > 0 &&
    !create.isPending;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[10vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="创建线程汇报草稿"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !create.isPending) onClose();
      }}
    >
      <div className="panel w-full max-w-xl overflow-hidden">
        <div className="flex items-center gap-3 border-b border-line bg-canvas-sunken/70 px-5 py-2.5">
          <span className="dot-pulse" />
          <span className="eyebrow">THREAD REPORT</span>
          <span className="mono-meta text-ink-faint">仅纳入当前工作线证据</span>
        </div>

        <div className="space-y-4 px-5 pb-5 pt-4">
          <div>
            <div className="eyebrow">线程范围</div>
            <div className="mt-2 rounded-xl border border-line bg-canvas-sunken/60 px-4 py-3">
              <div className="text-sm font-medium text-ink">{thread.title}</div>
              <div className="mt-1 text-xs text-ink-mute">
                {thread.project || "未分项目"} · {evidenceCount} 条证据
              </div>
              {evidenceCount === 0 && (
                <div className="mt-2 text-[11px] text-signal-stop">
                  当前线程暂无证据，无法生成有信息量的片段。
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="eyebrow">时间窗</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PRESETS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setPreset(item.key)}
                  className={clsx(
                    "chip cursor-pointer",
                    preset === item.key && "chip-accent"
                  )}
                >
                  {item.label}
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
                    setPreset("custom");
                    setStart(e.target.value);
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
                    setPreset("custom");
                    setEnd(e.target.value);
                  }}
                  className="input mt-1 !py-1.5 font-mono"
                />
              </label>
            </div>
          </div>

          <div>
            <div className="eyebrow">视角</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {AUDIENCE_OPTIONS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setAudience(item.value)}
                  className={clsx(
                    "chip cursor-pointer",
                    audience === item.value && "chip-accent"
                  )}
                  title={item.hint}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mono-meta" htmlFor="thread-report-title">
              标题
            </label>
            <input
              id="thread-report-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input mt-1"
              placeholder={defaultTitle}
            />
          </div>

          {rangeInverted && (
            <div className="rounded-lg border border-signal-stop/40 bg-signal-stop/10 px-3 py-2 text-xs text-signal-stop">
              开始时间不能晚于结束时间
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-signal-stop/40 bg-signal-stop/10 px-3 py-2 text-xs text-signal-stop">
              创建失败：{error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              className="btn btn-ghost"
              onClick={onClose}
              disabled={create.isPending}
            >
              取消
            </button>
            <button
              className="btn btn-accent"
              onClick={() => create.mutate()}
              disabled={!valid}
            >
              {create.isPending ? "创建中…" : "创建线程汇报草稿"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
