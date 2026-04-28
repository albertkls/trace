import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { api } from "@/lib/api";
import StatusDot from "@/components/StatusDot";
import { useQuickCapture } from "@/lib/quickCapture";
import { isoWeekLabel } from "@/lib/periods";

export default function Home() {
  const { open: openCapture } = useQuickCapture();
  const { data: threads = [], isLoading } = useQuery({
    queryKey: ["threads"],
    queryFn: () => api.threads.list(),
  });
  const { data: reports = [] } = useQuery({
    queryKey: ["reports"],
    queryFn: () => api.reports.list(),
  });
  const { data: inbox = [] } = useQuery({
    queryKey: ["inbox"],
    queryFn: api.captures.inbox,
  });

  const maxEv = Math.max(1, ...threads.map((t) => t.evidence_count ?? 0));
  const draftReport = reports.find((r) => r.status === "draft");

  const today = new Date();
  const weekLabel = isoWeekLabel(today);
  const iso = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");

  const items: { text: string; to?: string }[] = [];
  if (inbox.length > 0) {
    items.push({ text: `${inbox.length} 条闪记待归线程`, to: "/inbox" });
  }
  if (draftReport) {
    items.push({
      text: `「${draftReport.period_label} 周报」草稿等你定稿`,
      to: `/reports/${draftReport.id}`,
    });
  } else {
    items.push({ text: "本周尚未起草周报", to: "/reports" });
  }
  const blocked = threads.filter((t) => t.status === "blocked");
  if (blocked.length > 0) {
    items.push({
      text: `${blocked.length} 条工作线处于阻塞`,
      to: "/threads",
    });
  }
  if (items.length === 0) {
    items.push({ text: "收件箱干净，没有紧急需要关注的事。" });
  }

  return (
    <div className="mx-auto max-w-5xl px-10 py-12">
      <header className="mb-10 flex items-end justify-between gap-8">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="dot-pulse" />
            <span className="eyebrow">
              TODAY · {weekLabel}
            </span>
          </div>
          <h1 className="mt-4 font-display text-[44px] font-semibold leading-none tracking-tight">
            今日
          </h1>
          <p className="mt-3 max-w-md text-sm text-ink-soft">
            把这一刻的想法留下，系统会自动把它织进你的工作线。
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="mono-meta text-ink-soft">{iso}</div>
            <div className="mono-meta opacity-60">local · trace-api</div>
          </div>
          <button className="btn btn-accent" onClick={openCapture}>
            <span>＋</span>
            <span>写一笔</span>
            <span className="kbd ml-1 !border-accent-ink/15 !bg-accent-ink/10 !text-accent-ink">
              ⌘⇧N
            </span>
          </button>
        </div>
      </header>

      {/* Focus Queue */}
      <section className="panel mb-6 overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="eyebrow">FOCUS QUEUE</span>
            <span className="chip">{items.length}</span>
          </div>
          <span className="mono-meta">TAP TO OPEN ↗</span>
        </div>
        <ul>
          {items.map((it, i) =>
            it.to ? (
              <li key={i}>
                <Link
                  to={it.to}
                  className="group relative flex items-center gap-4 border-b border-line/60 px-5 py-3.5 text-sm text-ink transition last:border-b-0 hover:bg-canvas-contrast/50"
                >
                  <span className="absolute inset-y-0 left-0 w-px bg-accent/0 transition-all group-hover:w-[2px] group-hover:bg-accent" />
                  <span className="flex-1">{it.text}</span>
                  <span className="text-ink-mute transition group-hover:translate-x-0.5 group-hover:text-accent">
                    →
                  </span>
                </Link>
              </li>
            ) : (
              <li
                key={i}
                className="flex items-center gap-4 border-b border-line/60 px-5 py-3.5 text-sm text-ink-soft last:border-b-0"
              >
                <span className="flex-1">{it.text}</span>
              </li>
            )
          )}
        </ul>
      </section>

      {/* Threads · Activity */}
      <section className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="eyebrow">THREADS · ACTIVITY</span>
            <span className="chip">{threads.length}</span>
          </div>
          <Link
            to="/threads"
            className="text-xs text-accent transition hover:brightness-125"
          >
            查看全部 →
          </Link>
        </div>

        {isLoading ? (
          <div className="py-10 text-center text-sm text-ink-mute">加载中…</div>
        ) : threads.length === 0 ? (
          <div className="py-12 text-center text-sm text-ink-mute">
            空窗期。开一个新线程把事情串起来。
          </div>
        ) : (
          <ul>
            {threads.map((t) => {
              const pct = Math.max(
                4,
                Math.min(100, ((t.evidence_count ?? 0) / maxEv) * 100)
              );
              return (
                <li key={t.id}>
                  <Link
                    to={`/threads/${t.id}`}
                    className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 border-b border-line/60 px-5 py-4 transition last:border-b-0 hover:bg-canvas-contrast/40"
                  >
                    <StatusDot status={t.status} withLabel={false} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[15px] font-medium text-ink transition group-hover:text-accent">
                          {t.title}
                        </span>
                        {t.pinned && (
                          <span className="chip chip-accent">置顶</span>
                        )}
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <div className="relative h-1.5 flex-1 overflow-hidden rounded-pill bg-canvas-sunken">
                          <div
                            className={clsx(
                              "h-full rounded-pill transition-all duration-500",
                              t.status === "blocked"
                                ? "bg-signal-stop"
                                : "bg-accent"
                            )}
                            style={{
                              width: `${pct}%`,
                              boxShadow:
                                t.status === "blocked"
                                  ? "0 0 12px rgba(255,107,107,0.45)"
                                  : "0 0 12px rgba(94,230,197,0.5)",
                            }}
                          />
                        </div>
                        <span className="mono-meta whitespace-nowrap">
                          {String(t.evidence_count ?? 0).padStart(2, "0")} · ev
                        </span>
                      </div>
                    </div>
                    <span className="text-ink-mute transition group-hover:translate-x-0.5 group-hover:text-accent">
                      →
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
