export const APP_VERSION = __TRACE_VERSION__;
export const APP_RUNTIME = __TRACE_RUNTIME__;

const PYWEBVIEW_KEY = "trace.runtime.pywebview";

/**
 * True only when running inside a Tauri window.
 * The PyInstaller/pywebview build also sets TRACE_RUNTIME_MODE=desktop but does
 * NOT inject __TAURI_INTERNALS__, so this stays false there.
 */
export function isTauriDesktop(): boolean {
  return typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
}

/**
 * True when the app is running inside the macOS pywebview shell (the
 * PyInstaller build). desktop.py loads the SPA with `?runtime=pywebview`,
 * which we cache in sessionStorage so client-side navigation still detects it.
 */
export function isPywebviewDesktop(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.sessionStorage.getItem(PYWEBVIEW_KEY) === "1") return true;
    const params = new URLSearchParams(window.location.search);
    if (params.get("runtime") === "pywebview") {
      window.sessionStorage.setItem(PYWEBVIEW_KEY, "1");
      return true;
    }
  } catch {
    // sessionStorage may be unavailable (private mode, etc.) — fall through.
  }
  return false;
}

export function appRuntimeLabel(): string {
  if (isTauriDesktop() || isPywebviewDesktop()) return "desktop";
  return APP_RUNTIME === "desktop" ? "desktop" : "web";
}
