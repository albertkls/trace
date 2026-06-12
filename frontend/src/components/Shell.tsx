import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  CheckSquare,
  Clock3,
  Command,
  FileText,
  FolderKanban,
  GitBranch,
  Home,
  Inbox,
  Moon,
  NotebookText,
  Plus,
  Settings,
  Sparkles,
  Sun,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import clsx from "clsx";
import DesktopTitlebar from "./DesktopTitlebar";
import QuickCapture from "./QuickCapture";
import SearchModal from "./SearchModal";
import ShortcutsHelp from "./ShortcutsHelp";
import UpdatePrompt from "./UpdatePrompt";
import { APP_VERSION, appRuntimeLabel, isPywebviewDesktop, isTauriDesktop } from "@/lib/appInfo";
import { api } from "@/lib/api";
import { isoWeekLabel, toISODateTimeMinute } from "@/lib/periods";
import { QuickCaptureContext } from "@/lib/quickCapture";
import { useThemePreference } from "@/lib/theme";
import { DEFAULT_WORKSPACE_ID, WORKSPACE_STORAGE_KEY, WorkspaceContext } from "@/lib/workspace";

const NAV: { to: string; label: string; key: string; icon: LucideIcon }[] = [
  { to: "/", label: "今日", key: "1", icon: Home },
  { to: "/inbox", label: "收件箱", key: "2", icon: Inbox },
  { to: "/projects", label: "项目", key: "3", icon: FolderKanban },
  { to: "/threads", label: "工作线", key: "4", icon: GitBranch },
  { to: "/timeline", label: "时间线", key: "5", icon: Clock3 },
  { to: "/notes", label: "记事", key: "6", icon: NotebookText },
  { to: "/todos", label: "待办", key: "7", icon: CheckSquare },
  { to: "/reports", label: "汇报", key: "8", icon: FileText },
  { to: "/settings", label: "设置", key: "0", icon: Settings },
];

