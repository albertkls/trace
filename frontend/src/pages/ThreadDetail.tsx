import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { api } from "@/lib/api";
import StatusDot from "@/components/StatusDot";
import { CategoryChip } from "@/components/EvidenceChip";
import QuickCapture from "@/components/QuickCapture";
import EditThreadModal from "@/components/EditThreadModal";
import MergeThreadModal from "@/components/MergeThreadModal";
import ThreadReportModal from "@/components/ThreadReportModal";

export default function ThreadDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [addRecordOpen, setAddRecordOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const { data: thread, isLoading } = useQuery({
    queryKey: ["thread", id],
    queryFn: () => api.threads.get(id),
    enabled: !!id,
  });

  const summarize = useMutation({
    mutationFn: () => api.threads.summarize(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["thread", id] }),
  });

  if (isLoading || !thread) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-mute">
        加载线程…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-10 py-10">
      <QuickCapture
        open={addRecordOpen}
        onClose={() => setAddRecordOpen(false)}
        defaultThreadId={id}
      />
      <EditThreadModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        thread={thread}
      />
      <MergeThreadModal
        open={mergeOpen}
        onClose={() => setMergeOpen(false)}
        sourceThreadId={id}
        sourceTitle={thread.title}
        evidence={thread.evidence}
        onMerged={() => navigate("/threads")}
      />
      <ThreadReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        thread={thread}
        onCreated={(report) => navigate(`/reports/${report.id}`)}
      />

      <header className="mb-8">
        <Link
          to="/threads"
          className="text-xs text-ink-mute transition hover:text-accent"
        >
          ← 工作线
        </Link>
        <div className="mt-3 flex items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-display text-[32px] font-semibold leading-tight tracking-tight">
                {thread.title}
              </h1>
              <StatusDot status={thread.status} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-mute">
              {thread.project && <span className="chip">{thread.project}</span>}
              {thread.owner && (
                <span className="chip">负责人 · {thread.owner}</span>
              )}
              <span className="chip">起于 {thread.started_at.slice(0, 10)}</span>
              <span className="chip">{thread.evidence.length} 证据</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              className="btn"
              onClick={() => setEditOpen(true)}
            >
              编辑工作线
            </button>
            <button
              className="btn"
              onClick={() => setMergeOpen(true)}
            >
              合并到其他线程
            </button>
            <button
              className="btn btn-accent"
              onClick={() => setReportOpen(true)}
            >
              写成周报片段
            </button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-8">
        <section>
          <div className="mb-4 flex items-baseline justify-between">
            <span className="eyebrow">TIMELINE</span>
            <button
              className="text-xs text-accent transition hover:brightness-125"
              onClick={() => setAddRecordOpen(true)}
            >
              ＋ 添加记录
            </button>
          </div>

          <ol className="relative space-y-5 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-px before:bg-gradient-to-b before:from-accent/40 before:via-line-strong before:to-transparent">
            {thread.evidence.map((ev, idx) => (
              <li key={ev.id} className="relative pl-9">
                <span
                  className={clsx(
                    "absolute left-0 top-2 flex h-6 w-6 items-center justify-center rounded-full border bg-canvas-raised text-[11px]",
                    ev.category === "risk"
                      ? "border-signal-stop/50 text-signal-stop"
                      : ev.category === "decision"
                      ? "border-accent/50 text-accent"
                      : ev.category === "plan"
                      ? "border-signal-hold/50 text-signal-hold"
                      : ev.category === "support"
                      ? "border-iris/50 text-iris"
                      : "border-signal-go/50 text-signal-go"
                  )}
                  style={{
                    boxShadow:
                      "inset 0 0 8px rgba(255,255,255,0.04), 0 0 10px rgba(94,230,197,0.08)",
                  }}
                >
                  ◆
                </span>
                <div className="panel p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs text-ink-mute">
                    <CategoryChip category={ev.category} />
                    <span className="mono-meta">
                      {ev.event_date ?? "未定日期"}
                    </span>
                    <span className="mono-meta ml-auto text-ink-faint">
                      #{String(idx + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <p className="text-[15px] leading-relaxed text-ink">
                    {ev.text}
                  </p>
                  {ev.owners.length > 0 && (
                    <div className="mt-2 mono-meta">
                      {ev.owners.join(" · ")}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <aside className="space-y-5">
          <div className="panel p-5">
            <div className="mb-3 flex items-center gap-2">
              <span className="chip chip-accent">AI 概览</span>
              <button
                className="ml-auto text-xs text-accent transition hover:brightness-125 disabled:opacity-40"
                onClick={() => summarize.mutate()}
                disabled={summarize.isPending}
              >
                {summarize.isPending ? "生成中…" : "重写"}
              </button>
            </div>
            <p className="text-[15px] leading-relaxed text-ink-soft">
              {thread.summary || "尚无概览。写入更多证据后可由 AI 生成。"}
            </p>
          </div>

          <div className="panel p-5">
            <div className="mb-3 eyebrow">相关待办</div>
            {thread.todos.length === 0 ? (
              <div className="text-sm text-ink-mute">
                暂无挂在此线程的待办。
              </div>
            ) : (
              <ul className="space-y-2">
                {thread.todos.map((td) => (
                  <li
                    key={td.id}
                    className="flex items-start gap-2 text-sm text-ink"
                  >
                    <span
                      className={clsx(
                        "mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border text-[10px]",
                        td.done
                          ? "border-accent bg-accent text-accent-ink"
                          : "border-line bg-canvas-sunken"
                      )}
                    >
                      {td.done ? "✓" : ""}
                    </span>
                    <span
                      className={
                        td.done ? "text-ink-mute line-through" : ""
                      }
                    >
                      {td.text}
                    </span>
                    {td.due_date && (
                      <span className="mono-meta ml-auto">
                        {td.due_date.slice(5)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="panel p-5">
            <div className="mb-2 eyebrow">建议</div>
            <p className="text-sm text-ink-soft">
              "数据权限" 相关证据可能与{" "}
              <span className="text-accent">平台侧</span> 线程合并。
            </p>
            <button
              className="btn mt-3 w-full justify-center"
              onClick={() => setMergeOpen(true)}
            >
              查看合并建议
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
