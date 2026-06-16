import userEvent from "@testing-library/user-event";
import { beforeEach, describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/test-utils";
import Home from "@/pages/Home";
import { api } from "@/lib/api";
import type { WorkbenchOverview } from "@/lib/types";

function overview(overrides: Partial<WorkbenchOverview> = {}): WorkbenchOverview {
  return {
    date: "2026-06-16",
    generated_at: "2026-06-16T11:40:00+08:00",
    week_label: "2026-W25",
    metrics: [
      { id: "pending", label: "待处理", value: 3, detail: "2 待办 · 1 闪记", tone: "accent" },
      { id: "active_threads", label: "进行中", value: 1, detail: "2 条工作线", tone: "neutral" },
      { id: "projects", label: "项目", value: 1, detail: "1 个需要关注", tone: "iris" },
      { id: "blocked", label: "阻塞", value: 1, detail: "需要解除依赖", tone: "stop" },
    ],
    focus_items: [
      {
        id: "inbox",
        label: "收件箱待归档",
        detail: "1 条闪记需要归入工作线",
        to: "/inbox",
        tone: "accent",
      },
      {
        id: "blocked-threads",
        label: "工作线阻塞",
        detail: "1 条工作线等待下一步",
        to: "/threads",
        tone: "stop",
      },
    ],
    workline_columns: [
      {
        id: "active",
        title: "进行中",
        count: 1,
        items: [
          {
            id: "th_1",
            title: "设计系统",
            project: "SRM",
            project_id: "prj_1",
            owner: null,
            status: "active",
            started_at: "2026-06-10",
            last_active_at: "2026-06-15T08:00:00",
            summary: "",
            pinned: 1,
            evidence_count: 2,
          },
        ],
      },
      {
        id: "blocked",
        title: "已阻塞",
        count: 1,
        items: [
          {
            id: "th_2",
            title: "研发物料功耗确认",
            project: "SRM",
            project_id: "prj_1",
            owner: null,
            status: "blocked",
            started_at: "2026-06-11",
            last_active_at: "2026-06-15T09:00:00",
            summary: "",
            pinned: 0,
            evidence_count: 1,
          },
        ],
      },
      { id: "done", title: "已完成", count: 0, items: [] },
    ],
    summary: [
      { id: "inputs", label: "输入", text: "1 条闪记、2 条工作线、2 个待办正在等待处理。", tone: "accent" },
      { id: "risk", label: "风险", text: "1 条工作线阻塞，建议先拆出下一步。", tone: "stop" },
      { id: "report", label: "汇报", text: "本周尚未生成周报，可先积累今日证据。", tone: "accent" },
    ],
    week_plan: {
      days: [
        { date: "2026-06-16", day: "16", weekday: "周二", count: 1, is_today: true },
        { date: "2026-06-17", day: "17", weekday: "周三", count: 0, is_today: false },
        { date: "2026-06-18", day: "18", weekday: "周四", count: 0, is_today: false },
        { date: "2026-06-19", day: "19", weekday: "周五", count: 0, is_today: false },
        { date: "2026-06-20", day: "20", weekday: "周六", count: 0, is_today: false },
        { date: "2026-06-21", day: "21", weekday: "周日", count: 0, is_today: false },
        { date: "2026-06-22", day: "22", weekday: "周一", count: 0, is_today: false },
      ],
      items: [
        {
          id: "td_1",
          text: "组件库优化",
          label: "组件库优化",
          due_date: "2026-06-16",
          thread_id: "th_1",
          thread_title: "设计系统",
          project: "SRM",
          tone: "moss",
        },
      ],
      due_today_count: 1,
      unplanned_count: 0,
    },
    threads_for_picker: [
      { id: "th_1", title: "设计系统", status: "active", project: "SRM" },
      { id: "th_2", title: "研发物料功耗确认", status: "blocked", project: "SRM" },
    ],
    ...overrides,
  };
}

vi.mock("@/lib/api", () => ({
  api: {
    workbench: { overview: vi.fn() },
    threads: {
      list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      create: vi.fn().mockResolvedValue({ id: "th_new" }),
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
    vi.mocked(api.workbench.overview).mockResolvedValue(overview());
    vi.mocked(api.threads.list).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(api.reports.list).mockResolvedValue([]);
    vi.mocked(api.projects.list).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(api.todos.create).mockResolvedValue({} as never);
    vi.mocked(api.todos.patch).mockResolvedValue({} as never);
    vi.mocked(api.todos.remove).mockResolvedValue(undefined);
  });

  it("renders the fixed action workbench", async () => {
    renderWithProviders(<Home />);

    expect(await screen.findByText("今天要推进什么？")).toBeTruthy();
    expect((await screen.findAllByText("工作线看板")).length).toBeGreaterThan(0);
    expect(screen.getByText("本周计划")).toBeTruthy();
    expect(screen.getByText("收件箱待归档")).toBeTruthy();
    expect(screen.getAllByText("研发物料功耗确认").length).toBeGreaterThan(0);
  });

  it("does not render removed view selection or configuration controls", async () => {
    renderWithProviders(<Home />);

    expect(await screen.findByText("今天要推进什么？")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "完整" })).toBeNull();
    expect(screen.queryByRole("button", { name: "编辑布局" })).toBeNull();
    expect(screen.queryByRole("button", { name: "配置" })).toBeNull();
    expect(screen.queryByText("工作台配置")).toBeNull();
    expect(screen.queryByText("CUSTOM WORKSPACE")).toBeNull();
    expect(document.querySelector(".layout-drag-handle")).toBeNull();
  });

  it("opens new workline creation from the planner", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Home />);

    await user.click(await screen.findByRole("button", { name: "新建工作线" }));

    expect(await screen.findByText("NEW THREAD")).toBeTruthy();
    expect(await screen.findByPlaceholderText("例如：用户权限模块重构")).toBeTruthy();
  });

  it("edits a planner task", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Home />);

    await user.click(await screen.findByRole("button", { name: "编辑任务：组件库优化" }));
    const title = await screen.findByLabelText("任务标题");
    await user.clear(title);
    await user.type(title, "组件库验收");
    await user.click(screen.getByRole("button", { name: "保存任务" }));

    await waitFor(() => {
      expect(api.todos.patch).toHaveBeenCalledWith(
        "td_1",
        expect.objectContaining({ text: "组件库验收", due_date: "2026-06-16", thread_id: "th_1" })
      );
    });
  });

  it("creates a planner task", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Home />);

    await user.click(await screen.findByRole("button", { name: "新建任务" }));
    await user.type(await screen.findByLabelText("任务标题"), "整理周会行动项");
    await user.click(screen.getByRole("button", { name: "保存任务" }));

    await waitFor(() => {
      expect(api.todos.create).toHaveBeenCalledWith(
        expect.objectContaining({ text: "整理周会行动项", thread_id: null })
      );
    });
  });
});
