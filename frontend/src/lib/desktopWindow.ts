function isTauri(): boolean {
  return typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
}

function pywebviewApi() {
  return typeof window === "undefined" ? undefined : window.pywebview?.api;
}

export async function desktopCloseWindow(): Promise<void> {
  const api = pywebviewApi();
  if (api?.close_window) {
    await api.close_window();
    return;
  }
  if (!isTauri()) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().close();
}

export async function desktopMinimizeWindow(): Promise<void> {
  const api = pywebviewApi();
  if (api?.minimize_window) {
    await api.minimize_window();
    return;
  }
  if (!isTauri()) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().minimize();
}

export async function desktopToggleMaximizeWindow(): Promise<void> {
  const api = pywebviewApi();
  if (api?.toggle_maximize_window) {
    await api.toggle_maximize_window();
    return;
  }
  if (!isTauri()) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().toggleMaximize();
}

export async function desktopQuitApp(): Promise<void> {
  const api = pywebviewApi();
  if (api?.quit_app) {
    await api.quit_app();
    return;
  }
  await desktopCloseWindow();
}
