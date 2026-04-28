import clsx from "clsx";
import { CATEGORY_LABEL, CATEGORY_STYLE } from "@/lib/categories";
import type { Category } from "@/lib/types";

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
