import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import Skeleton, {
  ThreadListSkeleton,
  ProjectCardSkeleton,
  TodoListSkeleton,
} from "@/components/Skeleton";

describe("Skeleton", () => {
  it("renders one skeleton by default", () => {
    render(<Skeleton />);
    const items = document.querySelectorAll(".animate-pulse");
    expect(items.length).toBe(1);
  });

  it("renders correct number of skeletons", () => {
    render(<Skeleton count={3} />);
    const items = document.querySelectorAll(".animate-pulse");
    expect(items.length).toBe(3);
  });

  it('variant="row" uses row style', () => {
    render(<Skeleton variant="row" count={1} />);
    const items = document.querySelectorAll(".h-14");
    expect(items.length).toBeGreaterThan(0);
  });

  it('variant="card" uses card style', () => {
    render(<Skeleton variant="card" count={1} />);
    const items = document.querySelectorAll(".h-32");
    expect(items.length).toBeGreaterThan(0);
  });

  it('variant="text" uses text style', () => {
    render(<Skeleton variant="text" count={1} />);
    const items = document.querySelectorAll(".h-4");
    expect(items.length).toBeGreaterThan(0);
  });

  it('variant="avatar" uses avatar style', () => {
    render(<Skeleton variant="avatar" count={1} />);
    const items = document.querySelectorAll(".h-10");
    expect(items.length).toBeGreaterThan(0);
  });

  it("applies custom className", () => {
    render(<Skeleton className="my-custom-class" count={1} />);
    const items = document.querySelectorAll(".my-custom-class");
    expect(items.length).toBe(1);
  });

  it("renders with count=0 (empty)", () => {
    render(<Skeleton count={0} />);
    const items = document.querySelectorAll(".animate-pulse");
    expect(items.length).toBe(0);
  });
});

describe("ThreadListSkeleton", () => {
  it("renders default 5 rows", () => {
    render(<ThreadListSkeleton />);
    // Each row has avatar + 2 text + 1 text = 4 skeleton items; 5 rows * 4 = 20
    const items = document.querySelectorAll(".animate-pulse");
    expect(items.length).toBe(20);
  });

  it("respects custom count", () => {
    render(<ThreadListSkeleton count={3} />);
    const items = document.querySelectorAll(".animate-pulse");
    expect(items.length).toBe(12); // 3 * 4
  });

  it("contains avatar skeletons", () => {
    render(<ThreadListSkeleton count={1} />);
    const avatars = document.querySelectorAll(".h-10");
    expect(avatars.length).toBeGreaterThan(0);
  });
});

describe("ProjectCardSkeleton", () => {
  it("renders default 6 cards", () => {
    render(<ProjectCardSkeleton />);
    // Each card has 5 skeletons (title text + body text + 2 meta texts + icon avatar); 6 * 5 = 30
    const items = document.querySelectorAll(".animate-pulse");
    expect(items.length).toBe(30);
  });

  it("respects custom count", () => {
    render(<ProjectCardSkeleton count={2} />);
    const items = document.querySelectorAll(".animate-pulse");
    expect(items.length).toBe(10); // 2 * 5
  });

  it("contains card panels", () => {
    render(<ProjectCardSkeleton count={1} />);
    const panels = document.querySelectorAll(".panel");
    expect(panels.length).toBe(1);
  });
});

describe("TodoListSkeleton", () => {
  it("renders default 4 items", () => {
    render(<TodoListSkeleton />);
    // Each row has 3 skeletons (checkbox + text + text); 4 * 3 = 12
    const items = document.querySelectorAll(".animate-pulse");
    expect(items.length).toBe(12);
  });

  it("respects custom count", () => {
    render(<TodoListSkeleton count={2} />);
    const items = document.querySelectorAll(".animate-pulse");
    expect(items.length).toBe(6); // 2 * 3
  });

  it("renders with subtle background rows", () => {
    render(<TodoListSkeleton count={1} />);
    const bg = document.querySelectorAll(".bg-canvas-subtle");
    expect(bg.length).toBe(1);
  });
});
