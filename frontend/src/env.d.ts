/// <reference types="vite/client" />

declare const __TRACE_VERSION__: string;
declare const __TRACE_RUNTIME__: string;

interface Window {
  __TAURI_INTERNALS__?: unknown;
  pywebview?: {
    api?: {
      choose_file?: () => Promise<string | null>;
      close_window?: () => Promise<void>;
      minimize_window?: () => Promise<void>;
      toggle_maximize_window?: () => Promise<void>;
      quit_app?: () => Promise<void>;
    };
  };
}
