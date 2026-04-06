"use client";

import { useState } from "react";
import Link from "next/link";
import MemberPaywallModal from "../components/MemberPaywallModal";
import { useTheme } from "../lib/ThemeContext";

type Mode = "none" | "trial" | "onboarding";

export default function PaywallPreviewClient() {
  const { t, isDark } = useTheme();
  const [mode, setMode] = useState<Mode>("none");

  return (
    <div style={{ minHeight: "100vh", background: t.bg, color: t.text, padding: 24 }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, margin: "0 0 8px" }}>Paywall preview</h1>
        <p style={{ margin: "0 0 20px", fontSize: 15, color: t.textMuted, lineHeight: 1.55 }}>
          Open each modal exactly as users see it. This page does not charge a card. For a full Stripe test, use a{" "}
          <strong>verified member</strong> account and go to{" "}
          <Link href="/subscribe" style={{ color: "#2563eb", fontWeight: 700 }}>
            /subscribe
          </Link>{" "}
          with Stripe test keys.
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 24 }}>
          <button
            type="button"
            onClick={() => setMode("trial")}
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              border: `1px solid ${t.border}`,
              background: mode === "trial" ? t.text : t.surface,
              color: mode === "trial" ? t.surface : t.text,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Trial / access modal (home)
          </button>
          <button
            type="button"
            onClick={() => setMode("onboarding")}
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              border: `1px solid ${t.border}`,
              background: mode === "onboarding" ? t.text : t.surface,
              color: mode === "onboarding" ? t.surface : t.text,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Onboarding subscription ack
          </button>
          <button
            type="button"
            onClick={() => setMode("none")}
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              border: `1px solid ${t.border}`,
              background: t.surface,
              fontWeight: 600,
              cursor: "pointer",
              color: t.textMuted,
            }}
          >
            Close modals
          </button>
        </div>

        <div
          style={{
            background: t.surface,
            border: `1px solid ${t.border}`,
            borderRadius: 14,
            padding: 18,
            fontSize: 14,
            color: t.textMuted,
            lineHeight: 1.55,
          }}
        >
          <div style={{ fontWeight: 800, color: t.text, marginBottom: 8 }}>What each one is</div>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li style={{ marginBottom: 8 }}>
              <strong>Trial / access</strong> — title &quot;Subscription&quot;, default message, <strong>Not now</strong> (dismiss) and{" "}
              <strong>Subscribe</strong> (goes to <code>/subscribe</code>). Shown on the home feed when a member hits a paywalled action.
            </li>
            <li>
              <strong>Onboarding ack</strong> — title &quot;Member subscription&quot;, long policy text, checkbox, full-width{" "}
              <strong>Continue to verification</strong>. Real flow saves acknowledgement then sends you to <code>/pending</code>.
            </li>
          </ul>
          <p style={{ margin: "14px 0 0", fontSize: 13 }}>
            Theme: <strong>{isDark ? "dark" : "light"}</strong> (toggle from the main app nav if available).
          </p>
        </div>
      </div>

      <MemberPaywallModal
        open={mode === "trial"}
        onClose={() => setMode("none")}
      />
      <MemberPaywallModal
        open={mode === "onboarding"}
        onClose={() => setMode("none")}
        onboardingAck={{
          onContinue: async () => {
            alert("Preview only — in production this saves acknowledgement and goes to /pending.");
            setMode("none");
          },
        }}
      />
    </div>
  );
}
