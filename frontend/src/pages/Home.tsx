import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import {
  Activity,
  Archive,
  Bot,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  GitBranch,
  Inbox,
  LayoutDashboard,
  ListChecks,
  NotebookText,
  PanelRight,
  Plus,
  Radar,
  RotateCcw,
  Save,
  Search,
  Settings2,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CategoryChip } from "@/components/EvidenceChip";
import Skeleton from "@/components/Skeleton";
import StatusDot from "@/components/StatusDot";
import { api } from "@/lib/api";
import { isoWeekLabel, toISODate } from "@/lib/periods";
import { useQuickCapture } from "@/lib/quickCapture";
import { todoPreview } from "@/lib/richText";
import type { Project, ReportSummary, Thread, Todo } from "@/lib/types";

type ViewPreset = "minimal" | "balanced" | "complete" | "custom";
type Density = "compact" | "standard" | "roomy";
type ModuleId =
  | "focus"
  | "threads"
  | "projects"
  | "synthesis"
  | "todos"
  | "captures"
  | "timeline"
  | "reports"
  | "notes"
  | "attachments"
  | "search"
  | "updates"
  | "risks";

type WorkbenchSettings = {
  view: ViewPreset;
  density: Density;
  customName: string;
  customModules: ModuleId[];
};

const SETTINGS_KEY = "trace.workbench.settings.v2";

const VIEW_LABEL: Record<ViewPreset, string> = {
  minimal: "简洁",
  balanced: "中等",
  complete: "完整",
  custom: "自定义",
};

const DENSITY_LABEL: Record<Density, string> = {
  compact: "紧凑",
  standard: "标准",
  roomy: "宽松",
};

const PRESET_MODULES: Record<ViewPreset, ModuleId[]> = {
  minimal: ["focus", "synthesis", "todos", "risks"],
  balanced: ["focus", "threads", "projects", "synthesis", "todos", "captures", "timeline"],
  complete: [
    "focus",
    "threads",
    "projects",
    "synthesis",
    "todos",
    "captures",
    "timeline",
    "reports",
    "notes",
    "attachments",
    "search",
    "updates",
    "risks",
  ],
  custom: ["focus", "threads", "projects", "synthesis", "todos", "captures", "timeline"],
};

const MODULES: {
  id: ModuleId;
  label: string;
  configLabel: string;
  icon: LucideIcon;
  span?: string;
}[] = [
  { id: "focus", label: "今日焦点", configLabel: "今日焦点", icon: Radar, span: "xl:col-span-5" },
  {
    id: "threads",
    label: "工作线动态",
    configLabel: "工作线动态",
    icon: GitBranch,
    span: "xl:col-span-7",
  },
  {
    id: "projects",
    label: "项目健康",
    configLabel: "项目健康",
    icon: Activity,
    span: "xl:col-span-6",
  },
  {
    id: "synthesis",
    label: "AI 今日汇总",
    configLabel: "AI 汇总",
    icon: Bot,
    span: "xl:col-span-6",
  },
  { id: "todos", label: "待办雷达", configLabel: "待办", icon: ListChecks, span: "xl:col-span-4" },
  {
    id: "captures",
    label: "最近捕捉",
    configLabel: "收件箱闪记",
    icon: Inbox,
    span: "xl:col-span-4",
  },
  {
    id: "timeline",
    label: "时间线脉冲",
    configLabel: "时间线",
    icon: CalendarClock,
    span: "xl:col-span-4",
  },
  {
    id: "reports",
    label: "周报草稿",
    configLabel: "周报草稿",
    icon: FileText,
    span: "xl:col-span-4",
  },
  {
    id: "notes",
    label: "记事索引",
    configLabel: "笔记",
    icon: NotebookText,
    span: "xl:col-span-4",
  },
  {
    id: "attachments",
    label: "附件面板",
    configLabel: "附件",
    icon: Archive,
    span: "xl:col-span-4",
  },
  { id: "search", label: "最近搜索", configLabel: "最近搜索", icon: Search, span: "xl:col-span-4" },
  {
    id: "updates",
    label: "更新提醒",
    configLabel: "更新提醒",
    icon: Sparkles,
    span: "xl:col-span-4",
  },
  {
    id: "risks",
    label: "阻塞风险",
    configLabel: "阻塞风险",
    icon: ShieldAlert,
    span: "xl:col-span-4",
  },
];

