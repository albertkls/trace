import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/test-utils";
import Home from "@/pages/Home";

vi.mock("@/lib/api", () => ({
  api: {
    threads: { list: vi.fn().mockResolvedValue({ items: [] }) },
    reports: { list: vi.fn().mockResolvedValue([]) },
    projects: { list: vi.fn().mockResolvedValue({ items: [] }) },
    todos: { list: vi.fn().mockResolvedValue([]) },
    captures: { inbox: vi.fn().mockResolvedValue([]) },
    activity: {
      daily: vi.fn().mockResolvedValue({
        date: "2026-06-14",
        capture_count: 0,
        todo_done_count: 0,
        active_threads: [],
      }),
    },
    updater: { check: vi.fn().mockResolvedValue({ update_available: false }) },
  },
}));

vi.mock("@/lib/quickCapture", () => ({
  useQuickCapture: () => ({ open: vi.fn() }),
}));

describe("Home", () => {
  it("renders without crashing", () => {
    renderWithProviders(<Home />);
    expect(document.body).toBeTruthy();
  });

  it("enters layout edit mode", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Home />);

    await user.click(await screen.findByRole("button", { name: "编辑布局" }));

    expect(await screen.findByRole("button", { name: "完成布局" })).toBeTruthy();
    expect(document.querySelectorAll(".layout-drag-handle").length).toBeGreaterThan(0);
  });
});
