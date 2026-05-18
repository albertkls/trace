import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import DesktopTitlebar from "./DesktopTitlebar";
import QuickCapture from "./QuickCapture";
import SearchModal from "./SearchModal";
import UpdatePrompt from "./UpdatePrompt";
import {
  APP_VERSION,
  appRuntimeLabel,
  isPywebviewDesktop,
  isTauriDesktop,
} from "@/lib/appInfo";
import { QuickCaptureContext } from "@/lib/quickCapture";
import { isoWeekLabel, toISODateTimeMinute } from "@/lib/periods";
import { api } from "@/lib/api";
import {
  DEFAULT_WORKSPACE_ID,
  WORKSPACE_STORAGE_KEY,
  WorkspaceContext,
} from "@/lib/workspace";
import { useThemePreference } from "@/lib/theme";

const NAV: { to: string; label: string; key: string; glyph: string }[] = [
  { to: "/", label: "今日", key: "1", glyph: "◐" },
  { to: "/inbox", label: "收件箱", key: "2", glyph: "◲" },
  { to: "/projects", label: "项目", key: "3", glyph: "▣" },
  { to: "/threads", label: "工作线", key: "4", glyph: "≋" },
  { to: "/timeline", label: "时间线", key: "5", glyph: "↻" },
  { to: "/notes", label: "记事", key: "6", glyph: "✎" },
  { to: "/todos", label: "待办", key: "7", glyph: "☐" },
  { to: "/reports", label: "汇报", key: "8", glyph: "❡" },
  { to: "/settings", label: "设置", key: "0", glyph: "⚙" },
];

