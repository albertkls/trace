import { APP_VERSION } from "@/lib/appInfo";
import {
  desktopCloseWindow,
  desktopMinimizeWindow,
  desktopToggleMaximizeWindow,
} from "@/lib/desktopWindow";

export default function DesktopTitlebar() {
  return (
    <div
      className="desktop-titlebar flex h-10 items-center justify-between border-b border-line px-3"
      data-tauri-drag-region
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="关闭窗口"
          className="desktop-traffic desktop-traffic-close"
          onClick={() => void desktopCloseWindow()}
        />
        <button
          type="button"
          aria-label="最小化窗口"
          className="desktop-traffic desktop-traffic-minimize"
          onClick={() => void desktopMinimizeWindow()}
        />
        <button
          type="button"
          aria-label="切换最大化"
          className="desktop-traffic desktop-traffic-zoom"
          onClick={() => void desktopToggleMaximizeWindow()}
        />
      </div>

      <div className="pointer-events-none flex items-center gap-2" data-tauri-drag-region>
        <img
          src="/trace-icon.svg"
          alt="Trace"
          className="h-4 w-4 rounded-[4px] border border-white/10"
        />
        <span className="text-xs font-medium tracking-wide text-ink-soft">Trace</span>
      </div>

      <div className="mono-meta text-[10px] text-ink-faint">v{APP_VERSION}</div>
    </div>
  );
}
