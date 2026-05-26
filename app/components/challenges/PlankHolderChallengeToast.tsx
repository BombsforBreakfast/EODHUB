"use client";

import type { PlankHolderToastState } from "@/app/lib/plankHolderChallengeClient";

type Props = {
  toast: PlankHolderToastState;
};

export function PlankHolderChallengeToast({ toast }: Props) {
  if (!toast) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        right: 18,
        bottom: 18,
        zIndex: 10000,
        width: "min(320px, calc(100vw - 32px))",
        borderRadius: 16,
        border: "1px solid rgba(14, 116, 144, 0.28)",
        background: "#ecfeff",
        color: "#155e75",
        boxShadow: "0 16px 40px rgba(15,23,42,0.18)",
        padding: "12px 14px",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 900 }}>{toast.title}</div>
      <div style={{ fontSize: 14, fontWeight: 800, marginTop: 2 }}>{toast.detail}</div>
      <div style={{ fontSize: 12, color: "#0e7490", marginTop: 3 }}>{toast.progress}</div>
    </div>
  );
}
