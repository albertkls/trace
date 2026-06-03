type SkeletonVariant = "text" | "card" | "row" | "avatar";

type Props = {
  variant?: SkeletonVariant;
  count?: number;
  className?: string;
};

export default function Skeleton({ variant = "text", count = 1, className = "" }: Props) {
  const items = Array.from({ length: count }, (_, i) => i);

  const baseClasses = "animate-pulse bg-gray-200 rounded";

  const variantClasses = {
    text: "h-4 w-full",
    card: "h-32 w-full rounded-xl",
    row: "h-14 w-full rounded-lg",
    avatar: "h-10 w-10 rounded-full",
  };

  if (variant === "row" || variant === "card") {
    return (
      <div className="space-y-3">
        {items.map((i) => (
          <div
            key={i}
            className={`${baseClasses} ${variantClasses[variant]} ${className}`}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((i) => (
        <div
          key={i}
          className={`${baseClasses} ${variantClasses[variant]} ${className}`}
        />
      ))}
    </div>
  );
}

export function ThreadListSkeleton({ count = 5 }: Props) {
  return (
    <div className="divide-y divide-line/50">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-4">
          <Skeleton variant="avatar" className="shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton variant="text" className="w-3/4" />
            <Skeleton variant="text" className="w-1/2" />
          </div>
          <Skeleton variant="text" className="w-16" />
        </div>
      ))}
    </div>
  );
}

export function ProjectCardSkeleton({ count = 6 }: Props) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="panel p-5 space-y-3">
          <div className="flex items-center justify-between">
            <Skeleton variant="text" className="w-1/2 h-5" />
            <Skeleton variant="avatar" className="w-6 h-6" />
          </div>
          <Skeleton variant="text" className="w-full" />
          <div className="flex gap-4">
            <Skeleton variant="text" className="w-16" />
            <Skeleton variant="text" className="w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TodoListSkeleton({ count = 4 }: Props) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-lg bg-canvas-subtle">
          <Skeleton variant="avatar" className="shrink-0 w-5 h-5" />
          <Skeleton variant="text" className="flex-1" />
          <Skeleton variant="text" className="w-20" />
        </div>
      ))}
    </div>
  );
}
