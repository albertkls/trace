import { useMemo, useRef, useState, useEffect, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import {
  Activity,
  Archive,
  Bot,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  GitBranch,
  GripVertical,
  Inbox,
  LayoutDashboard,
  ListChecks,
  Maximize2,
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
  Trash2,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CategoryChip } from "@/components/EvidenceChip";
import Skeleton from "@/components/Skeleton";
import StatusDot from "@/components/StatusDot";
import NewThreadModal from "@/components/NewThreadModal";
import { api } from "@/lib/api";
import { isoWeekLabel, toISODate } from "@/lib/periods";
import { useQuickCapture } from "@/lib/quickCapture";
import { todoPreview } from "@/lib/richText";
import type {
  Project,
  ReportSummary,
  Thread,
  Todo,
  TodoInput,
  TodoPatch,
} from "@/lib/types";

type ViewPreset = "minimal" | "balanced" | "complete" | "custom";
type Density = "compact" | "standard" | "roomy";
type LayoutSize = "sm" | "md" | "lg" | "xl";
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
  customLayout: WorkbenchLayout;
};

const SETTINGS_KEY = "trace.workbench.settings.v2";
const LAYOUT_MIN_WIDTH = 3;
const LAYOUT_MAX_WIDTH = 12;
const LAYOUT_MIN_HEIGHT = 2;
const LAYOUT_MAX_HEIGHT = 7;

type WorkbenchLayoutItem = {
  id: ModuleId;
  w: number;
  h: number;
  size: LayoutSize;
};

type WorkbenchLayout = WorkbenchLayoutItem[];

type ResizeState = {
  id: ModuleId;
  startX: number;
  startY: number;
  startW: number;
  startH: number;
};

type TimelineTone = "moss" | "amber" | "slate";

type TimelineItem = {
  id: string;
  label: string;
  dueDate: string | null;
  tone: TimelineTone;
  todo: Todo;
};

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
  w: number;
  h: number;
  size: LayoutSize;
}[] = [
  { id: "focus", label: "今日推进", configLabel: "今日推进", icon: Radar, w: 5, h: 4, size: "lg" },
  {
    id: "threads",
    label: "工作线看板",
    configLabel: "工作线看板",
    icon: GitBranch,
    w: 7,
    h: 4,
    size: "xl",
  },
  {
    id: "projects",
    label: "项目健康",
    configLabel: "项目健康",
    icon: Activity,
    w: 6,
    h: 4,
    size: "lg",
  },
  {
    id: "synthesis",
    label: "今日简报",
    configLabel: "今日简报",
    icon: Bot,
    w: 6,
    h: 4,
    size: "lg",
  },
  { id: "todos", label: "任务列表", configLabel: "任务列表", icon: ListChecks, w: 4, h: 4, size: "md" },
  {
    id: "captures",
    label: "最近捕捉",
    configLabel: "收件箱闪记",
    icon: Inbox,
    w: 4,
    h: 4,
    size: "md",
  },
  {
    id: "timeline",
    label: "工作节奏",
    configLabel: "工作节奏",
    icon: CalendarClock,
    w: 4,
    h: 4,
    size: "md",
  },
  {
    id: "reports",
    label: "周报草稿",
    configLabel: "周报草稿",
    icon: FileText,
    w: 4,
    h: 2,
    size: "sm",
  },
  {
    id: "notes",
    label: "记事索引",
    configLabel: "笔记",
    icon: NotebookText,
    w: 4,
    h: 2,
    size: "sm",
  },
  {
    id: "attachments",
    label: "附件面板",
    configLabel: "附件",
    icon: Archive,
    w: 4,
    h: 2,
    size: "sm",
  },
  { id: "search", label: "最近搜索", configLabel: "最近搜索", icon: Search, w: 4, h: 2, size: "sm" },
  {
    id: "updates",
    label: "更新提醒",
    configLabel: "更新提醒",
    icon: Sparkles,
    w: 4,
    h: 2,
    size: "sm",
  },
  {
    id: "risks",
    label: "阻塞风险",
    configLabel: "阻塞风险",
    icon: ShieldAlert,
    w: 4,
    h: 2,
    size: "sm",
  },
];

const DEFAULT_LAYOUT: WorkbenchLayout = MODULES.map(({ id, w, h, size }) => ({ id, w, h, size }));

const DEFAULT_SETTINGS: WorkbenchSettings = {
  view: "complete",
  density: "standard",
  customName: "我的工作台",
  customModules: PRESET_MODULES.custom,
  customLayout: DEFAULT_LAYOUT,
};

const VIEW_PRESETS: ViewPreset[] = ["minimal", "balanced", "complete", "custom"];
const DENSITIES: Density[] = ["compact", "standard", "roomy"];
const MODULE_IDS = MODULES.map((module) => module.id);

function yesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toISODate(d);
}

