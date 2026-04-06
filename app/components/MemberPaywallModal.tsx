"use client";

import { useEffect } from "react";
import { useTheme } from "../lib/ThemeContext";

type Props = {
  open: boolean;
  onClose: () => void;
  message?: string;
};

const DEFAULT_MSG =
  "Your free trial has expired. Please subscribe for full access!";

export default function MemberPaywallModal({ open, onClose, message = DEFAULT_MSG }: Props) {
  const { t } = useTheme();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10060,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="paywall-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: t.surface,
          borderRadius: 14,
          border: `1px solid ${t.border}`,
          maxWidth: 400,
          width: "100%",
          padding: "24px 22px",
          boxShadow: "0 16px 48px rgba(0,0,0,0.2)",
        }}
      >
        <div id="paywall-title" style={{ fontWeight: 900, fontSize: 18, color: t.text, marginBottom: 12 }}>
          Subscription
        </div>
        <p style={{ margin: 0, fontSize: 15, color: t.textMuted, lineHeight: 1.55 }}>{message}</p>
        <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              border: `1px solid ${t.border}`,
              background: t.bg,
              color: t.text,
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Not now
          </button>
          <button
            type="button"
            onClick={() => {
              window.location.href = "/subscribe";
            }}
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              border: "none",
              background: "#111",
              color: "#fff",
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Subscribe
          </button>
        </div>
      </div>
    </div>
  );
}
