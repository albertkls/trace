import userEvent from "@testing-library/user-event";
import { beforeEach, describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/test-utils";
import Home from "@/pages/Home";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  api: {
    threads: {
      list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      patch: vi.fn().mockResolvedValue({}),
    },
    reports: { list: vi.fn().mockResolvedValue([]) },
    projects: { list: vi.fn().mockResolvedValue({ items: [] }) },
    todos: {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      patch: vi.fn().mockResolvedValue({}),
      remove: vi.fn().mockResolvedValue(undefined),
    },
    captures: { inbox: vi.fn().mockResolvedValue([]) },
    activity: {
      daily: vi.fn().mockResolvedValue({
        date: "2026-06-14",
        evidence: [],
        completed_todos: [],
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
    vi.mocked(api.threads.list).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(api.threads.patch).mockResolvedValue({} as never);
    vi.mocked(api.reports.list).mockResolvedValue([]);
    vi.mocked(api.projects.list).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(api.todos.list).mockResolvedValue([]);
    vi.mocked(api.todos.create).mockResolvedValue({} as never);
    vi.mocked(api.todos.patch).mockResolvedValue({} as never);
    vi.mocked(api.todos.remove).mockResolvedValue(undefined);
    vi.mocked(api.captures.inbox).mockResolvedValue([]);
    vi.mocked(api.activity.daily).mockResolvedValue({
      date: "2026-06-14",
      evidence: [],
      completed_todos: [],
      capture_count: 0,
      todo_done_count: 0,
      active_threads: [],
    });
    vi.mocked(api.updater.check).mockResolvedValue({ update_available: false } as never);

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

  it("edits a spatial timeline work block", async () => {
    const user = userEvent.setup();
    vi.mocked(api.threads.list).mockResolvedValue({
      items: [
        {
          id: "th_1",
          title: "设计系统",
          project: "SRM",
          owner: null,
          status: "active",
          started_at: "2026-06-10",
          last_active_at: "2026-06-15T08:00:00",
          summary: "",
          pinned: 0,
          evidence_count: 0,
        },
      ],
      total: 1,
    });
    vi.mocked(api.todos.list).mockResolvedValue([
      {
        id: "td_1",
        thread_id: "th_1",
        thread_title: "设计系统",
        text: "组件库优化",
        due_date: "2026-06-15",
        done: 0,
        done_at: null,
        created_at: "2026-06-15T08:00:00",
      },
    ]);

    renderWithProviders(<Home />);

    await user.click(await screen.findByRole("button", { name: "编辑工作块：组件库优化" }));
    const title = await screen.findByLabelText("工作块标题");
    await user.clear(title);
    await user.type(title, "组件库验收");
    await user.click(screen.getByRole("button", { name: "保存工作块" }));

    await waitFor(() => {
      expect(api.todos.patch).toHaveBeenCalledWith(
        "td_1",
        expect.objectContaining({ text: "组件库验收", due_date: "2026-06-15", thread_id: "th_1" })
      );
    });
  });

  it("creates a spatial timeline work block", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Home />);

    await user.click(await screen.findByRole("button", { name: "新建工作块" }));
    await user.type(await screen.findByLabelText("工作块标题"), "整理周会行动项");
    await user.click(screen.getByRole("button", { name: "保存工作块" }));

    await waitFor(() => {
      expect(api.todos.create).toHaveBeenCalledWith(
        expect.objectContaining({ text: "整理周会行动项", thread_id: null })
      );
    });
  });

  it("shows real thread data in the inspector instead of hardcoded placeholders", async () => {
    vi.mocked(api.threads.list).mockResolvedValue({
      items: [
        {
          id: "th_real",
          title: "真实工作线",
          project: "真实项目",
          project_id: "prj_real",
          owner: "王五",
          status: "blocked",
          started_at: "2026-06-01",
          last_active_at: "2026-06-16T09:30:00",
          summary: "真实目标来自工作线摘要",
          pinned: 1,
          evidence_count: 4,
        },
      ],
      total: 1,
    });
    vi.mocked(api.projects.list).mockResolvedValue({
      items: [
        {
          id: "prj_real",
          name: "真实项目",
          status: "active",
          owner: null,
          summary: "",
          color: null,
          created_at: "2026-06-01T00:00:00",
          updated_at: "2026-06-16T09:30:00",
        },
      ],
      total: 1,
    });

    renderWithProviders(<Home />);

    expect(await screen.findByDisplayValue("真实工作线")).toBeTruthy();
    expect(await screen.findByDisplayValue("王五")).toBeTruthy();
    expect(await screen.findByDisplayValue("真实目标来自工作线摘要")).toBeTruthy();
    expect(screen.queryByText("林墨")).toBeNull();
    expect(screen.queryByText("68%")).toBeNull();
    expect(screen.queryByText("完成设计系统规划与核心组件建设，提升设计效率。")).toBeNull();
  });

  it("saves inspector edits to the thread API", async () => {
    const user = userEvent.setup();
    vi.mocked(api.threads.list).mockResolvedValue({
      items: [
        {
          id: "th_save",
          title: "原工作线",
          project: null,
          owner: null,
          status: "active",
          started_at: "2026-06-10",
          last_active_at: "2026-06-16T09:30:00",
          summary: "",
          pinned: 0,
          evidence_count: 0,
        },
      ],
      total: 1,
    });

    renderWithProviders(<Home />);

    const title = await screen.findByLabelText("标题");
    expect(await screen.findByText("未关联项目")).toBeTruthy();
    await user.clear(title);
    await user.type(title, "已编辑工作线");
    await user.type(screen.getByLabelText("负责人"), "赵六");
    await user.type(screen.getByLabelText("摘要 / 目标"), "这是真实保存的目标");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(api.threads.patch).toHaveBeenCalledWith(
        "th_save",
        expect.objectContaining({
          title: "已编辑工作线",
          owner: "赵六",
          summary: "这是真实保存的目标",
          status: "active",
          started_at: "2026-06-10",
          pinned: false,
        })
      );
    });
  });

  it("keeps inspector edits client-side when the start date is empty", async () => {
    const user = userEvent.setup();
    vi.mocked(api.threads.list).mockResolvedValue({
      items: [
        {
          id: "th_date",
          title: "日期校验工作线",
          project: null,
          owner: null,
          status: "active",
          started_at: "2026-06-10",
          last_active_at: "2026-06-16T09:30:00",
          summary: "",
          pinned: 0,
          evidence_count: 0,
        },
      ],
      total: 1,
    });

    renderWithProviders(<Home />);

    vi.mocked(api.threads.patch).mockClear();
    await user.clear(await screen.findByLabelText("开始日期"));
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByText("开始日期不能为空")).toBeTruthy();
    expect(api.threads.patch).not.toHaveBeenCalled();
  });
});
