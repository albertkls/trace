import userEvent from "@testing-library/user-event";
import { beforeEach, describe, it, expect, vi } from "vitest";
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
  beforeEach(() => {
    const store: Record<string, string> = {};
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: vi.fn((key: string) => store[key] ?? null),
        setItem: vi.fn((key: string, value: string) => {
          store[key] = value;
        }),
        removeItem: vi.fn((key: string) => {
          delete store[key];
        }),
        clear: vi.fn(() => {
          for (const key of Object.keys(store)) delete store[key];
        }),
      },
    });
  });

  it("renders without crashing", () => {
    renderWithProviders(<Home />);
    expect(document.body).toBeTruthy();
  });

  it("recovers from invalid persisted workbench settings", async () => {
    window.localStorage.setItem(
      "trace.workbench.settings.v2",
      JSON.stringify({
        view: "broken-view",
        density: "giant",
        customModules: ["focus", "unknown-module"],
        customLayout: [{ id: "focus", w: 99, h: -4 }],
      })
    );

    renderWithProviders(<Home />);

    expect(await screen.findByRole("button", { name: "完整" })).toBeTruthy();
    expect(document.querySelectorAll(".workbench-module").length).toBeGreaterThan(0);
  });

  it("enters layout edit mode", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Home />);

    await user.click(await screen.findByRole("button", { name: "编辑布局" }));

    expect(await screen.findByRole("button", { name: "完成布局" })).toBeTruthy();
    expect(document.querySelectorAll(".layout-drag-handle").length).toBeGreaterThan(0);
    expect(document.querySelectorAll(".workbench-module-content-locked").length).toBeGreaterThan(0);
  });

  it("opens and closes workbench configuration predictably", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Home />);

    await user.click(await screen.findByRole("button", { name: "配置" }));

    expect(await screen.findByText("工作台配置")).toBeTruthy();
    await user.click(await screen.findByRole("button", { name: "关闭工作台配置" }));

    expect(screen.queryByText("工作台配置")).toBeNull();
  });

  it("opens new workline creation from the timeline", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Home />);

    await user.click(await screen.findByRole("button", { name: "新建工作线" }));

    expect(await screen.findByText("NEW THREAD")).toBeTruthy();
    expect(await screen.findByPlaceholderText("例如：用户权限模块重构")).toBeTruthy();
  });
});
