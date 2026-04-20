import clsx from "clsx";
import type { ThreadStatus } from "@/lib/types";

const MAP: Record<ThreadStatus, { dot: string; label: string }> = {
  active: { dot: "dot-go", label: "推进中" },
  blocked: { dot: "dot-stop", label: "阻塞" },
  done: { dot: "dot-mute", label: "已完成" },
  archived: { dot: "dot-mute", label: "已归档" },
};

export default function StatusDot({
  status,
  withLabel = true,
}: {
  status: ThreadStatus | string;
  withLabel?: boolean;
}) {
  const meta = MAP[status as ThreadStatus] ?? {
    dot: "dot-mute",
    label: "未知状态",
  };
  return (
    <span className="inline-flex items-center gap-2 text-xs text-ink-soft">
      <span className={clsx("dot", meta.dot)} />
      {withLabel && <span className="mono-meta text-ink-soft">{meta.label}</span>}
    </span>
  );
}
