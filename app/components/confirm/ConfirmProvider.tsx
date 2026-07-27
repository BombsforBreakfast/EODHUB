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
import { useSuppressChatroomPeek } from "../../hooks/useSuppressChatroomPeek";

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as a destructive action. */
  danger?: boolean;
};

type ConfirmApi = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

type PendingConfirm = ConfirmOptions & {
  resolve: (value: boolean) => void;
};

const ConfirmContext = createContext<ConfirmApi | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t, isDark } = useTheme();
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [mounted, setMounted] = useState(false);
  const pendingRef = useRef<PendingConfirm | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useSuppressChatroomPeek(Boolean(pending), "confirm-dialog");

  const settle = useCallback((value: boolean) => {
    const current = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    current?.resolve(value);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      const next: PendingConfirm = { ...options, resolve };
      // If a confirm is already open, resolve the previous as cancelled.
      if (pendingRef.current) {
        pendingRef.current.resolve(false);
      }
      pendingRef.current = next;
      setPending(next);
    });
  }, []);

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") settle(false);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [pending, settle]);

  const api = useMemo<ConfirmApi>(() => ({ confirm }), [confirm]);

  const confirmLabel = pending?.confirmLabel ?? "Confirm";
  const cancelLabel = pending?.cancelLabel ?? "Cancel";
  const danger = pending?.danger === true;

  return (
    <ConfirmContext.Provider value={api}>
      {children}
      {mounted && pending
        ? createPortal(
            <div
              role="presentation"
              onClick={() => settle(false)}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 130000,
                background: "rgba(0,0,0,0.48)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 16,
              }}
            >
              <div
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="confirm-dialog-title"
                aria-describedby="confirm-dialog-message"
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: "100%",
                  maxWidth: 400,
                  background: t.surface,
                  border: `1px solid ${t.border}`,
                  borderRadius: 14,
                  padding: "20px 18px",
                }}
              >
                <h2
                  id="confirm-dialog-title"
                  style={{ margin: 0, fontSize: 18, fontWeight: 900, color: t.text }}
                >
                  {pending.title}
                </h2>
                <p
                  id="confirm-dialog-message"
                  style={{
                    margin: "10px 0 0",
                    fontSize: 14,
                    lineHeight: 1.55,
                    color: t.textMuted,
                  }}
                >
                  {pending.message}
                </p>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 10,
                    marginTop: 20,
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => settle(false)}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: `1px solid ${t.border}`,
                      background: t.bg,
                      color: t.text,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {cancelLabel}
                  </button>
                  <button
                    type="button"
                    onClick={() => settle(true)}
                    autoFocus
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "none",
                      background: danger ? (isDark ? "#991b1b" : "#dc2626") : "#111827",
                      color: "#fff",
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    {confirmLabel}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmApi["confirm"] {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within ConfirmProvider");
  }
  return ctx.confirm;
}
