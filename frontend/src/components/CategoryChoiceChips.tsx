import clsx from "clsx";
import { CATEGORY_OPTIONS } from "@/lib/categories";
import type { Category } from "@/lib/types";

type Props = {
  value: Category;
  onChange: (value: Category) => void;
  className?: string;
  buttonClassName?: string;
};

export default function CategoryChoiceChips({
  value,
  onChange,
  className,
  buttonClassName,
}: Props) {
  return (
    <div className={clsx("flex flex-wrap gap-1.5", className)}>
      {CATEGORY_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={clsx(
            "chip cursor-pointer",
            value === option.value && "chip-accent",
            buttonClassName
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
