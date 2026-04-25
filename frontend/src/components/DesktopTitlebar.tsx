import {
  desktopCloseWindow,
  desktopMinimizeWindow,
  desktopToggleMaximizeWindow,
} from "@/lib/desktopWindow";

export default function DesktopTitlebar() {
  return (
    <div
      className="desktop-titlebar flex h-10 shrink-0 items-center border-b border-line px-3"
      data-tauri-drag-region
    >
      {/* Traffic light buttons — aligned with sidebar left edge */}
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

      {/* Drag region — occupies remaining space, no redundant branding */}
      <div className="flex-1" data-tauri-drag-region />
    </div>
  );
}
