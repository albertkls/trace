import clsx from "clsx";
import type { ProjectStatus } from "@/lib/types";

const STATUS_LABEL: Record<ProjectStatus, string> = {
  active: "进行中",
  paused: "暂停",
  done: "完成",
  archived: "归档",
};

const STATUS_STYLE: Record<ProjectStatus, string> = {
  active: "chip-accent",
  paused: "",
  done: "chip-go",
  archived: "",
};

export default function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span className={clsx("chip", STATUS_STYLE[status])}>
      {STATUS_LABEL[status]}
    </span>
  );
}