function parseLocalISODate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function loadSettings(): WorkbenchSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    if (typeof window.localStorage?.getItem !== "function") return DEFAULT_SETTINGS;
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<WorkbenchSettings>;
    const view = isViewPreset(parsed.view) ? parsed.view : DEFAULT_SETTINGS.view;
    const density = isDensity(parsed.density) ? parsed.density : DEFAULT_SETTINGS.density;
    const customModules = sanitizeModules(parsed.customModules);
    return {
      view,
      density,
      customName:
        typeof parsed.customName === "string" && parsed.customName.trim()
          ? parsed.customName
          : DEFAULT_SETTINGS.customName,
      customModules,
      customLayout: normalizeLayout(parsed.customLayout, customModules),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(settings: WorkbenchSettings) {
  if (typeof window === "undefined") return;
  try {
    if (typeof window.localStorage?.setItem !== "function") return;
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Local storage can be unavailable in restricted webviews or tests.
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function sizeFromDimensions(w: number, h: number): LayoutSize {
  if (w >= 8 || h >= 5) return "xl";
  if (w >= 5 || h >= 4) return "lg";
  if (h >= 3) return "md";
  return "sm";
}

function isViewPreset(value: unknown): value is ViewPreset {
  return typeof value === "string" && VIEW_PRESETS.includes(value as ViewPreset);
}

function isDensity(value: unknown): value is Density {
  return typeof value === "string" && DENSITIES.includes(value as Density);
}

function isModuleId(value: unknown): value is ModuleId {
  return typeof value === "string" && MODULE_IDS.includes(value as ModuleId);
}

function sanitizeModules(value: unknown): ModuleId[] {
  if (!Array.isArray(value)) return DEFAULT_SETTINGS.customModules;
  const seen = new Set<ModuleId>();
  for (const id of value) {
    if (isModuleId(id)) seen.add(id);
  }
  return seen.size > 0
    ? MODULES.filter((module) => seen.has(module.id)).map((module) => module.id)
    : DEFAULT_SETTINGS.customModules;
}

function normalizeLayout(layout?: WorkbenchLayout, modules?: ModuleId[]): WorkbenchLayout {
  const moduleSet = new Set(modules ?? DEFAULT_LAYOUT.map((item) => item.id));
  const byId = new Map(DEFAULT_LAYOUT.map((item) => [item.id, item]));
  const incoming = Array.isArray(layout) ? layout : [];
  const normalized = incoming
    .filter((item) => moduleSet.has(item.id) && byId.has(item.id))
    .map((item) => {
      const fallback = byId.get(item.id)!;
      const w = clamp(Number(item.w) || fallback.w, LAYOUT_MIN_WIDTH, LAYOUT_MAX_WIDTH);
      const h = clamp(Number(item.h) || fallback.h, LAYOUT_MIN_HEIGHT, LAYOUT_MAX_HEIGHT);
      return { id: item.id, w, h, size: sizeFromDimensions(w, h) };
    });

  for (const id of moduleSet) {
    if (!normalized.some((item) => item.id === id)) {
      normalized.push(byId.get(id)!);
    }
  }
  return normalized;
}

function layoutForModules(modules: ModuleId[], layout = DEFAULT_LAYOUT): WorkbenchLayout {
  return normalizeLayout(layout, modules);
}

export default function Home() {
  const { open: openCapture } = useQuickCapture();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<WorkbenchSettings>(() => loadSettings());
  const [configOpen, setConfigOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [newThreadOpen, setNewThreadOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<ModuleId | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);

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

  const invalidateWorkbenchData = () => {
    queryClient.invalidateQueries({ queryKey: ["todos"] });
    queryClient.invalidateQueries({ queryKey: ["threads"] });
    queryClient.invalidateQueries({ queryKey: ["projects"] });
    queryClient.invalidateQueries({ queryKey: ["activity"] });
  };

  const createTimelineTodo = useMutation({
    mutationFn: (body: TodoInput) => api.todos.create(body),
    onSuccess: invalidateWorkbenchData,
  });

  const updateTimelineTodo = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TodoPatch }) => api.todos.patch(id, patch),
    onSuccess: invalidateWorkbenchData,
  });

  const removeTimelineTodo = useMutation({
    mutationFn: (id: string) => api.todos.remove(id),
    onSuccess: invalidateWorkbenchData,
  });

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (!configOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConfigOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [configOpen]);

  const activeModules =
    settings.view === "custom" ? settings.customModules : PRESET_MODULES[settings.view];
  const activeLayout = useMemo(() => {
    const sourceLayout = settings.view === "custom" ? settings.customLayout : DEFAULT_LAYOUT;
    return layoutForModules(activeModules, sourceLayout);
  }, [activeModules, settings.customLayout, settings.view]);
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
  const timelineItems: TimelineItem[] = todos.slice(0, 8).map((todo) => ({
    id: todo.id,
    label: todoPreview(todo.text, 34),
    dueDate: todo.due_date,
    tone: todo.done ? "slate" : todo.thread_id ? "moss" : "amber",
    todo,
  }));
  const dueTodayTodos = todos.filter((todo) => todo.due_date && todo.due_date <= iso);
  const unplannedTodos = todos.filter((todo) => !todo.due_date);
  const activeThreads = threads.filter((thread) => thread.status === "active");
  const visibleProjects = projectAlerts.length > 0 ? projectAlerts : projects;

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
      const nextModules = MODULES.filter((module) => currentModules.has(module.id)).map(
        (module) => module.id
      );
      return {
        ...current,
        view: "custom",
        customModules: nextModules,
        customLayout: layoutForModules(nextModules, current.customLayout),
      };
    });
  };
  const resetLayout = () => setSettings(DEFAULT_SETTINGS);
  const activateCustomLayout = () => {
    setSettings((current) => ({
      ...current,
      view: "custom",
      customModules: activeModules,
      customLayout: layoutForModules(activeModules, activeLayout),
    }));
    setEditMode(true);
  };
  const reorderModule = (source: ModuleId, target: ModuleId) => {
    if (source === target) return;
    setSettings((current) => {
      const layout = layoutForModules(
        current.view === "custom" ? current.customModules : activeModules,
        current.view === "custom" ? current.customLayout : activeLayout
      );
      const sourceIndex = layout.findIndex((item) => item.id === source);
      const targetIndex = layout.findIndex((item) => item.id === target);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const nextLayout = [...layout];
      const [moved] = nextLayout.splice(sourceIndex, 1);
      nextLayout.splice(targetIndex, 0, moved);
      const nextModules = nextLayout.map((item) => item.id);
      return {
        ...current,
        view: "custom",
        customModules: nextModules,
        customLayout: nextLayout,
      };
    });
  };
  const updateModuleSize = (id: ModuleId, w: number, h: number) => {
    setSettings((current) => {
      const layout = layoutForModules(
        current.view === "custom" ? current.customModules : activeModules,
        current.view === "custom" ? current.customLayout : activeLayout
      );
      const nextLayout = layout.map((item) =>
        item.id === id
          ? {
              ...item,
              w: clamp(w, LAYOUT_MIN_WIDTH, LAYOUT_MAX_WIDTH),
              h: clamp(h, LAYOUT_MIN_HEIGHT, LAYOUT_MAX_HEIGHT),
              size: sizeFromDimensions(w, h),
            }
          : item
      );
      return {
        ...current,
        view: "custom",
        customModules: nextLayout.map((item) => item.id),
        customLayout: nextLayout,
      };
    });
  };
  const beginResize = (event: React.PointerEvent<HTMLButtonElement>, item: WorkbenchLayoutItem) => {
    event.preventDefault();
    event.stopPropagation();
    resizeRef.current = {
      id: item.id,
      startX: event.clientX,
      startY: event.clientY,
      startW: item.w,
      startH: item.h,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handleResizeMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const state = resizeRef.current;
    if (!state) return;
    const nextW = state.startW + Math.round((event.clientX - state.startX) / 92);
    const nextH = state.startH + Math.round((event.clientY - state.startY) / 74);
    updateModuleSize(state.id, nextW, nextH);
  };
  const endResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    resizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const renderModule = (id: ModuleId) => {
    switch (id) {
      case "focus":
        return (
          <WorkbenchPanel icon={Radar} title="今日推进" meta={`${focusItems.length} actions`}>
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
        );
      case "threads":
        return (
          <WorkbenchPanel icon={GitBranch} title="工作线看板" meta={`${threads.length} threads`}>
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
        );
      case "projects":
        return (
          <WorkbenchPanel icon={Activity} title="项目健康" meta={`${projects.length} projects`}>
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
                    <span className="truncate text-sm font-medium text-ink">{project.name}</span>
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
        );
      case "synthesis":
        return (
          <WorkbenchPanel
            icon={Bot}
            title="今日简报"
            meta="synthesis"
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
        );
      case "todos":
        return (
          <WorkbenchPanel icon={ListChecks} title="任务列表" meta={`${todos.length} open`}>
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
        );
      case "captures":
        return (
          <WorkbenchPanel icon={Inbox} title="最近捕捉" meta={`${inbox.length} inbox`}>
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
        );
      case "timeline":
        return (
          <WorkbenchPanel icon={CalendarClock} title="工作节奏" meta={yesterday?.date ?? "yesterday"}>
            {yesterday ? (
              <div className="space-y-3 px-4 py-4">
                <PulseBar label="记录" value={yesterday.capture_count} max={8} tone="accent" />
                <PulseBar label="完成" value={yesterday.todo_done_count} max={8} tone="go" />
                <PulseBar label="活跃线" value={yesterday.active_threads.length} max={8} tone="iris" />
                <Link to="/timeline" className="inline-flex text-xs text-accent hover:brightness-125">
                  查看完整时间线 →
                </Link>
              </div>
            ) : (
              <EmptyPanel text="时间线数据加载中。" />
            )}
          </WorkbenchPanel>
        );
      case "reports":
        return (
          <CompactModule
            id="reports"
            value={reports.filter((report) => report.status === "draft").length}
            text={draftReport ? `${draftReport.period_label} 草稿待完善` : "暂无草稿"}
            to="/reports"
          />
        );
      case "notes":
        return <CompactModule id="notes" value="Notes" text="记事与线程证据可以互相转化" to="/notes" />;
      case "attachments":
        return <CompactModule id="attachments" value="Files" text="附件随项目、线程、证据归档" to="/projects" />;
      case "search":
        return <CompactModule id="search" value="⌘K" text="跨项目、工作线、证据、待办搜索" to="/timeline" />;
      case "updates":
        return (
          <CompactModule
            id="updates"
            value={updateInfo?.update_available ? "New" : "OK"}
            text={updateInfo?.update_available ? `发现 ${updateInfo.latest_version}` : "当前版本已是最新"}
            to="/settings"
          />
        );
      case "risks":
        return (
          <CompactModule
            id="risks"
            value={blockedThreads.length}
            text={blockedThreads.length > 0 ? "阻塞工作线需要处理" : "当前没有阻塞工作线"}
            to="/threads"
          />
        );
    }
  };

  return (
    <div className={clsx("workbench-page pm-workbench-page", `density-${settings.density}`)}>
      <NewThreadModal
        open={newThreadOpen}
        onClose={() => setNewThreadOpen(false)}
        onCreated={(thread: Thread) => {
          setNewThreadOpen(false);
          navigate(`/threads/${thread.id}`);
        }}
      />
      <div className="mx-auto w-full max-w-[1500px] px-4 py-4 lg:px-5">
        <header className="pm-workbench-header mb-4">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="dot-pulse" />
              <span className="eyebrow">工作台 · {weekLabel}</span>
              <span className="chip chip-go">个人推进系统</span>
            </div>
            <div>
              <h1 className="font-display text-[30px] font-semibold leading-tight text-ink">
                今天要推进什么？
              </h1>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-soft">
                用一个清晰的工作台统筹待办、工作线、项目状态和周报素材，先处理最重要的下一步。
              </p>
            </div>
          </div>
          <div className="pm-workbench-actions">
            <div className="view-switch">
              {VIEW_PRESETS.map((view) => (
                <button
                  type="button"
                  key={view}
                  className={clsx("view-switch-item", settings.view === view && "view-switch-active")}
                  onClick={() => updateSettings({ view })}
                >
                  {view === "custom" ? settings.customName || VIEW_LABEL[view] : VIEW_LABEL[view]}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={clsx("btn", editMode && "border-accent/60 bg-accent/10 text-accent")}
              onClick={() => (editMode ? setEditMode(false) : activateCustomLayout())}
            >
              <Maximize2 size={15} />
              {editMode ? "完成布局" : "编辑布局"}
            </button>
            <button
              type="button"
              className={clsx("btn", configOpen && "border-accent/60 bg-accent/10 text-accent")}
              aria-expanded={configOpen}
              aria-controls="workbench-config"
              onClick={() => setConfigOpen((value) => !value)}
            >
              <PanelRight size={15} />
              配置
            </button>
            <button type="button" className="btn btn-accent" aria-label="在工作台写一笔" onClick={openCapture}>
              <Plus size={15} />
              写一笔
            </button>
          </div>
        </header>

        <section className="pm-metric-grid mb-4" aria-label="工作台概览">
          <SignalTile
            icon={Inbox}
            label="待处理"
            value={todos.length + inbox.length}
            detail={`${todos.length} 待办 · ${inbox.length} 闪记`}
            tone="accent"
          />
          <SignalTile
            icon={GitBranch}
            label="进行中"
            value={activeThreads.length}
            detail={`${threads.length} 条工作线`}
            tone="neutral"
          />
          <SignalTile
            icon={LayoutDashboard}
            label="项目"
            value={projects.length}
            detail={`${visibleProjects.length} 个需要关注`}
            tone="iris"
          />
          <SignalTile
            icon={ShieldAlert}
            label="阻塞"
            value={blockedThreads.length}
            detail={blockedThreads.length > 0 ? "需要解除依赖" : "当前顺畅"}
            tone="stop"
          />
        </section>

        <section className="pm-command-grid mb-4">
          <TodayFocusPanel focusItems={focusItems} inboxCount={inbox.length} todoCount={todos.length} />
          <WorklineBoardPanel
            threads={threads}
            threadsLoading={threadsLoading}
            onCreateThread={() => setNewThreadOpen(true)}
          />
          <WorkbenchSummaryPanel
            inboxCount={inbox.length}
            threadCount={threads.length}
            todoCount={todos.length}
            blockedCount={blockedThreads.length}
            draftReport={draftReport}
          />
        </section>

        {settings.view !== "minimal" && (
          <WorkPlannerPanel
            items={timelineItems}
            threads={threads}
            iso={iso}
            dueTodayCount={dueTodayTodos.length}
            unplannedCount={unplannedTodos.length}
            onCreateThread={() => setNewThreadOpen(true)}
            onCreateItem={(body) => createTimelineTodo.mutateAsync(body)}
            onUpdateItem={(id, patch) => updateTimelineTodo.mutateAsync({ id, patch })}
            onRemoveItem={(id) => removeTimelineTodo.mutateAsync(id)}
            busy={
              createTimelineTodo.isPending ||
              updateTimelineTodo.isPending ||
              removeTimelineTodo.isPending
            }
          />
        )}

        <section className="pm-custom-workspace mt-4">
          <div className="pm-section-heading">
            <div>
              <div className="eyebrow">CUSTOM WORKSPACE</div>
              <h2 className="mt-1 text-base font-semibold text-ink">
                {settings.view === "custom" ? settings.customName : `${VIEW_LABEL[settings.view]}视图`}
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="mono-meta">{activeModules.length} 个板块</span>
              <button
                type="button"
                className={clsx("btn", editMode && "border-accent/60 bg-accent/10 text-accent")}
                onClick={() => (editMode ? setEditMode(false) : activateCustomLayout())}
              >
                <Maximize2 size={15} />
                {editMode ? "完成调整" : "调整板块"}
              </button>
            </div>
          </div>
          <div className={clsx("workbench-grid", editMode && "workbench-grid-editing")}>
            {activeLayout.map((item) => (
              <EditableModuleFrame
                key={item.id}
                item={item}
                editing={editMode}
                dragging={draggingId === item.id}
                onDragStart={() => setDraggingId(item.id)}
                onDragEnd={() => setDraggingId(null)}
                onDrop={() => {
                  if (draggingId) reorderModule(draggingId, item.id);
                  setDraggingId(null);
                }}
                onResizeStart={beginResize}
                onResizeMove={handleResizeMove}
                onResizeEnd={endResize}
              >
                {renderModule(item.id)}
              </EditableModuleFrame>
            ))}
          </div>
        </section>

        {configOpen && (
          <>
          <button
            type="button"
            aria-label="关闭配置遮罩"
            className="workbench-config-backdrop"
            onClick={() => setConfigOpen(false)}
          />
          <aside id="workbench-config" className="workbench-config fixed bottom-4 right-4 top-20 z-40 w-[320px] shrink-0">
            <div className="h-full overflow-hidden rounded-lg border border-line bg-canvas-raised/90 shadow-soft backdrop-blur-2xl">
              <div className="border-b border-line px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Settings2 size={16} className="text-accent" />
                    <span className="font-medium text-ink">工作台配置</span>
                  </div>
                  <button
                    type="button"
                    aria-label="关闭工作台配置"
                    className="btn-icon !h-7 !w-7"
                    onClick={() => setConfigOpen(false)}
                  >
                    <PanelRight size={14} />
                  </button>
                </div>
                <div className="mt-2 text-xs text-ink-mute">
                  当前：
                  {settings.view === "custom"
                    ? settings.customName
                    : `${VIEW_LABEL[settings.view]}视图`}
                  {editMode ? " · 正在编辑布局" : ""}
                </div>
              </div>

              <div className="max-h-[calc(100vh-11rem)] space-y-5 overflow-y-auto px-4 py-4">
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
                    {DENSITIES.map((density) => (
                      <button
                        type="button"
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

                <div className="rounded-lg border border-accent/25 bg-accent/10 px-3 py-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-accent">
                    <GripVertical size={15} />
                    布局编辑
                  </div>
                  <p className="mt-2 text-xs leading-5 text-ink-soft">
                    拖动板块左上角手柄调整位置，拖动右下角手柄调整宽度和高度。
                  </p>
                  <button
                    type="button"
                    className={clsx("btn mt-3 w-full justify-center", editMode && "btn-accent")}
                    onClick={() => (editMode ? setEditMode(false) : activateCustomLayout())}
                  >
                    <Maximize2 size={14} />
                    {editMode ? "完成编辑" : "进入编辑模式"}
                  </button>
                </div>

                <div className="flex gap-2 border-t border-line pt-4">
                  <button type="button" className="btn flex-1 justify-center" onClick={resetLayout}>
                    <RotateCcw size={14} />
                    重置
                  </button>
                  <button
                    type="button"
                    className="btn btn-accent flex-1 justify-center"
                    onClick={() => {
                      updateSettings({
                        view: "custom",
                        customModules: activeModules,
                        customLayout: activeLayout,
                      });
                      setEditMode(false);
                    }}
                  >
                    <Save size={14} />
                    保存
                  </button>
                </div>
              </div>
            </div>
          </aside>
          </>
        )}
      </div>
    </div>
  );
}

function moduleMeta(id: ModuleId) {
  return MODULES.find((module) => module.id === id) ?? MODULES[0];
}

function TodayFocusPanel({
  focusItems,
  inboxCount,
  todoCount,
}: {
  focusItems: {
    label: string;
    detail: string;
    to?: string;
    tone?: "accent" | "warn" | "stop";
  }[];
  inboxCount: number;
  todoCount: number;
}) {
  return (
    <WorkbenchPanel
      icon={Radar}
      title="今日推进"
      meta={`${focusItems.length} 个动作`}
      action={
        <Link to="/todos" className="text-xs text-accent hover:brightness-125">
          待办
        </Link>
      }
      className="pm-focus-panel"
    >
      <div className="px-4 py-4">
        <div className="mb-4 grid grid-cols-2 gap-2">
          <div className="pm-mini-stat">
            <span>待办</span>
            <strong>{todoCount}</strong>
          </div>
          <div className="pm-mini-stat">
            <span>闪记</span>
            <strong>{inboxCount}</strong>
          </div>
        </div>
        <div className="divide-y divide-line/60 rounded-lg border border-line/70 bg-canvas-raised/55">
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
      </div>
    </WorkbenchPanel>
  );
}

function WorklineBoardPanel({
  threads,
  threadsLoading,
  onCreateThread,
}: {
  threads: Thread[];
  threadsLoading: boolean;
  onCreateThread: () => void;
}) {
  const columns = [
    {
      id: "active",
      title: "进行中",
      items: threads.filter((thread) => thread.status === "active"),
    },
    {
      id: "blocked",
      title: "已阻塞",
      items: threads.filter((thread) => thread.status === "blocked"),
    },
    {
      id: "done",
      title: "已完成",
      items: threads.filter((thread) => ["done", "archived"].includes(thread.status)),
    },
  ];

  return (
    <WorkbenchPanel
      icon={GitBranch}
      title="工作线看板"
      meta={`${threads.length} 条工作线`}
      action={
        <button type="button" className="btn btn-ghost !px-2 !py-1 text-xs" onClick={onCreateThread}>
          <Plus size={13} />
          新建
        </button>
      }
      className="pm-board-panel"
    >
      {threadsLoading ? (
        <div className="p-4">
          <Skeleton variant="text" count={5} />
        </div>
      ) : threads.length === 0 ? (
        <button type="button" className="pm-empty-board" onClick={onCreateThread}>
          <Plus size={16} />
          创建第一条工作线
        </button>
      ) : (
        <div className="pm-board-columns">
          {columns.map((column) => (
            <div key={column.id} className="pm-board-column">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-ink">{column.title}</span>
                <span className="mono-meta">{column.items.length}</span>
              </div>
              <div className="space-y-2">
                {column.items.slice(0, 4).map((thread) => (
                  <Link key={thread.id} to={`/threads/${thread.id}`} className="pm-thread-card">
                    <div className="mb-2 flex items-center gap-2">
                      <StatusDot status={thread.status} withLabel={false} />
                      <span className="truncate text-sm font-medium text-ink">{thread.title}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[11px] text-ink-mute">
                      <span className="truncate">{thread.project || "未归项目"}</span>
                      <span>{thread.evidence_count ?? 0} 证据</span>
                    </div>
                  </Link>
                ))}
                {column.items.length === 0 && (
                  <div className="pm-board-empty-column">暂无</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </WorkbenchPanel>
  );
}

function WorkbenchSummaryPanel({
  inboxCount,
  threadCount,
  todoCount,
  blockedCount,
  draftReport,
}: {
  inboxCount: number;
  threadCount: number;
  todoCount: number;
  blockedCount: number;
  draftReport?: ReportSummary;
}) {
  return (
    <WorkbenchPanel
      icon={Bot}
      title="今日简报"
      meta="summary"
      action={
        <Link className="text-xs text-accent hover:brightness-125" to="/reports">
          周报
        </Link>
      }
      className="pm-summary-panel"
    >
      <div className="space-y-3 px-4 py-4">
        <SynthesisLine
          label="输入"
          text={`${inboxCount} 条闪记、${threadCount} 条工作线、${todoCount} 个待办正在等待处理。`}
        />
        <SynthesisLine
          label="风险"
          text={
            blockedCount > 0
              ? `${blockedCount} 条工作线阻塞，建议先拆出下一步。`
              : "当前没有阻塞工作线，可以直接推进今日任务。"
          }
        />
        <SynthesisLine
          label="汇报"
          text={
            draftReport
              ? `已有「${draftReport.period_label}」草稿，适合收尾整理。`
              : "本周尚未生成周报，可先积累今日证据。"
          }
        />
      </div>
    </WorkbenchPanel>
  );
}

function WorkPlannerPanel({
  items,
  threads,
  iso,
  dueTodayCount,
  unplannedCount,
  onCreateThread,
  onCreateItem,
  onUpdateItem,
  onRemoveItem,
  busy,
}: {
  items: TimelineItem[];
  threads: Thread[];
  iso: string;
  dueTodayCount: number;
  unplannedCount: number;
  onCreateThread: () => void;
  onCreateItem: (body: TodoInput) => Promise<unknown>;
  onUpdateItem: (id: string, patch: TodoPatch) => Promise<unknown>;
  onRemoveItem: (id: string) => Promise<unknown>;
  busy: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const baseDate = useMemo(() => parseLocalISODate(iso) ?? new Date(), [iso]);
  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const date = addDays(baseDate, index);
        const dateISO = toISODate(date);
        return {
          iso: dateISO,
          day: String(date.getDate()),
          weekday: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()],
          count: items.filter((item) => item.dueDate === dateISO).length,
        };
      }),
    [baseDate, items]
  );
  const selectedItem = editingId ? items.find((item) => item.id === editingId) ?? null : null;
  const openCreate = () => {
    setEditingId(null);
    setCreating(true);
  };
  const openEdit = (id: string) => {
    setCreating(false);
    setEditingId(id);
  };
  const closeEditor = () => {
    setCreating(false);
    setEditingId(null);
  };

  return (
    <section className="pm-planner-panel mb-4">
      <div className="pm-panel-header">
        <div>
          <div className="eyebrow">WEEK PLAN</div>
          <h2 className="mt-1 text-base font-semibold text-ink">本周计划</h2>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="chip">{dueTodayCount} 今日到期</span>
          <span className="chip">{unplannedCount} 未排期</span>
          <button type="button" className="btn btn-ghost !px-2 !py-1 text-xs" onClick={onCreateThread}>
            <Plus size={13} />
            新建工作线
          </button>
          <button type="button" className="btn btn-accent !px-2 !py-1 text-xs" onClick={openCreate}>
            <Plus size={13} />
            新建任务
          </button>
        </div>
      </div>

      <div className="pm-week-strip" aria-label="未来七天任务密度">
        {weekDays.map((day) => (
          <div key={day.iso} className={clsx("pm-week-day", day.iso === iso && "pm-week-day-today")}>
            <div className="text-xs font-semibold text-ink">{day.day}</div>
            <div className="mono-meta mt-1 text-[10px]">{day.weekday}</div>
            <div className="mt-2 text-[11px] text-ink-mute">{day.count} 项</div>
          </div>
        ))}
      </div>

      <div className="pm-plan-layout">
        <div className="pm-task-list">
          {items.length === 0 ? (
            <button type="button" className="pm-empty-task" onClick={openCreate}>
              <Plus size={16} />
              添加第一条任务
            </button>
          ) : (
            items.map((item) => (
              <button
                type="button"
                key={item.id}
                aria-label={`编辑任务：${item.label}`}
                className={clsx("pm-task-row", `tone-${item.tone}`)}
                onClick={() => openEdit(item.id)}
              >
                <span className="pm-task-status" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{item.label}</span>
                  <span className="mt-1 block truncate text-xs text-ink-mute">
                    {item.dueDate ?? "未排期"}
                    {item.todo.thread_title ? ` · ${item.todo.thread_title}` : ""}
                  </span>
                </span>
                <ChevronRight size={15} className="text-ink-mute" />
              </button>
            ))
          )}
        </div>

        <aside className="pm-thread-rail">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-ink">活跃工作线</div>
            <Link to="/threads" className="text-xs text-accent hover:brightness-125">
              全部
            </Link>
          </div>
          <div className="space-y-2">
            {threads.slice(0, 5).map((thread) => (
              <Link key={thread.id} to={`/threads/${thread.id}`} className="pm-thread-pill">
                <StatusDot status={thread.status} withLabel={false} />
                <span className="min-w-0 flex-1 truncate">{thread.title}</span>
                <span className="mono-meta">{thread.evidence_count ?? 0}</span>
              </Link>
            ))}
            {threads.length === 0 && (
              <button type="button" className="pm-thread-pill justify-center text-ink-mute" onClick={onCreateThread}>
                <Plus size={14} />
                新建第一条工作线
              </button>
            )}
          </div>
        </aside>
      </div>

      {(creating || selectedItem) && (
        <TimelineItemEditor
          item={selectedItem}
          threads={threads}
          iso={iso}
          busy={busy}
          onCancel={closeEditor}
          onCreate={async (body) => {
            await onCreateItem(body);
            closeEditor();
          }}
          onUpdate={async (id, patch) => {
            await onUpdateItem(id, patch);
            closeEditor();
          }}
          onRemove={async (id) => {
            await onRemoveItem(id);
            closeEditor();
          }}
        />
      )}
    </section>
  );
}

function TimelineItemEditor({
  item,
  threads,
  iso,
  busy,
  onCancel,
  onCreate,
  onUpdate,
  onRemove,
}: {
  item: TimelineItem | null;
  threads: Thread[];
  iso: string;
  busy: boolean;
  onCancel: () => void;
  onCreate: (body: TodoInput) => Promise<unknown>;
  onUpdate: (id: string, patch: TodoPatch) => Promise<unknown>;
  onRemove: (id: string) => Promise<unknown>;
}) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(iso);
  const [threadId, setThreadId] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(item ? todoPreview(item.todo.text) : "");
    setDueDate(item?.todo.due_date ?? iso);
    setThreadId(item?.todo.thread_id ?? "");
    setDone(Boolean(item?.todo.done));
    setError(null);
  }, [item, iso]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle) {
      setError("标题不能为空");
      return;
    }
    setError(null);
    try {
      if (item) {
        await onUpdate(item.id, {
          text: nextTitle,
          done,
          ...(dueDate ? { due_date: dueDate } : { clear_due_date: true }),
          ...(threadId ? { thread_id: threadId } : { clear_thread: true }),
        });
      } else {
        await onCreate({
          text: nextTitle,
          due_date: dueDate || null,
          thread_id: threadId || null,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    }
  };

  const handleRemove = async () => {
    if (!item) return;
    if (!window.confirm("删除这个任务？")) return;
    setError(null);
    try {
      await onRemove(item.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    }
  };

  return (
    <form className="pm-task-editor" onSubmit={handleSubmit}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-ink">
            {item ? "编辑任务" : "新建任务"}
          </div>
          <div className="mono-meta mt-1 text-[10px]">
            {item ? "同步到待办列表" : "创建后会出现在今日任务和本周计划"}
          </div>
        </div>
        <button type="button" className="btn-icon !h-7 !w-7" onClick={onCancel} aria-label="关闭任务编辑">
          <X size={14} />
        </button>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_9rem_11rem]">
        <label className="block">
          <span className="mb-1.5 block text-xs text-ink-soft">任务标题</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="input"
            placeholder="例如：组件库验收"
            autoFocus
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs text-ink-soft">日期</span>
          <input
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            className="input"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs text-ink-soft">关联工作线</span>
          <select value={threadId} onChange={(event) => setThreadId(event.target.value)} className="input">
            <option value="">不关联</option>
            {threads.map((thread) => (
              <option key={thread.id} value={thread.id}>
                {thread.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {item && (
          <label className="chip cursor-pointer gap-2">
            <input
              type="checkbox"
              checked={done}
              onChange={(event) => setDone(event.target.checked)}
              className="accent-[rgb(var(--color-accent))]"
            />
            标记完成
          </label>
        )}
        {item?.todo.thread_id && (
          <Link className="btn btn-ghost !px-2 !py-1 text-xs" to={`/threads/${item.todo.thread_id}`}>
            <GitBranch size={13} />
            打开工作线
          </Link>
        )}
        <Link className="btn btn-ghost !px-2 !py-1 text-xs" to="/todos">
          <ListChecks size={13} />
          待办列表
        </Link>
        <div className="ml-auto flex items-center gap-2">
          {item && (
            <button
              type="button"
              className="btn btn-ghost !px-2 !py-1 text-xs text-signal-stop hover:!bg-signal-stop/10"
              onClick={handleRemove}
              disabled={busy}
            >
              <Trash2 size={13} />
              删除
            </button>
          )}
          <button type="button" className="btn btn-ghost !px-2 !py-1 text-xs" onClick={onCancel} disabled={busy}>
            取消
          </button>
          <button type="submit" className="btn btn-accent !px-2 !py-1 text-xs" disabled={busy || !title.trim()}>
            {item ? <Check size={13} /> : <Plus size={13} />}
            保存任务
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-signal-stop/40 bg-signal-stop/10 px-3 py-2 text-xs text-signal-stop">
          {error}
        </div>
      )}
    </form>
  );
}

function EditableModuleFrame({
  item,
  editing,
  dragging,
  onDragStart,
  onDragEnd,
  onDrop,
  onResizeStart,
  onResizeMove,
  onResizeEnd,
  children,
}: {
  item: WorkbenchLayoutItem;
  editing: boolean;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
  onResizeStart: (event: React.PointerEvent<HTMLButtonElement>, item: WorkbenchLayoutItem) => void;
  onResizeMove: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onResizeEnd: (event: React.PointerEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}) {
  const meta = moduleMeta(item.id);
  return (
    <div
      className={clsx(
        "workbench-module",
        `workbench-module-${item.size}`,
        editing && "workbench-module-editable",
        dragging && "workbench-module-dragging"
      )}
      style={{
        gridColumn: `span ${item.w} / span ${item.w}`,
        minHeight: `${item.h * 76}px`,
      }}
      onDragOver={(event) => {
        if (!editing) return;
        event.preventDefault();
      }}
      onDrop={(event) => {
        if (!editing) return;
        event.preventDefault();
        event.stopPropagation();
        onDrop();
      }}
    >
      {editing && (
        <>
          <button
            type="button"
            className="layout-drag-handle"
            draggable
            aria-label={`移动${meta.label}`}
            title="拖动调整位置"
            onClick={(event) => event.stopPropagation()}
            onDragStart={(event) => {
              event.stopPropagation();
              event.dataTransfer.effectAllowed = "move";
              onDragStart();
            }}
            onDragEnd={onDragEnd}
          >
            <GripVertical size={15} />
          </button>
          <div className="layout-size-badge">
            {item.w}×{item.h}
          </div>
          <button
            type="button"
            className="layout-resize-handle"
            aria-label={`调整${meta.label}大小`}
            title="拖动调整大小"
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => onResizeStart(event, item)}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeEnd}
            onPointerCancel={onResizeEnd}
          />
        </>
      )}
      <div className={clsx("workbench-module-content", editing && "workbench-module-content-locked")}>
        {children}
      </div>
    </div>
  );
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
    <section className={clsx("workbench-panel h-full overflow-hidden", className)}>
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
  detail,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  detail?: string;
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
      {detail && <div className="mt-2 truncate text-xs opacity-75">{detail}</div>}
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
        "workbench-panel block h-full px-4 py-4 transition hover:border-accent/40 hover:bg-canvas-contrast/35"
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
