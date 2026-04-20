import clsx from "clsx";
import type { Category } from "@/lib/types";

const CATEGORY_LABEL: Record<Category, string> = {
  progress: "进展",
  decision: "决定",
  risk: "风险",
  plan: "计划",
  support: "协同",
};

const CATEGORY_STYLE: Record<Category, string> = {
  progress: "border-signal-go/40 bg-signal-go/10 text-signal-go",
  decision: "border-accent/40 bg-accent/10 text-accent",
  risk: "border-signal-stop/40 bg-signal-stop/10 text-signal-stop",
  plan: "border-signal-hold/40 bg-signal-hold/10 text-signal-hold",
  support: "border-iris/40 bg-iris/10 text-iris",
};

export function CategoryChip({ category }: { category: Category }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-pill border px-2 py-0.5 text-[11px] font-medium",
        CATEGORY_STYLE[category]
      )}
    >
      <span className="font-mono text-[9px] opacity-60">◆</span>
      {CATEGORY_LABEL[category]}
    </span>
  );
}

export function EvidenceRef({
  index,
  title,
  date,
}: {
  index: number;
  title?: string;
  date?: string | null;
}) {
  return (
    <span
      title={[date, title].filter(Boolean).join(" · ")}
      className="inline-flex h-5 min-w-[22px] cursor-pointer items-center justify-center rounded-pill border border-line bg-canvas-sunken px-1.5 font-mono text-[11px] font-medium text-ink-soft transition hover:border-accent hover:text-accent"
    >
      {index}
    </span>
  );
}