const DEFAULT_SETTINGS: WorkbenchSettings = {
  view: "complete",
  density: "standard",
  customName: "我的工作台",
  customModules: PRESET_MODULES.custom,
};

function yesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toISODate(d);
}

function loadSettings(): WorkbenchSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<WorkbenchSettings>;
    return {
      view: parsed.view ?? DEFAULT_SETTINGS.view,
      density: parsed.density ?? DEFAULT_SETTINGS.density,
      customName: parsed.customName ?? DEFAULT_SETTINGS.customName,
      customModules: parsed.customModules?.length
        ? parsed.customModules
        : DEFAULT_SETTINGS.customModules,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export default function Home() {
  const { open: openCapture } = useQuickCapture();
  const [settings, setSettings] = useState<WorkbenchSettings>(() => loadSettings());
  const [configOpen, setConfigOpen] = useState(true);

  const { data: threads = [], isLoading: threadsLoading } = useQuery({
    queryKey: ["threads"],
    queryFn: (): Promise<Thread[]> => api.threads.list().then((r) => r.items),
  });
  const { data: reports = [] } = useQuery({
    queryKey: ["reports"],
    queryFn: (): Promise<ReportSummary[]> => api.reports.list(),
  });
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: (): Promise<Project[]> => api.projects.list().then((r) => r.items),
  });
  const { data: inbox = [] } = useQuery({
    queryKey: ["inbox"],
    queryFn: api.captures.inbox,
  });
  const { data: todos = [] } = useQuery({
    queryKey: ["todos", "open"],
    queryFn: (): Promise<Todo[]> => api.todos.list(false),
  });
  const { data: yesterday } = useQuery({
    queryKey: ["activity", yesterdayISO()],
    queryFn: () => api.activity.daily(yesterdayISO()),
  });
  const { data: updateInfo } = useQuery({
    queryKey: ["updater", "check"],
    queryFn: api.updater.check,
    retry: 1,
    staleTime: 15 * 60 * 1000,
  });

  useEffect(() => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  const activeModules =
    settings.view === "custom" ? settings.customModules : PRESET_MODULES[settings.view];
  const blockedThreads = threads.filter((thread) => thread.status === "blocked");
  const draftReport = reports.find((report) => report.status === "draft");
  const projectAlerts = projects
    .filter((project) =>
      ["blocked", "quiet", "reporting"].includes(project.health?.health_status ?? "")
    )
    .sort((a, b) => {
      const rank = { blocked: 0, quiet: 1, reporting: 2, active: 3, healthy: 4 };
      return (
        rank[a.health?.health_status ?? "healthy"] - rank[b.health?.health_status ?? "healthy"]
      );
    });
  const today = new Date();
  const weekLabel = isoWeekLabel(today);
  const iso = toISODate(today);

  const focusItems = useMemo(() => {
    const items: {
      label: string;
      detail: string;
      to?: string;
      tone?: "accent" | "warn" | "stop";
    }[] = [];
    if (inbox.length > 0) {
      items.push({
        label: "收件箱待归档",
        detail: `${inbox.length} 条闪记需要归入工作线`,
        to: "/inbox",
        tone: "accent",
      });
    }
    if (blockedThreads.length > 0) {
      items.push({
        label: "工作线阻塞",
        detail: `${blockedThreads.length} 条线索等待下一步`,
        to: "/threads",
        tone: "stop",
      });
    }
    if (draftReport) {
      items.push({
        label: "周报草稿",
        detail: `「${draftReport.period_label}」可以继续完善`,
        to: `/reports/${draftReport.id}`,
        tone: "warn",
      });
    } else {
      items.push({
        label: "周报尚未启动",
        detail: "本周还没有生成汇报草稿",
        to: "/reports",
      });
    }
    for (const project of projectAlerts.slice(0, 2)) {
      items.push({
        label: project.name,
        detail: project.health?.next_action ?? "需要检查项目状态",
        to: `/projects/${project.id}`,
        tone: project.health?.health_status === "blocked" ? "stop" : "warn",
      });
    }
    if (items.length === 0) {
      items.push({ label: "系统清爽", detail: "当前没有紧急动作，可以开始写一笔。" });
    }
    return items.slice(0, 4);
  }, [blockedThreads.length, draftReport, inbox.length, projectAlerts]);

  const healthCounts = {
    blocked: projects.filter((project) => project.health?.health_status === "blocked").length,
    quiet: projects.filter((project) => project.health?.health_status === "quiet").length,
    reporting: projects.filter((project) => project.health?.health_status === "reporting").length,
    active: projects.filter((project) =>
      ["active", "healthy"].includes(project.health?.health_status ?? "healthy")
    ).length,
  };

  const moduleVisible = (id: ModuleId) => activeModules.includes(id);
  const updateSettings = (patch: Partial<WorkbenchSettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  };
  const toggleCustomModule = (id: ModuleId) => {
    setSettings((current) => {
      const currentModules = new Set(current.customModules);
      if (currentModules.has(id)) {
        currentModules.delete(id);
      } else {
        currentModules.add(id);
      }
      return {
        ...current,
        view: "custom",
        customModules: MODULES.filter((module) => currentModules.has(module.id)).map(
          (module) => module.id
        ),
      };
    });
  };
  const createCustomView = () => {
    const name = window.prompt("给自定义视图命名", settings.customName);
    if (!name?.trim()) return;
    setSettings((current) => ({
      ...current,
      view: "custom",
      customName: name.trim(),
      customModules: activeModules,
    }));
    setConfigOpen(true);
  };
  const resetLayout = () => setSettings(DEFAULT_SETTINGS);

  return (
    <div className={clsx("workbench-page", `density-${settings.density}`)}>
      <div className="mx-auto flex w-full max-w-[1500px] gap-5 px-5 py-5">
        <section className="min-w-0 flex-1">
          <header className="mb-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="dot-pulse" />
                  <span className="eyebrow">COMMAND WORKBENCH · {weekLabel}</span>
                </div>
                <h1 className="mt-3 font-display text-[34px] font-semibold leading-tight text-ink">
                  今日指挥台
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-soft">
                  把闪记、工作线、项目健康、待办和汇报压缩到一个可配置工作台里。
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button className="btn" onClick={() => setConfigOpen((value) => !value)}>
                  <PanelRight size={15} />
                  工作台配置
                </button>
                <button className="btn btn-accent" onClick={openCapture}>
                  <Plus size={15} />
                  写一笔
                </button>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-canvas-raised/45 p-2 shadow-chip backdrop-blur-xl">
              <div className="flex flex-wrap items-center gap-1">
                {(["minimal", "balanced", "complete", "custom"] as ViewPreset[]).map((view) => (
                  <button
                    key={view}
                    className={clsx(
                      "rounded-md px-3 py-1.5 text-sm transition",
                      settings.view === view
                        ? "bg-accent text-accent-ink shadow-glow"
                        : "text-ink-soft hover:bg-canvas-contrast hover:text-ink"
                    )}
                    onClick={() => updateSettings({ view })}
                  >
                    {view === "custom" ? settings.customName || VIEW_LABEL[view] : VIEW_LABEL[view]}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button className="btn btn-ghost" onClick={createCustomView}>
                  <Plus size={14} />
                  新建视图
                </button>
                <button className="btn btn-ghost" onClick={() => setConfigOpen(true)}>
                  <Save size={14} />
                  保存布局
                </button>
                <span className="hidden rounded-md border border-line bg-canvas-sunken px-2.5 py-1.5 text-xs text-ink-mute sm:inline-flex">
                  {iso}
                </span>
              </div>
            </div>
          </header>

          <section className="mb-5 grid gap-3 md:grid-cols-4">
            <SignalTile icon={Inbox} label="闪记" value={inbox.length} tone="accent" />
            <SignalTile icon={GitBranch} label="工作线" value={threads.length} tone="neutral" />
            <SignalTile icon={LayoutDashboard} label="项目" value={projects.length} tone="iris" />
            <SignalTile icon={ShieldAlert} label="阻塞" value={blockedThreads.length} tone="stop" />
          </section>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            {moduleVisible("focus") && (
              <WorkbenchPanel
                icon={Radar}
                title="今日焦点"
                meta={`${focusItems.length} actions`}
                className={moduleMeta("focus").span}
              >
                <div className="divide-y divide-line/60">
                  {focusItems.map((item, index) => (
                    <ActionRow
                      key={`${item.label}-${index}`}
                      index={index + 1}
                      label={item.label}
                      detail={item.detail}
                      to={item.to}
                      tone={item.tone}
                    />
                  ))}
                </div>
              </WorkbenchPanel>
            )}

            {moduleVisible("threads") && (
              <WorkbenchPanel
                icon={GitBranch}
                title="工作线动态"
                meta={`${threads.length} threads`}
                className={moduleMeta("threads").span}
              >
                {threadsLoading ? (
                  <div className="p-4">
                    <Skeleton variant="text" count={5} />
                  </div>
                ) : threads.length === 0 ? (
                  <EmptyPanel text="还没有活跃工作线。写一笔后可以从收件箱归入线程。" />
                ) : (
                  <div className="divide-y divide-line/60">
                    {threads.slice(0, 6).map((thread) => (
                      <Link
                        key={thread.id}
                        to={`/threads/${thread.id}`}
                        className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition hover:bg-canvas-contrast/45"
                      >
                        <StatusDot status={thread.status} withLabel={false} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-ink group-hover:text-accent">
                              {thread.title}
                            </span>
                            {thread.pinned ? <span className="chip chip-accent">置顶</span> : null}
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-[11px] text-ink-mute">
                            <span>{thread.project || "未归项目"}</span>
                            <span>·</span>
                            <span>{thread.evidence_count ?? 0} 条证据</span>
                          </div>
                        </div>
                        <ChevronRight size={15} className="text-ink-mute group-hover:text-accent" />
                      </Link>
                    ))}
                  </div>
                )}
              </WorkbenchPanel>
            )}

            {moduleVisible("projects") && (
              <WorkbenchPanel
                icon={Activity}
                title="项目健康"
                meta={`${projects.length} projects`}
                className={moduleMeta("projects").span}
              >
                <div className="grid grid-cols-4 gap-px border-b border-line bg-line/60">
                  <HealthCount label="阻塞" value={healthCounts.blocked} tone="stop" />
                  <HealthCount label="沉默" value={healthCounts.quiet} tone="hold" />
                  <HealthCount label="待汇报" value={healthCounts.reporting} tone="iris" />
                  <HealthCount label="活跃" value={healthCounts.active} tone="go" />
                </div>
                <div className="divide-y divide-line/60">
                  {projects.slice(0, 5).map((project) => (
                    <Link
                      key={project.id}
                      to={`/projects/${project.id}`}
                      className="block px-4 py-3 transition hover:bg-canvas-contrast/45"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-sm font-medium text-ink">
                          {project.name}
                        </span>
                        <HealthChip status={project.health?.health_status ?? "healthy"} />
                      </div>
                      <p className="mt-1 truncate text-[12px] text-ink-mute">
                        {project.health?.next_action ?? "暂无紧急动作"}
                      </p>
                    </Link>
                  ))}
                  {projects.length === 0 && (
                    <EmptyPanel text="项目列表为空。创建项目后健康矩阵会出现在这里。" />
                  )}
                </div>
              </WorkbenchPanel>
            )}

            {moduleVisible("synthesis") && (
              <WorkbenchPanel
                icon={Bot}
                title="AI 今日汇总"
                meta="synthesis"
                className={moduleMeta("synthesis").span}
                action={
                  <Link className="text-xs text-accent hover:brightness-125" to="/reports">
                    生成周报草稿
                  </Link>
                }
              >
                <div className="space-y-3 px-4 py-4">
                  <SynthesisLine
                    label="输入"
                    text={`${inbox.length} 条闪记、${threads.length} 条工作线、${todos.length} 个待办待处理。`}
                  />
                  <SynthesisLine
                    label="风险"
                    text={
                      blockedThreads.length > 0
                        ? `${blockedThreads.length} 条工作线阻塞，优先解除依赖。`
                        : "暂无阻塞风险，适合推进深度工作。"
                    }
                  />
                  <SynthesisLine
                    label="汇报"
                    text={
                      draftReport
                        ? `已有「${draftReport.period_label}」草稿，可继续打磨。`
                        : "本周尚未生成周报，可从今日证据启动。"
                    }
                  />
                </div>
              </WorkbenchPanel>
            )}

            {moduleVisible("todos") && (
              <WorkbenchPanel
                icon={ListChecks}
                title="待办雷达"
                meta={`${todos.length} open`}
                className={moduleMeta("todos").span}
              >
                <div className="divide-y divide-line/60">
                  {todos.slice(0, 5).map((todo) => (
                    <div key={todo.id} className="flex items-start gap-3 px-4 py-3">
                      <Clock3 size={15} className="mt-0.5 text-accent" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-ink">{todoPreview(todo.text)}</div>
                        <div className="mt-1 text-[11px] text-ink-mute">
                          {todo.due_date ?? "无截止日期"}
                          {todo.thread_title ? ` · ${todo.thread_title}` : ""}
                        </div>
                      </div>
                    </div>
                  ))}
                  {todos.length === 0 && <EmptyPanel text="没有打开的待办。" />}
                </div>
              </WorkbenchPanel>
            )}

            {moduleVisible("captures") && (
              <WorkbenchPanel
                icon={Inbox}
                title="最近捕捉"
                meta={`${inbox.length} inbox`}
                className={moduleMeta("captures").span}
              >
                <div className="divide-y divide-line/60">
                  {inbox.slice(0, 5).map((capture) => (
                    <Link
                      key={capture.id}
                      to="/inbox"
                      className="block px-4 py-3 transition hover:bg-canvas-contrast/45"
                    >
                      <div className="mb-2">
                        <CategoryChip category={capture.category} />
                      </div>
                      <p className="line-clamp-2 text-sm leading-5 text-ink">{capture.text}</p>
                    </Link>
                  ))}
                  {inbox.length === 0 && <EmptyPanel text="收件箱为空。新的闪记会出现在这里。" />}
                </div>
              </WorkbenchPanel>
            )}

            {moduleVisible("timeline") && (
              <WorkbenchPanel
                icon={CalendarClock}
                title="时间线脉冲"
                meta={yesterday?.date ?? "yesterday"}
                className={moduleMeta("timeline").span}
              >
                {yesterday ? (
                  <div className="space-y-3 px-4 py-4">
                    <PulseBar label="记录" value={yesterday.capture_count} max={8} tone="accent" />
                    <PulseBar label="完成" value={yesterday.todo_done_count} max={8} tone="go" />
                    <PulseBar
                      label="活跃线"
                      value={yesterday.active_threads.length}
                      max={8}
                      tone="iris"
                    />
                    <Link
                      to="/timeline"
                      className="inline-flex text-xs text-accent hover:brightness-125"
                    >
                      查看完整时间线 →
                    </Link>
                  </div>
                ) : (
                  <EmptyPanel text="时间线数据加载中。" />
                )}
              </WorkbenchPanel>
            )}

            {moduleVisible("reports") && (
              <CompactModule
                id="reports"
                value={reports.filter((report) => report.status === "draft").length}
                text={draftReport ? `${draftReport.period_label} 草稿待完善` : "暂无草稿"}
                to="/reports"
              />
            )}
            {moduleVisible("notes") && (
              <CompactModule
                id="notes"
                value="Notes"
                text="记事与线程证据可以互相转化"
                to="/notes"
              />
            )}
            {moduleVisible("attachments") && (
              <CompactModule
                id="attachments"
                value="Files"
                text="附件随项目、线程、证据归档"
                to="/projects"
              />
            )}
            {moduleVisible("search") && (
              <CompactModule
                id="search"
                value="⌘K"
                text="跨项目、工作线、证据、待办搜索"
                to="/timeline"
              />
            )}
            {moduleVisible("updates") && (
              <CompactModule
                id="updates"
                value={updateInfo?.update_available ? "New" : "OK"}
                text={
                  updateInfo?.update_available
                    ? `发现 ${updateInfo.latest_version}`
                    : "当前版本已是最新"
                }
                to="/settings"
              />
            )}
            {moduleVisible("risks") && (
              <CompactModule
                id="risks"
                value={blockedThreads.length}
                text={blockedThreads.length > 0 ? "阻塞工作线需要处理" : "当前没有阻塞工作线"}
                to="/threads"
              />
            )}
          </div>
        </section>

        {configOpen && (
          <aside className="workbench-config fixed bottom-4 right-4 top-20 z-30 w-[320px] shrink-0 min-[1400px]:sticky min-[1400px]:bottom-auto min-[1400px]:right-auto min-[1400px]:top-5 min-[1400px]:z-auto">
            <div className="h-full overflow-hidden rounded-lg border border-line bg-canvas-raised/70 shadow-soft backdrop-blur-2xl min-[1400px]:h-auto">
              <div className="border-b border-line px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Settings2 size={16} className="text-accent" />
                    <span className="font-medium text-ink">工作台配置</span>
                  </div>
                  <button className="btn-icon !h-7 !w-7" onClick={() => setConfigOpen(false)}>
                    <PanelRight size={14} />
                  </button>
                </div>
                <div className="mt-2 text-xs text-ink-mute">
                  当前：
                  {settings.view === "custom"
                    ? settings.customName
                    : `${VIEW_LABEL[settings.view]}视图`}
                </div>
              </div>

              <div className="max-h-[calc(100vh-11rem)] space-y-5 overflow-y-auto px-4 py-4 min-[1400px]:max-h-[calc(100vh-8rem)]">
                <label className="block">
                  <span className="eyebrow text-[9px]">VIEW NAME</span>
                  <input
                    value={settings.customName}
                    onChange={(e) => updateSettings({ customName: e.target.value, view: "custom" })}
                    className="input mt-2"
                    placeholder="我的工作台"
                  />
                </label>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="eyebrow text-[9px]">DENSITY</span>
                    <span className="mono-meta">{DENSITY_LABEL[settings.density]}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 rounded-lg border border-line bg-canvas-sunken p-1">
                    {(["compact", "standard", "roomy"] as Density[]).map((density) => (
                      <button
                        key={density}
                        onClick={() => updateSettings({ density })}
                        className={clsx(
                          "rounded-md px-2 py-1.5 text-xs transition",
                          settings.density === density
                            ? "bg-accent text-accent-ink"
                            : "text-ink-soft hover:bg-canvas-contrast hover:text-ink"
                        )}
                      >
                        {DENSITY_LABEL[density]}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="eyebrow text-[9px]">MODULES</span>
                    <span className="mono-meta">
                      {activeModules.length}/{MODULES.length}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {MODULES.map((module) => {
                      const Icon = module.icon;
                      const checked =
                        settings.view === "custom"
                          ? settings.customModules.includes(module.id)
                          : PRESET_MODULES[settings.view].includes(module.id);
                      return (
                        <label
                          key={module.id}
                          className="flex cursor-pointer items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-sm text-ink-soft transition hover:border-line hover:bg-canvas-contrast/60 hover:text-ink"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleCustomModule(module.id)}
                            className="h-3.5 w-3.5 accent-[rgb(var(--color-accent))]"
                          />
                          <Icon size={14} className="text-accent" />
                          <span className="flex-1">{module.configLabel}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="flex gap-2 border-t border-line pt-4">
                  <button className="btn flex-1 justify-center" onClick={resetLayout}>
                    <RotateCcw size={14} />
                    重置
                  </button>
                  <button
                    className="btn btn-accent flex-1 justify-center"
                    onClick={() => updateSettings({ view: "custom" })}
                  >
                    <Save size={14} />
                    保存
                  </button>
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

function moduleMeta(id: ModuleId) {
  return MODULES.find((module) => module.id === id) ?? MODULES[0];
}

function WorkbenchPanel({
  icon: Icon,
  title,
  meta,
  action,
  className,
  children,
}: {
  icon: LucideIcon;
  title: string;
  meta?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={clsx("workbench-panel overflow-hidden", className)}>
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md border border-accent/30 bg-accent/10 text-accent">
            <Icon size={15} />
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-ink">{title}</div>
            {meta && <div className="mono-meta mt-0.5 text-[10px]">{meta}</div>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function ActionRow({
  index,
  label,
  detail,
  to,
  tone,
}: {
  index: number;
  label: string;
  detail: string;
  to?: string;
  tone?: "accent" | "warn" | "stop";
}) {
  const content = (
    <>
      <span
        className={clsx(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border font-mono text-[11px]",
          tone === "stop"
            ? "border-signal-stop/35 bg-signal-stop/10 text-signal-stop"
            : tone === "warn"
              ? "border-signal-hold/35 bg-signal-hold/10 text-signal-hold"
              : "border-accent/35 bg-accent/10 text-accent"
        )}
      >
        {String(index).padStart(2, "0")}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">{label}</span>
        <span className="mt-0.5 block truncate text-xs text-ink-mute">{detail}</span>
      </span>
      <ChevronRight size={15} className="text-ink-mute" />
    </>
  );
  const className =
    "group flex items-center gap-3 px-4 py-3 transition hover:bg-canvas-contrast/45";
  if (!to) return <div className={className}>{content}</div>;
  return (
    <Link to={to} className={className}>
      {content}
    </Link>
  );
}

function SignalTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone: "neutral" | "accent" | "iris" | "stop";
}) {
  const toneClass = {
    neutral: "border-line bg-canvas-raised/45 text-ink",
    accent: "border-accent/35 bg-accent/10 text-accent",
    iris: "border-iris/35 bg-iris/10 text-iris",
    stop: "border-signal-stop/35 bg-signal-stop/10 text-signal-stop",
  }[tone];
  return (
    <div className={clsx("rounded-lg border px-4 py-3 shadow-chip", toneClass)}>
      <div className="flex items-center justify-between">
        <span className="eyebrow text-[9px]">{label}</span>
        <Icon size={15} />
      </div>
      <div className="mt-3 font-display text-[28px] font-semibold leading-none">{value}</div>
    </div>
  );
}

function HealthCount({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "stop" | "hold" | "iris" | "go";
}) {
  const color = {
    stop: "text-signal-stop",
    hold: "text-signal-hold",
    iris: "text-iris",
    go: "text-signal-go",
  }[tone];
  return (
    <div className="bg-canvas-raised px-3 py-3 text-center">
      <div className={clsx("font-display text-[22px] font-semibold leading-none", color)}>
        {value}
      </div>
      <div className="mono-meta mt-1 text-[10px]">{label}</div>
    </div>
  );
}

function HealthChip({
  status,
}: {
  status: "healthy" | "active" | "blocked" | "quiet" | "reporting";
}) {
  const label = {
    healthy: "健康",
    active: "活跃",
    blocked: "阻塞",
    quiet: "沉默",
    reporting: "待汇报",
  }[status];
  const tone = {
    healthy: "chip-go",
    active: "chip-accent",
    blocked: "chip-stop",
    quiet: "chip-hold",
    reporting: "chip-iris",
  }[status];
  return <span className={clsx("chip", tone)}>{label}</span>;
}

function SynthesisLine({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-lg border border-line bg-canvas-sunken/55 px-3 py-2">
      <div className="mb-1 text-[11px] font-semibold text-accent">{label}</div>
      <div className="text-sm leading-5 text-ink-soft">{text}</div>
    </div>
  );
}

function PulseBar({
  label,
  value,
  max,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  tone: "accent" | "go" | "iris";
}) {
  const width = `${Math.min(100, Math.round((value / Math.max(1, max)) * 100))}%`;
  const color = {
    accent: "bg-accent",
    go: "bg-signal-go",
    iris: "bg-iris",
  }[tone];
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-ink-soft">{label}</span>
        <span className="mono-meta">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded bg-canvas-sunken">
        <div className={clsx("h-full rounded transition-all", color)} style={{ width }} />
      </div>
    </div>
  );
}

function CompactModule({
  id,
  value,
  text,
  to,
}: {
  id: ModuleId;
  value: string | number;
  text: string;
  to: string;
}) {
  const meta = moduleMeta(id);
  const Icon = meta.icon;
  return (
    <Link
      to={to}
      className={clsx(
        "workbench-panel block px-4 py-4 transition hover:border-accent/40 hover:bg-canvas-contrast/35",
        meta.span
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-md border border-accent/30 bg-accent/10 text-accent">
          <Icon size={15} />
        </span>
        <span className="font-display text-[22px] font-semibold text-ink">{value}</span>
      </div>
      <div className="mt-3 text-sm font-medium text-ink">{meta.label}</div>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-ink-mute">{text}</p>
    </Link>
  );
}

function EmptyPanel({ text }: { text: string }) {
  return (
    <div className="px-4 py-8 text-center text-sm text-ink-mute">
      <CheckCircle2 className="mx-auto mb-2 text-accent" size={20} />
      {text}
    </div>
  );
}
