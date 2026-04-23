import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { api } from "@/lib/api";
import StatusDot from "@/components/StatusDot";
import NewThreadModal from "@/components/NewThreadModal";
import type { Thread } from "@/lib/types";

export default function Threads() {
  const navigate = useNavigate();
  const [newThreadOpen, setNewThreadOpen] = useState(false);
  const [projectFilter, setProjectFilter] = useState("");
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: api.projects.list,
  });
  const { data: threads = [], isLoading } = useQuery({
    queryKey: ["threads", projectFilter],
    queryFn: () => api.threads.list(projectFilter || undefined),
  });

  return (
    <div className="mx-auto max-w-5xl px-10 py-10">
      <NewThreadModal
        open={newThreadOpen}
        onClose={() => setNewThreadOpen(false)}
        onCreated={(t: Thread) => navigate(`/threads/${t.id}`)}
      />
      <header className="mb-8 flex items-end justify-between gap-8">
        <div>
          <div className="eyebrow">THREADS</div>
          <h1 className="mt-2 font-display text-[32px] font-semibold leading-none tracking-tight">
            工作线
          </h1>
          <p className="mt-2 text-sm text-ink-soft">
            每一条工作线，都是你正在推进的一件事。
          </p>
        </div>
        <button
          className="btn btn-accent"
          onClick={() => setNewThreadOpen(true)}
        >
          ＋ 新建线程
        </button>
      </header>

      <div className="mb-6 flex items-center gap-3">
        <span className="eyebrow">按项目过滤</span>
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="input w-72"
        >
          <option value="">全部项目</option>
          {projects
            .filter((project) => project.status !== "archived")
            .map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
        </select>
      </div>

      {isLoading ? (
        <div className="panel py-12 text-center text-sm text-ink-mute">
          加载中…
        </div>
      ) : threads.length === 0 ? (
        <div className="panel py-16 text-center text-sm text-ink-mute">
          还没有任何线程。点右上角「＋ 新建线程」起第一条。
        </div>
      ) : (
        <section className="panel overflow-hidden">
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] items-center gap-4 border-b border-line px-5 py-2.5 eyebrow">
            <span>STATUS</span>
            <span>THREAD</span>
            <span>PROJECT</span>
            <span>EVIDENCE</span>
            <span className="w-4" />
          </div>
          <ul>
            {threads.map((t) => (
              <li key={t.id}>
                <Link
                  to={`/threads/${t.id}`}
                  className="group grid grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] items-center gap-4 border-b border-line/60 px-5 py-4 transition last:border-b-0 hover:bg-canvas-contrast/40"
                >
                  <StatusDot status={t.status} withLabel={false} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[15px] font-medium text-ink transition group-hover:text-accent">
                        {t.title}
                      </span>
                      {t.pinned ? (
                        <span className="chip chip-accent">置顶</span>
                      ) : null}
                    </div>
                    <div className="mt-1 truncate text-xs text-ink-mute">
                      {t.summary || "（暂无摘要）"}
                    </div>
                  </div>
                  <span
                    className={clsx(
                      "chip",
                      t.project ? "" : "opacity-0 pointer-events-none"
                    )}
                  >
                    {t.project ?? ""}
                  </span>
                  <span className="mono-meta whitespace-nowrap">
                    {String(t.evidence_count ?? 0).padStart(2, "0")} · ev
                  </span>
                  <span className="text-ink-mute transition group-hover:translate-x-0.5 group-hover:text-accent">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
