"use client";

import { createPortal } from "react-dom";
import { useEffect } from "react";
import { useTheme } from "@/app/lib/ThemeContext";

type Props = {
  open: boolean;
  number?: number;
  profileHref: string;
  onClose: () => void;
};

export function PlankHolderEarnedModal({ open, number, profileHref, onClose }: Props) {
  const { t, isDark } = useTheme();

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="plank-holder-earned-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(15,23,42,0.62)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 18,
      }}
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(440px, 100%)",
          borderRadius: 22,
          border: `1px solid ${isDark ? "rgba(34,211,238,0.35)" : "rgba(14,116,144,0.25)"}`,
          background: isDark ? "#0f172a" : t.surface,
          color: t.text,
          boxShadow: "0 24px 70px rgba(0,0,0,0.28)",
          padding: 24,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 44, lineHeight: 1 }} aria-hidden>
          ⚓
        </div>
        <h2 id="plank-holder-earned-title" style={{ margin: "14px 0 8px", fontSize: 24, fontWeight: 950 }}>
          Plank Holder Earned
        </h2>
        <p style={{ margin: 0, color: t.textMuted, fontSize: 15, lineHeight: 1.5 }}>
          You are among the first 50 members helping establish the EOD-HUB network.
        </p>
        {number && (
          <div
            style={{
              margin: "18px auto 0",
              display: "inline-flex",
              borderRadius: 999,
              padding: "8px 14px",
              background: isDark ? "rgba(34,211,238,0.12)" : "#ecfeff",
              color: isDark ? "#67e8f9" : "#155e75",
              border: `1px solid ${isDark ? "rgba(34,211,238,0.35)" : "rgba(14,116,144,0.25)"}`,
              fontWeight: 950,
            }}
          >
            Plank Holder #{number}
          </div>
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 22, flexWrap: "wrap" }}>
          <a
            href={profileHref}
            onClick={onClose}
            style={{
              border: "none",
              borderRadius: 12,
              background: "#0f172a",
              color: "white",
              padding: "10px 18px",
              fontWeight: 900,
              textDecoration: "none",
            }}
          >
            View Profile
          </a>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: `1px solid ${t.border}`,
              borderRadius: 12,
              background: t.surface,
              color: t.text,
              padding: "10px 18px",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
