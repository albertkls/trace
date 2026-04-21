import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { api } from "@/lib/api";
import NewReportModal from "@/components/NewReportModal";
import { AUDIENCE_LABEL } from "@/lib/periods";
import type { ReportAudience } from "@/lib/types";

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  final: "已定稿",
  archived: "归档",
};

const STATUS_CHIP: Record<string, string> = {
  draft: "chip-accent",
  final: "chip-go",
  archived: "",
};

export default function Reports() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [projectFilter, setProjectFilter] = useState("");
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: api.projects.list,
  });
  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["reports", projectFilter],
    queryFn: () => api.reports.list(projectFilter || undefined),
  });

  return (
    <div className="mx-auto max-w-5xl px-10 py-10">
      <header className="mb-8 flex items-end justify-between gap-6">
        <div>
          <div className="eyebrow">REPORTS</div>
          <h1 className="mt-2 font-display text-[32px] font-semibold leading-none tracking-tight">
            汇报
          </h1>
          <p className="mt-2 text-sm text-ink-soft">
            从工作线里织一段故事，交给需要它的人。
          </p>
        </div>
        <button className="btn btn-accent" onClick={() => setOpen(true)}>
          ＋ 新建周期报告
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
        <div className="panel p-12 text-center text-sm text-ink-mute">
          加载中…
        </div>
      ) : reports.length === 0 ? (
        <div className="panel p-12 text-center">
          <div className="mb-3 text-sm text-ink-soft">还没有报告。</div>
          <button className="btn btn-accent" onClick={() => setOpen(true)}>
            ＋ 新建第一份报告
          </button>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-4">
          {reports.map((r) => (
            <li key={r.id}>
              <Link
                to={`/reports/${r.id}`}
                className="group panel relative block overflow-hidden p-5 transition hover:border-accent/40"
              >
                {/* left accent stripe on hover */}
                <span className="absolute inset-y-0 left-0 w-px bg-accent/0 transition-all group-hover:w-[3px] group-hover:bg-accent" />

                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-[13px] font-semibold tracking-tight text-ink-soft group-hover:text-accent">
                    {r.period_label}
                  </span>
                  <span
                    className={clsx(
                      "chip",
                      STATUS_CHIP[r.status] || ""
                    )}
                  >
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </div>
                <div className="mt-3 text-[15px] font-medium text-ink">
                  {r.title}
                </div>
                {r.project_name && (
                  <div className="mt-2">
                    <span className="chip">{r.project_name}</span>
                  </div>
                )}
                <div className="mt-3 flex items-center gap-2 mono-meta">
                  <span>
                    {r.period_start} → {r.period_end}
                  </span>
                  <span className="opacity-50">·</span>
                  <span>
                    {AUDIENCE_LABEL[r.audience as ReportAudience] ??
                      r.audience}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <NewReportModal
        open={open}
        onClose={() => setOpen(false)}
        defaultProjectId={projectFilter || undefined}
        onCreated={(r) => navigate(`/reports/${r.id}`)}
      />
    </div>
  );
}
