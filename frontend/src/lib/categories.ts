import type { Category } from "./types";

export const CATEGORY_OPTIONS: Array<{ value: Category; label: string }> = [
  { value: "progress", label: "进展" },
  { value: "decision", label: "决定" },
  { value: "risk", label: "风险" },
  { value: "plan", label: "计划" },
  { value: "support", label: "协同" },
];

export const CATEGORY_LABEL: Record<Category, string> = Object.fromEntries(
  CATEGORY_OPTIONS.map((option) => [option.value, option.label])
) as Record<Category, string>;

export const CATEGORY_STYLE: Record<Category, string> = {
  progress: "border-signal-go/40 bg-signal-go/10 text-signal-go",
  decision: "border-accent/40 bg-accent/10 text-accent",
  risk: "border-signal-stop/40 bg-signal-stop/10 text-signal-stop",
  plan: "border-signal-hold/40 bg-signal-hold/10 text-signal-hold",
  support: "border-iris/40 bg-iris/10 text-iris",
};

export const CATEGORY_TIMELINE_MARKER_STYLE: Record<Category, string> = {
  progress: "border-signal-go/50 text-signal-go",
  decision: "border-accent/50 text-accent",
  risk: "border-signal-stop/50 text-signal-stop",
  plan: "border-signal-hold/50 text-signal-hold",
  support: "border-iris/50 text-iris",
};
