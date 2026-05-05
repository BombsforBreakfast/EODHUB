"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import { useTheme } from "@/app/lib/ThemeContext";

type Props = {
  open: boolean;
  referralUrl: string;
  onClose: () => void;
};

export function ReferralQrModal({ open, referralUrl, onClose }: Props) {
  const { t, isDark } = useTheme();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  const copyLink = useCallback(() => {
    void navigator.clipboard.writeText(referralUrl).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  }, [referralUrl]);

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
        padding: "max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))",
        boxSizing: "border-box",
        background: "rgba(0,0,0,0.72)",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="referral-qr-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 360,
          borderRadius: 16,
          border: `1px solid ${border}`,
          background: surface,
          color: t.text,
          padding: "22px 20px 18px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
          boxSizing: "border-box",
        }}
      >
        <h2 id="referral-qr-title" style={{ margin: 0, fontSize: 18, fontWeight: 900, textAlign: "center" }}>
          Share Your Referral Code
        </h2>
        <p style={{ margin: "10px 0 0", fontSize: 13, lineHeight: 1.5, color: accent, textAlign: "center" }}>
          Let someone scan this to join EOD Hub through your invite.
        </p>

        <div
          style={{
            marginTop: 18,
            display: "flex",
            justifyContent: "center",
            padding: 14,
            background: "#ffffff",
            borderRadius: 12,
            border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : t.border}`,
            boxSizing: "border-box",
          }}
        >
          <QRCodeSVG value={referralUrl} size={220} level="M" includeMargin={false} title="Referral invite QR code" />
        </div>

        <p
          style={{
            margin: "14px 0 0",
            fontSize: 11,
            lineHeight: 1.45,
            color: muted,
            textAlign: "center",
            wordBreak: "break-all",
          }}
        >
          {referralUrl}
        </p>

        <div style={{ marginTop: 18, display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
          <button
            type="button"
            onClick={copyLink}
            style={{
              flex: "1 1 120px",
              minWidth: 0,
              padding: "10px 14px",
              borderRadius: 10,
              border: "none",
              background: copied ? "#16a34a" : "#2563eb",
              color: "white",
              fontWeight: 800,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            {copied ? "Copied!" : "Copy Link"}
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: "1 1 120px",
              minWidth: 0,
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
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
