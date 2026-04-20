export const APP_VERSION = __TRACE_VERSION__;
export const APP_RUNTIME = __TRACE_RUNTIME__;

export function appRuntimeLabel(): string {
  return APP_RUNTIME === "desktop" ? "desktop" : "web";
}
