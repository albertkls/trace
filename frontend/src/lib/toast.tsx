import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

export type ToastKind = "success" | "error" | "info" | "warning";

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
  duration: number;
}

interface ToastContextValue {
  toasts: Toast[];
  show: (message: string, opts?: { kind?: ToastKind; duration?: number }) => string;
  dismiss: (id: string) => void;
  success: (message: string, duration?: number) => string;
  error: (message: string, duration?: number) => string;
  info: (message: string, duration?: number) => string;
  warning: (message: string, duration?: number) => string;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const KIND_STYLES: Record<ToastKind, string> = {
  success: "border-accent/40 bg-accent/10 text-accent",
  error: "border-signal-stop/40 bg-signal-stop/10 text-signal-stop",
  info: "border-line bg-canvas-sunken/90 text-ink",
  warning: "border-yellow-500/40 bg-yellow-500/10 text-yellow-600",
};

const KIND_ICONS: Record<ToastKind, string> = {
  success: "✓",
  error: "✕",
  info: "ℹ",
  warning: "!",
};

let toastCounter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (message: string, opts?: { kind?: ToastKind; duration?: number }) => {
      const id = `t${++toastCounter}`;
      const toast: Toast = {
        id,
        kind: opts?.kind ?? "info",
        message,
        duration: opts?.duration ?? 4000,
      };
      setToasts((prev) => [...prev, toast]);
      if (toast.duration > 0) {
        const timer = setTimeout(() => dismiss(id), toast.duration);
        timers.current.set(id, timer);
      }
      return id;
    },
    [dismiss]
  );

  const success = useCallback((m: string, d?: number) => show(m, { kind: "success", duration: d }), [show]);
  const error = useCallback((m: string, d?: number) => show(m, { kind: "error", duration: d ?? 5000 }), [show]);
  const info = useCallback((m: string, d?: number) => show(m, { kind: "info", duration: d }), [show]);
  const warning = useCallback((m: string, d?: number) => show(m, { kind: "warning", duration: d }), [show]);

  useEffect(() => {
    return () => {
      timers.current.forEach((t) => clearTimeout(t));
      timers.current.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, show, dismiss, success, error, info, warning }}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex max-w-sm flex-col gap-2"
      aria-live="polite"
      aria-atomic="true"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-start gap-2 rounded-xl border px-4 py-3 shadow-lg backdrop-blur-sm transition-all ${KIND_STYLES[t.kind]}`}
          role={t.kind === "error" ? "alert" : "status"}
        >
          <span className="mt-0.5 text-sm font-bold">{KIND_ICONS[t.kind]}</span>
          <p className="flex-1 text-sm">{t.message}</p>
          <button
            onClick={() => onDismiss(t.id)}
            className="text-ink-faint transition hover:text-ink"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}
