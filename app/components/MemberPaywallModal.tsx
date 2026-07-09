"use client";

import { useEffect, useState } from "react";
import { useTheme } from "../lib/ThemeContext";

type Props = {
  open: boolean;
  onClose: () => void;
  message?: string;
  /** When true, keep the modal blocking (no dismiss button). */
  requireSubscription?: boolean;
  /** Post-onboarding acknowledgement before verification. */
  onboardingAck?: {
    onContinue: () => void | Promise<void>;
  };
};

const DEFAULT_MSG =
  "Access to this action is currently limited.";

const ONBOARDING_BODY =
  "Access rules and feature availability can change over time. You can continue now and review account updates in Support and Terms anytime.";

export default function MemberPaywallModal({
  open,
  onClose,
  message = DEFAULT_MSG,
  requireSubscription = false,
  onboardingAck,
}: Props) {
  const { t } = useTheme();
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [continuing, setContinuing] = useState(false);

  const isOnboarding = !!onboardingAck;
  const blocking = requireSubscription && !isOnboarding;

  useEffect(() => {
    if (!open) {
      setOnboardingChecked(false);
      setContinuing(false);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isOnboarding && !blocking) onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, isOnboarding]);

  if (!open) return null;

  const bodyText = isOnboarding ? ONBOARDING_BODY : message;

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
      onClick={isOnboarding || blocking ? undefined : onClose}
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
          {isOnboarding ? "Member access" : "Access update"}
        </div>
        <p style={{ margin: 0, fontSize: 15, color: t.textMuted, lineHeight: 1.55 }}>{bodyText}</p>
        {isOnboarding && onboardingAck && (
          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              marginTop: 16,
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 600,
              color: t.text,
            }}
          >
            <input
              type="checkbox"
              checked={onboardingChecked}
              onChange={(e) => setOnboardingChecked(e.target.checked)}
              style={{ marginTop: 3, width: 18, height: 18, flexShrink: 0 }}
            />
            <span>I have read and understand the access information above.</span>
          </label>
        )}
        <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end", flexWrap: "wrap" }}>
          {isOnboarding && onboardingAck ? (
            <button
              type="button"
              disabled={!onboardingChecked || continuing}
              onClick={async () => {
                if (!onboardingChecked || continuing) return;
                setContinuing(true);
                try {
                  await onboardingAck.onContinue();
                } finally {
                  setContinuing(false);
                }
              }}
              style={{
                padding: "10px 18px",
                borderRadius: 10,
                border: "none",
                background: "#111",
                color: "#fff",
                fontWeight: 700,
                fontSize: 14,
                cursor: !onboardingChecked || continuing ? "not-allowed" : "pointer",
                width: "100%",
                opacity: !onboardingChecked || continuing ? 0.45 : 1,
              }}
            >
              {continuing ? "Saving…" : "Continue to verification"}
            </button>
          ) : (
            <>
              {!blocking && (
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
              )}
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
                  width: blocking ? "100%" : undefined,
                }}
              >
                Continue
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
