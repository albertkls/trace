import clsx from "clsx";
import type { ProjectRecommendation } from "@/lib/projectRecommendations";

type Props = {
  recommendations: ProjectRecommendation[];
  selectedProjectId?: string;
  onSelect: (projectId: string) => void;
  label?: string;
  hint?: string;
};

export default function ProjectRecommendationBar({
  recommendations,
  selectedProjectId,
  onSelect,
  label = "推荐项目",
  hint,
}: Props) {
  if (recommendations.length === 0) return null;

  return (
    <div className="rounded-lg border border-line bg-canvas-sunken/40 px-3 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="eyebrow">{label}</span>
        {hint && <span className="mono-meta text-ink-faint">{hint}</span>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {recommendations.map((item) => (
          <button
            key={item.projectId}
            type="button"
            onClick={() => onSelect(item.projectId)}
            className={clsx(
              "chip cursor-pointer text-xs",
              selectedProjectId === item.projectId && "chip-accent"
            )}
            title={item.reasons.join(" · ")}
          >
            {item.projectName}
          </button>
        ))}
      </div>
      <div className="mt-2 space-y-1">
        {recommendations.map((item) => (
          <div key={`${item.projectId}:reason`} className="text-[11px] text-ink-mute">
            <span className="font-medium text-ink-soft">{item.projectName}</span>
            {item.reasons.length > 0 ? ` · ${item.reasons.join(" / ")}` : ""}
          </div>
        ))}
      </div>
    </div>
  );
}
