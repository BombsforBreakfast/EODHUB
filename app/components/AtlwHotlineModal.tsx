"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../lib/ThemeContext";

export const ATLW_HOTLINE_DISPLAY = "1-888-412-0470";
export const ATLW_HOTLINE_TEL = "+18884120470";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function AtlwHotlineModal({ open, onClose }: Props) {
  const { t } = useTheme();

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

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding:
          "max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))",
        boxSizing: "border-box",
        background: "rgba(0,0,0,0.55)",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="atlw-hotline-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 400,
          borderRadius: 16,
          border: `1px solid ${t.border}`,
          background: t.surface,
          color: t.text,
          padding: "22px 20px 18px",
          boxSizing: "border-box",
          boxShadow: "0 16px 48px rgba(0,0,0,0.28)",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <div>
            <div id="atlw-hotline-title" style={{ fontSize: 18, fontWeight: 900, lineHeight: 1.25 }}>
              After the Long Walk
            </div>
            <div style={{ marginTop: 6, fontSize: 14, fontWeight: 700, color: "#dc2626" }}>
              24-hour suicide support hotline
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              flexShrink: 0,
              width: 36,
              height: 36,
              borderRadius: 10,
              border: `1px solid ${t.border}`,
              background: t.bg,
              color: t.text,
              fontSize: 22,
              lineHeight: 1,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
            }}
          >
            ×
          </button>
        </div>

        <p style={{ margin: "0 0 18px", fontSize: 14, lineHeight: 1.55, color: t.textMuted, textAlign: "center" }}>
          Tap the number below to call and talk with a fellow EOD Tech for 24 hour peer-to-peer support and suicide prevention.
        </p>

        <a
          href={`tel:${ATLW_HOTLINE_TEL}`}
          style={{
            display: "block",
            textAlign: "center",
            padding: "16px 18px",
            borderRadius: 12,
            background: "#dc2626",
            color: "#ffffff",
            fontSize: 22,
            fontWeight: 900,
            letterSpacing: "0.02em",
            textDecoration: "none",
            boxShadow: "0 4px 14px rgba(220, 38, 38, 0.35)",
          }}
        >
          {ATLW_HOTLINE_DISPLAY}
        </a>

        <p style={{ margin: "14px 0 0", fontSize: 12, lineHeight: 1.5, color: t.textFaint, textAlign: "center" }}>
          Available 24 hours a day, 7 days a week.
        </p>

        <p style={{ margin: "16px 0 0", fontSize: 13, lineHeight: 1.5, color: t.textMuted, textAlign: "center" }}>
          If you&apos;re having a medical emergency and are at immediate risk, please call{" "}
          <a href="tel:911" style={{ color: t.text, fontWeight: 800, textDecoration: "underline" }}>
            911
          </a>
          .
        </p>
      </div>
    </div>,
    document.body,
  );
}
