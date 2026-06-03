import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";

const ITEM_HEIGHT = 64;
const VIRTUALIZATION_THRESHOLD = 20;

export function useVirtualList<T>(items: T[], containerHeight: number = 600) {
  const parentRef = useRef<HTMLUListElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 5,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  const enableVirtualization = items.length > VIRTUALIZATION_THRESHOLD;

  return {
    parentRef,
    virtualizer,
    virtualItems,
    totalSize,
    enableVirtualization,
    containerHeight,
  };
}
