export const APP_VERSION = __TRACE_VERSION__;
export const APP_RUNTIME = __TRACE_RUNTIME__;

/**
 * True only when running inside a Tauri window.
 * The PyInstaller/pywebview build also sets TRACE_RUNTIME_MODE=desktop but does
 * NOT inject __TAURI_INTERNALS__, so this stays false there.
 */
export function isTauriDesktop(): boolean {
  return typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
}

export function appRuntimeLabel(): string {
  if (isTauriDesktop()) return "desktop";
  return APP_RUNTIME === "desktop" ? "desktop" : "web";
}
