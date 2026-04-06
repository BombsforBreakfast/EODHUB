"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/lib/supabaseClient";
import { useTheme } from "../lib/ThemeContext";

export default function SubscribePage() {
  const { t } = useTheme();
  const [loading, setLoading] = useState(false);
  const [gateChecking, setGateChecking] = useState(true);
  const cancelled = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("cancelled") === "1";

  useEffect(() => {
    async function gate() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = "/login";
        return;
      }
      const { data: p } = await supabase
        .from("profiles")
        .select("verification_status, account_type, service, company_name, is_admin")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!p || ((!p.service && !p.company_name) && !p.is_admin)) {
        window.location.href = "/onboarding";
        return;
      }
      if (p.account_type === "employer") {
        window.location.href = "/";
        return;
      }
      if (p.verification_status !== "verified" && !p.is_admin) {
        window.location.href = "/pending";
        return;
      }
      setGateChecking(false);
    }
    gate();
  }, []);

  async function handleSubscribe() {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = "/login"; return; }

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      const json = await res.json();
      if (json.url) {
        window.location.href = json.url;
      } else {
        alert(json.error ?? "Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

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
            No worries — you can subscribe whenever you&apos;re ready.
          </div>
        )}

        <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 20, padding: 36, marginBottom: 24 }}>
          <div style={{ fontSize: 48, fontWeight: 900, letterSpacing: -2, lineHeight: 1 }}>$1.99</div>
          <div style={{ fontSize: 16, color: t.textMuted, marginTop: 4, fontWeight: 600 }}>/month</div>
          <div style={{ fontSize: 13, color: t.textFaint, marginTop: 12, lineHeight: 1.5 }}>
            Free access through 1 June 2026. After that, new members get a 7-day trial, then billing unless you subscribed earlier.
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

          <button
            onClick={handleSubscribe}
            disabled={loading}
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
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
              transition: "opacity 0.15s",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {loading && <span className="btn-spinner" />}
            Subscribe for $1.99/month
          </button>

          <div style={{ marginTop: 14, fontSize: 12, color: t.textFaint }}>
            Cancel anytime. Secure payment via Stripe.
          </div>
        </div>

        <div style={{ fontSize: 13, color: t.textFaint }}>
          Employers post jobs free.{" "}
          <a href="/login" style={{ color: t.textMuted, textDecoration: "underline" }}>Back to login</a>
        </div>
      </div>
    </div>
  );
}
