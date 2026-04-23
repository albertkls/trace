import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import clsx from "clsx";
import DesktopTitlebar from "./DesktopTitlebar";
import QuickCapture from "./QuickCapture";
import SearchModal from "./SearchModal";
import { APP_VERSION, appRuntimeLabel } from "@/lib/appInfo";
import { QuickCaptureContext } from "@/lib/quickCapture";
import { isoWeekLabel, toISODateTimeMinute } from "@/lib/periods";

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
  const today = new Date();
  const week = isoWeekLabel(today).split("-W")[1];
  const dateLabel = toISODateTimeMinute(today).replace("T", " ");
  const runtimeLabel = appRuntimeLabel();

  const [captureOpen, setCaptureOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const ctx = useMemo(() => ({ open: () => setCaptureOpen(true) }), []);
  const isDesktop = runtimeLabel === "desktop";

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
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <QuickCaptureContext.Provider value={ctx}>
      <div className="relative flex h-full w-full flex-col bg-canvas text-ink">
        {isDesktop ? (
          <DesktopTitlebar />
        ) : (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-gradient-to-r from-transparent via-accent/35 to-transparent" />
        )}

        <div className="relative flex min-h-0 flex-1">
          <aside className="relative flex w-56 shrink-0 flex-col border-r border-line bg-canvas-sunken/80 px-3 py-5 gridbg">
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
                      <span className="mono-meta text-[10px] opacity-50 group-hover:opacity-90">
                        {item.key}
                      </span>
                    </>
                  )}
                </NavLink>
              ))}
            </nav>

            <div className="mt-auto space-y-3 border-t border-line px-2 pt-4">
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
    </QuickCaptureContext.Provider>
  );
}
