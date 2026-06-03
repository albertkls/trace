import { useEffect, useRef } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  triggerRef?: React.RefObject<HTMLElement>;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
  initialFocusRef?: React.RefObject<HTMLElement>;
};

export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  maxWidth = "max-w-md",
  initialFocusRef,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement;

    requestAnimationFrame(() => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus();
      } else {
        const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        firstFocusable?.focus();
      }
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key !== "Tab" || !dialogRef.current) return;

      const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement?.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [open, onClose, initialFocusRef]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[10vh] backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        ref={dialogRef}
        className={`panel w-full ${maxWidth} overflow-hidden`}
        style={{
          boxShadow:
            "0 1px 0 rgba(255,255,255,0.05) inset, 0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(94,230,197,0.08)",
        }}
      >
        {title && (
          <div className="flex items-center gap-3 border-b border-line bg-canvas-sunken/70 px-5 py-2.5">
            <span className="eyebrow">{title}</span>
          </div>
        )}
        <div className="max-h-[70vh] overflow-y-auto">{children}</div>
        {footer && <div className="border-t border-line px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}
