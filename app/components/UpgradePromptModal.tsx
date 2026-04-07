"use client";

import { useEffect } from "react";
import { useTheme } from "../lib/ThemeContext";

type Props = {
  open: boolean;
  onClose: () => void;
  ctaLabel?: string;
  onUpgradeClick?: () => void;
};

export default function UpgradePromptModal({
  open,
  onClose,
  ctaLabel = "Upgrade to Senior - $2/month",
  onUpgradeClick,
}: Props) {
  const { t } = useTheme();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10070,
        background: "rgba(0,0,0,0.48)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-prompt-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 430,
          background: t.surface,
          border: `1px solid ${t.border}`,
          borderRadius: 14,
          padding: "22px 20px",
          boxShadow: "0 16px 48px rgba(0,0,0,0.22)",
        }}
      >
        <h2 id="upgrade-prompt-title" style={{ margin: 0, fontSize: 21, fontWeight: 900, color: t.text }}>
          Unlock Full Job Access
        </h2>
        <p style={{ margin: "10px 0 0", fontSize: 14, lineHeight: 1.6, color: t.textMuted }}>
          Upgrade to Senior for full access to the job board and premium tools.
        </p>

        <ul style={{ margin: "14px 0 0", paddingLeft: 18, color: t.text, lineHeight: 1.7, fontSize: 14 }}>
          <li>Full job board</li>
          <li>Advanced job filtering</li>
          <li>Full business directory</li>
          <li>Direct messaging</li>
          <li>Rabbithole access (coming soon)</li>
        </ul>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={onClose}
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
            Not now
          </button>
          <button
            type="button"
            onClick={onUpgradeClick ?? (() => { window.location.href = "/subscribe"; })}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "none",
              background: "#111",
              color: "white",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {ctaLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
