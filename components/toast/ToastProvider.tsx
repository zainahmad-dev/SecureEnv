"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

type ToastTone = "default" | "success" | "error";

type Toast = { id: number; message: string; tone: ToastTone };

type ToastContextValue = {
  showToast: (message: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_DURATION_MS = 4000;

const TONE_CLASSES: Record<ToastTone, string> = {
  default: "border-line text-ink",
  success: "border-accent-dev/30 text-ink",
  error: "border-danger/30 text-danger",
};

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within a ToastProvider");
  return context;
}

/**
 * One global provider, mounted once in AppShell so every page gets
 * `useToast()` for free — same reasoning as AppShell already owning drawer
 * state. Toasts are plain data in local state, not a queue library: this
 * app never shows more than one or two at a time, so a fixed-position
 * stack that grows downward is enough.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const showToast = useCallback((message: string, tone: ToastTone = "default") => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, message, tone }]);
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, TOAST_DURATION_MS);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      {/* aria-live region, not a visual-only widget — a toast confirming an
          audited copy/reveal is exactly the kind of state change a screen
          reader user needs announced without hunting for it. */}
      <div
        aria-live="polite"
        role="status"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 min-[700px]:items-end min-[700px]:px-6"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto w-full max-w-sm rounded-lg border bg-paper px-4 py-2.5 text-sm shadow-lg motion-safe:animate-[toast-in_0.2s_ease-out] ${TONE_CLASSES[toast.tone]}`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
