import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import ProjectModal from "@/components/ProjectModal";
import ProjectStatusBadge from "@/components/ProjectStatusBadge";
import { ProjectCardSkeleton } from "@/components/Skeleton";
import { api } from "@/lib/api";
import type { Project, ProjectStatus } from "@/lib/types";

type FilterKey = "all" | ProjectStatus;

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "全部" },
  { key: "active", label: "进行中" },
  { key: "paused", label: "暂停" },
  { key: "done", label: "完成" },
  { key: "archived", label: "归档" },
];

export default function Projects() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: (): Promise<Project[]> => api.projects.list().then((r) => r.items),
  });

  const visibleProjects = useMemo(
    () => (filter === "all" ? projects : projects.filter((project) => project.status === filter)),
    [filter, projects]
  );

  return (
    <div className="mx-auto max-w-6xl px-10 py-10">
      <ProjectModal
        open={open}
        onClose={() => {
          setOpen(false);
          setEditingProject(null);
        }}
        project={editingProject}
        onSaved={(project) => navigate(`/projects/${project.id}`)}
      />

      <header className="mb-8 flex items-end justify-between gap-6">
        <div>
          <div className="eyebrow">PROJECTS</div>
          <h1 className="mt-2 font-display text-[32px] font-semibold leading-none tracking-tight">
            项目
          </h1>
          <p className="mt-2 text-sm text-ink-soft">
            用更高层的上下文，把工作线、记事和汇报组织在同一件事里。
          </p>
        </div>
        <button
          className="btn btn-accent"
          onClick={() => {
            setEditingProject(null);
            setOpen(true);
          }}
        >
          ＋ 新建项目
        </button>
      </header>

      <div className="mb-6 flex flex-wrap gap-1.5">
        {FILTERS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setFilter(item.key)}
            className={clsx("chip cursor-pointer", filter === item.key && "chip-accent")}
          >
            {item.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <ProjectCardSkeleton count={6} />
      ) : visibleProjects.length === 0 ? (
        <div className="panel p-12 text-center">
          <div className="mb-3 text-sm text-ink-soft">还没有项目。</div>
          <button
            className="btn btn-accent"
            onClick={() => {
              setEditingProject(null);
              setOpen(true);
            }}
          >
            ＋ 新建第一个项目
          </button>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-4">
          {visibleProjects.map((project) => (
            <li key={project.id}>
              <div
                className="panel group flex cursor-pointer flex-col overflow-hidden p-5 transition hover:border-accent/40"
                onClick={() => navigate(`/projects/${project.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigate(`/projects/${project.id}`);
                  }
                }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[16px] font-medium text-ink">{project.name}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <ProjectStatusBadge status={project.status} />
                      {project.owner && <span className="chip">负责人 · {project.owner}</span>}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingProject(project);
                      setOpen(true);
                    }}
                  >
                    编辑
                  </button>
                </div>
                <p className="mt-4 min-h-12 text-sm leading-relaxed text-ink-soft group-hover:text-ink">
                  {project.summary || "还没有摘要。"}
                </p>
                <div className="mt-4 flex flex-wrap gap-2 mono-meta">
                  <span>{project.thread_count ?? 0} 条线程</span>
                  <span>·</span>
                  <span>{project.note_count ?? 0} 条记事</span>
                  <span>·</span>
                  <span>{project.report_count ?? 0} 份汇报</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
