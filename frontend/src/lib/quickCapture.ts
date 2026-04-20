import { createContext, useContext } from "react";

export type QuickCaptureContextValue = {
  open: () => void;
};

export const QuickCaptureContext = createContext<QuickCaptureContextValue | null>(
  null
);

export function useQuickCapture(): QuickCaptureContextValue {
  const ctx = useContext(QuickCaptureContext);
  if (!ctx) {
    return { open: () => console.warn("QuickCapture not mounted") };
  }
  return ctx;
}