export default function Shell() {
  const runtimeLabel = appRuntimeLabel();
  const [now, setNow] = useState(() => new Date());
  const { preference, resolvedTheme, setPreference } = useThemePreference();

  const week = isoWeekLabel(now).split("-W")[1];
  const dateLabel = toISODateTimeMinute(now).replace("T", " ");

  const [captureOpen, setCaptureOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [newWorkspaceOpen, setNewWorkspaceOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_WORKSPACE_ID;
    return window.localStorage.getItem(WORKSPACE_STORAGE_KEY) || DEFAULT_WORKSPACE_ID;
  });
  const queryClient = useQueryClient();
  const ctx = useMemo(() => ({ open: () => setCaptureOpen(true) }), []);
  // Only show custom titlebar when actually inside Tauri (frameless window).
  // In the PyInstaller/pywebview build, desktop.py merges the native macOS title
  // bar into the app (transparent + full-size content view) and the SPA reserves
  // top-padding so the traffic light buttons don't overlap content.
  const showCustomTitlebar = isTauriDesktop();
  const isPywebview = isPywebviewDesktop();
  const { data: workspaces = [] } = useQuery({
    queryKey: ["workspaces"],
    queryFn: api.workspaces.list,
  });
  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? workspaces[0];
  const createWorkspace = useMutation({
    mutationFn: () => api.workspaces.create({ name: newWorkspaceName.trim() }),
    onSuccess: (workspace) => {
      setActiveWorkspaceId(workspace.id);
      setNewWorkspaceName("");
      setNewWorkspaceOpen(false);
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });

  const setActiveWorkspaceId = (id: string) => {
    setActiveWorkspaceIdState(id);
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, id);
    queryClient.invalidateQueries();
  };
  const toggleTheme = () => {
    setPreference(resolvedTheme === "dark" ? "light" : "dark");
  };

  const workspaceContext = useMemo(
    () => ({
      activeWorkspaceId,
      setActiveWorkspaceId,
      workspaces,
      refreshWorkspaces: () => {
        queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      },
    }),
    [activeWorkspaceId, queryClient, workspaces]
  );

  useEffect(() => {
    if (workspaces.length === 0) return;
    if (workspaces.some((workspace) => workspace.id === activeWorkspaceId)) return;
    setActiveWorkspaceId(workspaces[0].id);
  }, [activeWorkspaceId, workspaces]);

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
  }, [workspaces]);

  return (
    <QuickCaptureContext.Provider value={ctx}>
      <WorkspaceContext.Provider value={workspaceContext}>
      <div className="relative flex h-full w-full flex-col bg-canvas text-ink">
        {showCustomTitlebar ? (
          <DesktopTitlebar />
        ) : (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-gradient-to-r from-transparent via-accent/35 to-transparent" />
        )}

        <div className="relative flex min-h-0 flex-1">
          <aside
            className={clsx(
              "relative flex w-56 shrink-0 flex-col border-r border-line bg-canvas-sunken/80 px-3 pb-5 gridbg",
              // Reserve room at the top of the sidebar for the macOS traffic
              // light buttons (top-left ~80x28). In all other modes use the
              // original 20px breathing room.
              isPywebview ? "pt-12" : "pt-5"
            )}
          >
            <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-accent/30 to-transparent" />

            <div className="px-2 pb-5">
              <div className="flex items-center gap-2">
                <img
                  src="/trace-icon.svg"
                  alt="Trace"
                  className="h-6 w-6 rounded-md border border-white/10 shadow-soft"
                />
                <div className="font-display text-[15px] font-semibold tracking-tight text-ink">
                  Trace
                </div>
                <span className="ml-auto mono-meta text-[10px]">v{APP_VERSION}</span>
              </div>
              <div className="mt-1.5 eyebrow text-[9px]">
                WORK · SIGNAL · {runtimeLabel.toUpperCase()}
              </div>
            </div>

            <button
              onClick={() => setCaptureOpen(true)}
              className="group relative mb-5 flex items-center justify-between overflow-hidden rounded-xl border border-line bg-canvas-raised/70 px-3 py-2 text-sm text-ink-soft transition hover:border-accent/50 hover:text-ink"
            >
              <span className="absolute inset-y-0 left-0 w-px bg-accent/60 transition-all group-hover:w-[3px]" />
              <span className="flex items-center gap-2">
                <span className="text-accent">＋</span>
                <span>写一笔</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="kbd">⌘</span>
                <span className="kbd">⇧</span>
                <span className="kbd">N</span>
              </span>
            </button>

            <div className="mb-5 rounded-xl border border-line bg-canvas-raised/45 p-2">
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="eyebrow text-[9px]">WORKSPACE</span>
                <button
                  className="rounded-md px-1.5 py-0.5 text-xs text-accent transition hover:bg-canvas-contrast"
                  onClick={() => setNewWorkspaceOpen((value) => !value)}
                  title="新建工作区"
                >
                  ＋
                </button>
              </div>
              <div className="space-y-1">
                {workspaces.slice(0, 9).map((workspace, idx) => (
                  <button
                    key={workspace.id}
                    onClick={() => setActiveWorkspaceId(workspace.id)}
                    className={clsx(
                      "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition",
                      workspace.id === activeWorkspace?.id
                        ? "bg-canvas-contrast text-ink"
                        : "text-ink-soft hover:bg-canvas-contrast/60 hover:text-ink"
                    )}
                  >
                    <span className="h-2 w-2 rounded-full bg-accent/80" />
                    <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                    <span className="mono-meta">⌃{idx + 1}</span>
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
                    className="w-full rounded-lg border border-line bg-canvas-sunken px-2 py-1.5 text-xs text-ink outline-none focus:border-accent/60"
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

            <div className="mb-2 px-2 eyebrow text-[9px]">NAVIGATION</div>
            <nav className="flex flex-col gap-0.5">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  className={({ isActive }) =>
                    clsx(
                      "group relative flex items-center gap-3 rounded-lg px-2.5 py-1.5 text-sm transition",
                      isActive
                        ? "bg-canvas-contrast text-ink"
                        : "text-ink-soft hover:bg-canvas-contrast/60 hover:text-ink"
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={clsx(
                          "absolute left-0 top-1/2 h-4 -translate-y-1/2 rounded-r-full bg-accent transition-all",
                          isActive
                            ? "w-[3px] opacity-100"
                            : "w-0 opacity-0 group-hover:w-[2px] group-hover:opacity-60"
                        )}
                      />
                      <span
                        className={clsx(
                          "w-4 text-center text-[13px] transition",
                          isActive
                            ? "text-accent"
                            : "text-ink-mute group-hover:text-accent"
                        )}
                      >
                        {item.glyph}
                      </span>
                      <span className="flex-1">{item.label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </nav>

            <div className="mt-auto space-y-3 border-t border-line px-2 pt-4">
              <button
                onClick={toggleTheme}
                className="flex w-full items-center justify-between rounded-lg border border-line bg-canvas-raised/55 px-2.5 py-2 text-xs text-ink-soft transition hover:border-accent/40 hover:bg-canvas-contrast hover:text-ink"
                title="切换深浅主题"
              >
                <span className="flex items-center gap-2">
                  <span className="text-accent">
                    {resolvedTheme === "dark" ? "☾" : "☼"}
                  </span>
                  <span>{resolvedTheme === "dark" ? "深色" : "浅色"}</span>
                </span>
                <span className="mono-meta">
                  {preference === "system" ? "SYSTEM" : "THEME"}
                </span>
              </button>
              <div className="flex items-center justify-between mono-meta">
                <span className="flex items-center gap-1.5">
                  <span className="dot-pulse" />
                  <span>{runtimeLabel.toUpperCase()}</span>
                </span>
                <span>
                  W{week} · {dateLabel}
                </span>
              </div>
              <button
                onClick={() => setSearchOpen(true)}
                className="flex items-center gap-2 mono-meta transition hover:text-ink"
              >
                <span className="kbd">⌘K</span>
                <span>搜索</span>
              </button>
            </div>
          </aside>

          <main className="relative h-full min-w-0 flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>

      <QuickCapture open={captureOpen} onClose={() => setCaptureOpen(false)} />
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <UpdatePrompt />
      </WorkspaceContext.Provider>
    </QuickCaptureContext.Provider>
  );
}
