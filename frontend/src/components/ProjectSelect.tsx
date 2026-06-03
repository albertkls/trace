import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Project } from "@/lib/types";

type Props = {
  value: string;
  onChange: (value: string) => void;
  emptyLabel?: string;
  disabled?: boolean;
  className?: string;
  includeArchived?: boolean;
};

export default function ProjectSelect({
  value,
  onChange,
  emptyLabel = "未挂项目",
  disabled,
  className = "input w-full",
  includeArchived = true,
}: Props) {
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: (): Promise<Project[]> => api.projects.list().then((r) => r.items),
  });

  const visibleProjects = includeArchived
    ? projects
    : projects.filter((project) => project.status !== "archived");

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
      disabled={disabled}
    >
      <option value="">{emptyLabel}</option>
      {visibleProjects.map((project) => (
        <option key={project.id} value={project.id}>
          {project.name}
        </option>
      ))}
    </select>
  );
}