export default function Shell() {
  const runtimeLabel = appRuntimeLabel();
  const [now, setNow] = useState(() => new Date());
  const { preference, resolvedTheme, setPreference } = useThemePreference();
  const [captureOpen, setCaptureOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [newWorkspaceOpen, setNewWorkspaceOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_WORKSPACE_ID;
    return window.localStorage.getItem(WORKSPACE_STORAGE_KEY) || DEFAULT_WORKSPACE_ID;
  });
  const queryClient = useQueryClient();
  const showCustomTitlebar = isTauriDesktop();
  const isPywebview = isPywebviewDesktop();
  const week = isoWeekLabel(now).split("-W")[1];
  const dateLabel = toISODateTimeMinute(now).replace("T", " ");
  const quickCaptureContext = useMemo(() => ({ open: () => setCaptureOpen(true) }), []);

  const { data: workspaces = [] } = useQuery({
    queryKey: ["workspaces"],
    queryFn: api.workspaces.list,
  });
  const { data: updateInfo } = useQuery({
    queryKey: ["updater", "check"],
    queryFn: api.updater.check,
    retry: 1,
    staleTime: 15 * 60 * 1000,
  });
  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? workspaces[0];

  const setActiveWorkspaceId = useCallback(
    (id: string) => {
      setActiveWorkspaceIdState(id);
      window.localStorage.setItem(WORKSPACE_STORAGE_KEY, id);
      queryClient.invalidateQueries();
    },
    [queryClient]
  );

  const createWorkspace = useMutation({
    mutationFn: () => api.workspaces.create({ name: newWorkspaceName.trim() }),
    onSuccess: (workspace) => {
      setActiveWorkspaceId(workspace.id);
      setNewWorkspaceName("");
      setNewWorkspaceOpen(false);
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });

  const workspaceContext = useMemo(
    () => ({
      activeWorkspaceId,
      setActiveWorkspaceId,
      workspaces,
      refreshWorkspaces: () => {
        queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      },
    }),
    [activeWorkspaceId, queryClient, setActiveWorkspaceId, workspaces]
  );

  useEffect(() => {
    if (workspaces.length === 0) return;
    if (workspaces.some((workspace) => workspace.id === activeWorkspaceId)) return;
    setActiveWorkspaceId(workspaces[0].id);
  }, [activeWorkspaceId, setActiveWorkspaceId, workspaces]);

  useEffect(() => {
    const tick = () => setNow(new Date());
    const ms = 60_000 - (Date.now() % 60_000);
    let interval: number | undefined;
    const initial = window.setTimeout(() => {
      tick();
      interval = window.setInterval(tick, 60_000);
    }, ms);
    return () => {
      window.clearTimeout(initial);
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.shiftKey && (e.key === "N" || e.key === "n")) {
        e.preventDefault();
        setCaptureOpen(true);
      }
      if (mod && !e.shiftKey && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.ctrlKey && !e.metaKey && !e.shiftKey && /^[1-9]$/.test(e.key)) {
        const idx = Number(e.key) - 1;
        const workspace = workspaces[idx];
        if (workspace) {
          e.preventDefault();
          setActiveWorkspaceId(workspace.id);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setActiveWorkspaceId, workspaces]);

  const toggleTheme = () => {
    setPreference(resolvedTheme === "dark" ? "light" : "dark");
  };

  return (
    <QuickCaptureContext.Provider value={quickCaptureContext}>
      <WorkspaceContext.Provider value={workspaceContext}>
        <div className="trace-shell relative flex h-full w-full flex-col bg-canvas text-ink">
          {showCustomTitlebar ? (
            <DesktopTitlebar />
          ) : (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-px bg-accent/35" />
          )}

          <div className="relative flex min-h-0 flex-1">
            <aside
              className={clsx(
                "app-sidebar relative z-10 flex w-[232px] shrink-0 flex-col border-r border-line bg-canvas-sunken/92 px-3 pb-4 backdrop-blur-xl",
                isPywebview ? "pt-12" : "pt-4"
              )}
            >
              <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-accent/35 to-transparent" />

              <div className="mb-3 flex items-center gap-2 rounded-lg border border-line bg-canvas-raised/55 p-2.5 shadow-chip">
                <img
                  src="/trace-icon.svg"
                  alt="Trace"
                  className="h-8 w-8 rounded-md border border-accent/25 bg-canvas-sunken shadow-glow"
                />
                <div className="min-w-0 flex-1">
                  <div className="sidebar-logo-text font-display text-[15px] font-semibold text-ink">
                    Trace
                  </div>
                  <div className="sidebar-logo-text mt-0.5 truncate text-[11px] text-ink-mute">
                    Local AI command
                  </div>
                </div>
                <span className="nav-label mono-meta text-[10px]">v{APP_VERSION}</span>
              </div>

              <button
                onClick={() => setCaptureOpen(true)}
                className="sidebar-capture-btn mb-3 flex items-center justify-between rounded-lg border border-accent/60 bg-accent px-3 py-2 text-sm font-semibold text-accent-ink shadow-glow transition hover:brightness-110"
              >
                <span className="flex items-center gap-2">
                  <Plus size={16} strokeWidth={2.4} />
                  <span className="nav-label">写一笔</span>
                </span>
                <span className="nav-label kbd !border-accent-ink/20 !bg-accent-ink/10 !text-accent-ink">
                  ⌘⇧N
                </span>
              </button>

              <div className="mb-3 rounded-lg border border-line bg-canvas-raised/35 p-2">
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="workspace-label eyebrow text-[9px]">WORKSPACE</span>
                  <button
                    className="workspace-add-btn btn-icon !h-6 !w-6 !rounded"
                    onClick={() => setNewWorkspaceOpen((value) => !value)}
                    title="新建工作区"
                  >
                    <Plus size={13} />
                  </button>
                </div>
                <div className="space-y-1">
                  {workspaces.slice(0, 9).map((workspace, idx) => (
                    <button
                      key={workspace.id}
                      onClick={() => setActiveWorkspaceId(workspace.id)}
                      className={clsx(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition",
                        workspace.id === activeWorkspace?.id
                          ? "border border-accent/25 bg-accent/12 text-ink shadow-glow"
                          : "border border-transparent text-ink-soft hover:bg-canvas-contrast/70 hover:text-ink"
                      )}
                    >
                      <span className="h-2 w-2 rounded-full bg-accent shadow-[0_0_12px_rgba(72,211,255,0.65)]" />
                      <span className="nav-label min-w-0 flex-1 truncate">{workspace.name}</span>
                      <span className="nav-label mono-meta">⌃{idx + 1}</span>
                    </button>
                  ))}
                </div>
                {newWorkspaceOpen && (
                  <div className="mt-2 space-y-2">
                    <input
                      value={newWorkspaceName}
                      onChange={(e) => setNewWorkspaceName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newWorkspaceName.trim()) {
                          createWorkspace.mutate();
                        }
                      }}
                      placeholder="新工作区名称"
                      className="input !px-2 !py-1.5 !text-xs"
                    />
                    <button
                      className="btn btn-accent w-full justify-center text-xs"
                      onClick={() => createWorkspace.mutate()}
                      disabled={!newWorkspaceName.trim() || createWorkspace.isPending}
                    >
                      {createWorkspace.isPending ? "创建中…" : "创建"}
                    </button>
                  </div>
                )}
              </div>

              <div className="mb-2 px-2 nav-eyebrow eyebrow text-[9px]">COMMAND SURFACES</div>
              <nav className="flex flex-col gap-1">
                {NAV.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === "/"}
                      className={({ isActive }) =>
                        clsx(
                          "group relative flex items-center gap-3 rounded-lg border px-2 py-1.5 text-sm transition",
                          isActive
                            ? "border-accent/35 bg-accent/12 text-ink shadow-glow"
                            : "border-transparent text-ink-soft hover:border-line hover:bg-canvas-raised/70 hover:text-ink"
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <span
                            className={clsx(
                              "flex h-7 w-7 items-center justify-center rounded-md border transition",
                              isActive
                                ? "border-accent/35 bg-accent/14 text-accent"
                                : "border-line bg-canvas-sunken text-ink-mute group-hover:text-accent"
                            )}
                          >
                            <Icon size={15} strokeWidth={2} />
                          </span>
                          <span className="nav-label flex-1">{item.label}</span>
                          <span className="nav-label mono-meta text-[10px]">{item.key}</span>
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </nav>

              <div className="mt-auto space-y-3 border-t border-line px-1 pt-3">
                <button
                  onClick={toggleTheme}
                  className="theme-section flex w-full items-center justify-between rounded-lg border border-line bg-canvas-raised/45 px-2.5 py-2 text-xs text-ink-soft transition hover:border-accent/40 hover:bg-canvas-contrast hover:text-ink"
                  title="切换深浅主题"
                >
                  <span className="flex items-center gap-2">
                    {resolvedTheme === "dark" ? <Moon size={14} /> : <Sun size={14} />}
                    <span>{resolvedTheme === "dark" ? "深色" : "浅色"}</span>
                  </span>
                  <span className="nav-label mono-meta">
                    {preference === "system" ? "SYSTEM" : "THEME"}
                  </span>
                </button>
                <div className="nav-label flex items-center justify-between mono-meta">
                  <span className="flex items-center gap-1.5">
                    <span className="dot-pulse" />
                    <span>{runtimeLabel.toUpperCase()}</span>
                  </span>
                  <span className="date-meta">
                    W{week} · {dateLabel}
                  </span>
                </div>
              </div>
            </aside>

            <section className="flex min-w-0 flex-1 flex-col">
              <header
                className={clsx(
                  "app-topbar sticky top-0 z-10 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-canvas/72 px-5 backdrop-blur-2xl",
                  isPywebview && "pl-6"
                )}
              >
                <button
                  onClick={() => setSearchOpen(true)}
                  className="group flex min-w-0 flex-1 items-center gap-3 rounded-lg border border-line bg-canvas-raised/55 px-3 py-2 text-left text-sm text-ink-mute shadow-chip transition hover:border-accent/40 hover:text-ink"
                >
                  <Command size={16} className="text-accent" />
                  <span className="truncate">搜索、捕捉、跳转或生成周报</span>
                  <span className="ml-auto kbd">⌘K</span>
                </button>
                <button className="btn btn-accent shrink-0" onClick={() => setCaptureOpen(true)}>
                  <Plus size={15} />
                  写一笔
                </button>
                <div className="hidden items-center gap-2 rounded-lg border border-line bg-canvas-raised/45 px-3 py-2 text-xs text-ink-soft lg:flex">
                  <Sparkles size={14} className="text-iris" />
                  <span>{activeWorkspace?.name ?? "默认工作区"}</span>
                </div>
                <div
                  className={clsx(
                    "hidden items-center gap-2 rounded-lg border px-3 py-2 text-xs lg:flex",
                    updateInfo?.update_available
                      ? "border-iris/40 bg-iris/10 text-iris"
                      : "border-line bg-canvas-raised/45 text-ink-soft"
                  )}
                >
                  <Bell size={14} />
                  <span>{updateInfo?.update_available ? "有新版本" : "已是最新"}</span>
                </div>
                <div className="hidden rounded-lg border border-line bg-canvas-raised/45 px-3 py-2 text-right lg:block">
                  <div className="mono-meta text-[10px]">W{week}</div>
                  <div className="mono-meta text-[10px]">{dateLabel}</div>
                </div>
              </header>

              <main className="app-main min-h-0 flex-1 overflow-auto">
                <Outlet />
              </main>
            </section>
          </div>
        </div>

        <QuickCapture open={captureOpen} onClose={() => setCaptureOpen(false)} />
        <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
        <ShortcutsHelp />
        <UpdatePrompt />
      </WorkspaceContext.Provider>
    </QuickCaptureContext.Provider>
  );
}
