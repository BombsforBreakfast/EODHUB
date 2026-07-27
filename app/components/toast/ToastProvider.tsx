"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../../lib/ThemeContext";

export type ToastKind = "success" | "error" | "info";

type ToastItem = {
  id: string;
  message: string;
  kind: ToastKind;
};

type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  show: (message: string, kind?: ToastKind) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const AUTO_DISMISS_MS = 3800;
const MAX_VISIBLE = 3;

function kindStyles(kind: ToastKind, isDark: boolean): { bg: string; border: string; color: string } {
  if (kind === "success") {
    return isDark
      ? { bg: "#13251a", border: "rgba(134,239,172,0.35)", color: "#bbf7d0" }
      : { bg: "#f0fdf4", border: "rgba(22,163,74,0.28)", color: "#166534" };
  }
  if (kind === "error") {
    return isDark
      ? { bg: "#2a1414", border: "rgba(252,165,165,0.35)", color: "#fecaca" }
      : { bg: "#fef2f2", border: "rgba(220,38,38,0.28)", color: "#991b1b" };
  }
  return isDark
    ? { bg: "#1a1a1a", border: "rgba(255,255,255,0.14)", color: "#f0f0f0" }
    : { bg: "#ffffff", border: "rgba(0,0,0,0.12)", color: "#0a0a0a" };
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const { isDark } = useTheme();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    setMounted(true);
    return () => {
      timersRef.current.forEach((timer) => clearTimeout(timer));
      timersRef.current.clear();
    };
  }, []);

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message: string, kind: ToastKind = "info") => {
      const trimmed = message.trim();
      if (!trimmed) return;
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((prev) => [...prev.slice(-(MAX_VISIBLE - 1)), { id, message: trimmed, kind }]);
      const timer = setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
      timersRef.current.set(id, timer);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (message) => show(message, "success"),
      error: (message) => show(message, "error"),
      info: (message) => show(message, "info"),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {mounted
        ? createPortal(
            <div
              aria-live="polite"
              aria-relevant="additions"
              style={{
                position: "fixed",
                left: "50%",
                bottom: "max(18px, env(safe-area-inset-bottom, 0px))",
                transform: "translateX(-50%)",
                zIndex: 120000,
                display: "flex",
                flexDirection: "column-reverse",
                gap: 8,
                width: "min(420px, calc(100vw - 24px))",
                pointerEvents: "none",
              }}
            >
              {toasts.map((toast) => {
                const styles = kindStyles(toast.kind, isDark);
                return (
                  <div
                    key={toast.id}
                    role={toast.kind === "error" ? "alert" : "status"}
                    style={{
                      pointerEvents: "auto",
                      borderRadius: 12,
                      border: `1px solid ${styles.border}`,
                      background: styles.bg,
                      color: styles.color,
                      padding: "12px 14px",
                      fontSize: 14,
                      fontWeight: 700,
                      lineHeight: 1.45,
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                    }}
                  >
                    <span style={{ flex: 1 }}>{toast.message}</span>
                    <button
                      type="button"
                      aria-label="Dismiss"
                      onClick={() => dismiss(toast.id)}
                      style={{
                        border: "none",
                        background: "transparent",
                        color: "inherit",
                        opacity: 0.7,
                        cursor: "pointer",
                        fontWeight: 800,
                        fontSize: 16,
                        lineHeight: 1,
                        padding: 0,
                      }}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}
