"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/lib/supabaseClient";
import { useTheme } from "../lib/ThemeContext";
import { isPaywallEnforced, memberHasInteractionAccess } from "../lib/subscriptionAccess";
import { useOnboardingGate } from "../hooks/useOnboardingGate";
import {
  ONBOARDING_GATE_PROFILE_SELECT,
  resolvePreAccessRedirectPath,
  type OnboardingGateProfile,
} from "../lib/onboardingGate";
import { hasFullPlatformAccess } from "../lib/verificationAccess";

export default function SubscribePage() {
  useOnboardingGate("app/subscribe/page.tsx");
  const { t } = useTheme();
  const [gateChecking, setGateChecking] = useState(true);
  const cancelled = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("cancelled") === "1";

  useEffect(() => {
    async function gate() {
      if (!isPaywallEnforced()) {
        window.location.href = "/";
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = "/login";
        return;
      }
      const { data: p } = await supabase
        .from("profiles")
        .select(`${ONBOARDING_GATE_PROFILE_SELECT}, subscription_status, is_admin, verification_status, email_verified, admin_verified`)
        .eq("user_id", user.id)
        .maybeSingle();
      const profile = (p ?? null) as OnboardingGateProfile | null;
      if (!profile) {
        window.location.href = "/onboarding";
        return;
      }
      if (profile.account_type === "employer") {
        window.location.href = "/";
        return;
      }
      if (!hasFullPlatformAccess(profile)) {
        window.location.href = resolvePreAccessRedirectPath(profile);
        return;
      }
      if (
        memberHasInteractionAccess({
          accountType: profile.account_type,
          subscriptionStatus: profile.subscription_status ?? null,
          authUserCreatedAtIso: user.created_at ?? null,
          isAdmin: profile.is_admin,
        })
      ) {
        window.location.href = "/";
        return;
      }
      setGateChecking(false);
    }
    gate();
  }, []);

  if (gateChecking) {
    return (
      <div style={{ minHeight: "100vh", background: t.bg, color: t.textMuted, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        Loading…
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: t.bg, color: t.text, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 480, width: "100%", textAlign: "center" }}>
        <div style={{ fontSize: 42, fontWeight: 900, letterSpacing: -1, marginBottom: 8 }}>EOD HUB</div>
        <div style={{ fontSize: 13, color: t.textFaint, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", marginBottom: 40 }}>
          Built for EOD Techs, by an EOD Tech.
        </div>

        {cancelled && (
          <div style={{ background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 12, padding: "12px 16px", marginBottom: 24, fontSize: 14, color: "#92400e" }}>
            Your previous access flow was canceled.
          </div>
        )}

        <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 20, padding: 36, marginBottom: 24 }}>
          <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: -1, lineHeight: 1.15 }}>Access currently limited</div>
          <div style={{ fontSize: 13, color: t.textFaint, marginTop: 12, lineHeight: 1.5 }}>
            This screen is temporarily used for account-access gating while platform access settings are being updated.
          </div>

          <div style={{ marginTop: 28, display: "grid", gap: 14, textAlign: "left" }}>
            {[
              "Full access to the EOD community feed",
              "Browse & apply to EOD, UXO, CBRN job listings",
              "Direct messaging with other members",
              "Member discovery & networking",
              "Events & community updates",
            ].map((feature) => (
              <div key={feature} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 15 }}>
                <span style={{ color: "#16a34a", fontWeight: 900, flexShrink: 0, marginTop: 1 }}>✓</span>
                <span style={{ color: t.text }}>{feature}</span>
              </div>
            ))}
          </div>

          <a
            href="/support"
            style={{
              marginTop: 28,
              width: "100%",
              background: "#111",
              color: "white",
              border: "none",
              borderRadius: 14,
              padding: "16px 0",
              fontSize: 17,
              fontWeight: 800,
              cursor: "pointer",
              transition: "opacity 0.15s",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              textDecoration: "none",
            }}
          >
            Contact support
          </a>

          <div style={{ marginTop: 14, fontSize: 12, color: t.textFaint }}>
            We&apos;ll continue expanding access as rollout updates are completed.
          </div>
        </div>

        <div style={{ fontSize: 13, color: t.textFaint }}>
          Need to sign in with a different account?{" "}
          <a href="/login" style={{ color: t.textMuted, textDecoration: "underline" }}>Back to login</a>
        </div>
      </div>
    </div>
  );
}
