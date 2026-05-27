"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { PUBLIC_BETA_ACCESS_CODE } from "@/app/lib/betaAccessClient";
import { useTheme } from "@/app/lib/ThemeContext";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function ReferralCopiedHelpModal({ open, onClose }: Props) {
  const { t, isDark } = useTheme();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prevOverflow = document.body.style.overflow;
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const surface = isDark ? "#141618" : t.surface;
  const border = t.border;
  const muted = t.textMuted;
  const accent = "#60a5fa";

  const modal = (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding:
          "max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))",
        boxSizing: "border-box",
        background: "rgba(0,0,0,0.72)",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="referral-beta-help-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 420,
          borderRadius: 16,
          border: `1px solid ${border}`,
          background: surface,
          color: t.text,
          padding: "22px 20px 18px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
          boxSizing: "border-box",
        }}
      >
        <h2 id="referral-beta-help-title" style={{ margin: 0, fontSize: 18, fontWeight: 900, textAlign: "center" }}>
          Referral link copied
        </h2>
        <p style={{ margin: "12px 0 0", fontSize: 14, lineHeight: 1.55, color: t.text, textAlign: "center" }}>
          Share the Beta Access code below with anyone you invite so they can get past the Beta gate and create an
          account.
        </p>

        <div
          style={{
            marginTop: 16,
            padding: "14px 16px",
            borderRadius: 12,
            border: `1px solid ${border}`,
            background: t.bg,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: muted }}>
            Beta Access code
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 24,
              fontWeight: 900,
              letterSpacing: "0.08em",
              color: accent,
            }}
          >
            {PUBLIC_BETA_ACCESS_CODE}
          </div>
        </div>

        <div style={{ marginTop: 18, display: "flex", justifyContent: "center" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              minWidth: 140,
              padding: "10px 14px",
              borderRadius: 10,
              border: `1px solid ${border}`,
              background: t.bg,
              color: t.text,
              fontWeight: 800,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
