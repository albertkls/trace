import clsx from "clsx";
import type { Thread } from "@/lib/types";

type Props = {
  threads: Thread[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  emptyText?: string;
  className?: string;
  buttonClassName?: string;
};

export default function ThreadMultiSelectChips({
  threads,
  selectedIds,
  onToggle,
  emptyText = "暂无可用线程",
  className,
  buttonClassName,
}: Props) {
  if (threads.length === 0) {
    return <span className="text-xs text-ink-faint">{emptyText}</span>;
  }

  return (
    <div className={clsx("flex flex-wrap gap-1.5", className)}>
      {threads.map((thread) => (
        <button
          key={thread.id}
          type="button"
          onClick={() => onToggle(thread.id)}
          className={clsx(
            "chip cursor-pointer text-xs",
            selectedIds.includes(thread.id) && "chip-accent",
            buttonClassName
          )}
          title={thread.title}
        >
          {thread.title}
        </button>
      ))}
    </div>
  );
}
