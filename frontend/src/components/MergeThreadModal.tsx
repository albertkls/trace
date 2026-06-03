import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { api } from "@/lib/api";
import type { Evidence } from "@/lib/types";

type Props = {
  open: boolean;
  onClose: () => void;
  sourceThreadId: string;
  sourceTitle: string;
  evidence: Evidence[];
  onMerged?: () => void;
};

export default function MergeThreadModal({
  open,
  onClose,
  sourceThreadId,
  sourceTitle,
  evidence,
  onMerged,
}: Props) {
  const qc = useQueryClient();
  const [targetId, setTargetId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: threads = [] } = useQuery({
    queryKey: ["threads"],
    queryFn: () => api.threads.list().then((r) => r.items),
    enabled: open,
  });

  const otherThreads = threads.filter((t) => t.id !== sourceThreadId);

  const merge = useMutation({
    mutationFn: async () => {
      if (!targetId) throw new Error("请选择目标线程");
      await Promise.all(
        evidence.map((ev) =>
          api.captures.update(ev.id, { thread_id: targetId })
        )
      );
      await api.threads.patch(sourceThreadId, { status: "archived" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["threads"] });
      qc.invalidateQueries({ queryKey: ["thread", sourceThreadId] });
      onMerged?.();
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  if (!open) return null;

  const canSubmit = !!targetId && !merge.isPending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[10vh] backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="panel w-full max-w-lg overflow-hidden"
        style={{
          boxShadow:
            "0 1px 0 rgba(255,255,255,0.05) inset, 0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(94,230,197,0.08)",
        }}
      >
        <div className="flex items-center gap-3 border-b border-line bg-canvas-sunken/70 px-5 py-2.5">
          <span className="dot-pulse" />
          <span className="eyebrow">MERGE THREAD</span>
        </div>

        <div className="px-5 pb-5 pt-4">
          <p className="mb-1 text-sm text-ink">
            将{" "}
            <span className="font-medium text-accent">「{sourceTitle}」</span>{" "}
            的 <span className="font-medium">{evidence.length} 条证据</span>
            合并到另一线程，并归档当前线程。
          </p>
          <p className="mb-4 text-xs text-ink-mute">
            此操作不可撤销，请确认后执行。
          </p>

          {otherThreads.length === 0 ? (
            <div className="py-6 text-center text-sm text-ink-mute">
              暂无其他线程可合并。
            </div>
          ) : (
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {otherThreads.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setTargetId(t.id)}
                    className={clsx(
                      "w-full rounded-lg border px-4 py-2.5 text-left text-sm transition",
                      targetId === t.id
                        ? "border-accent/50 bg-accent/10 text-ink"
                        : "border-line bg-canvas-sunken/50 text-ink-soft hover:border-accent/30 hover:text-ink"
                    )}
                  >
                    <div className="font-medium">{t.title}</div>
                    {t.project && (
                      <div className="mt-0.5 text-xs text-ink-mute">
                        {t.project}
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error && (
            <div className="mt-4 rounded-xl border border-signal-stop/40 bg-signal-stop/10 px-4 py-2 text-xs text-signal-stop">
              {error}
            </div>
          )}

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              className="btn btn-ghost"
              onClick={onClose}
              disabled={merge.isPending}
            >
              取消
            </button>
            <button
              className="btn btn-accent"
              onClick={() => merge.mutate()}
              disabled={!canSubmit}
            >
              {merge.isPending ? "合并中…" : "确认合并"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
