"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/lib/supabaseClient";
import { useTheme } from "../lib/ThemeContext";

type Stage = "verifying" | "form" | "done" | "invalid";

export default function ResetPasswordPage() {
  const { t } = useTheme();
  const [stage, setStage] = useState<Stage>("verifying");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // createBrowserClient auto-exchanges the ?code= in the URL when the page
  // loads and fires PASSWORD_RECOVERY (or SIGNED_IN) before React mounts.
  // We catch both the early fire (via getSession) and any late fire (via the
  // subscription), then fall back to "invalid" after 8 s if nothing arrives.
  useEffect(() => {
    let resolved = false;

    function resolve(hasSession: boolean) {
      if (resolved) return;
      resolved = true;
      setStage(hasSession ? "form" : "invalid");
    }

    // Catch events that fire after mount (normal case).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        resolve(!!session);
      }
    });

    // Catch session that was already established before mount (race condition).
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) resolve(true);
    });

    // If no ?code= was in the URL (user navigated here directly), bail out.
    const hasCode = new URLSearchParams(window.location.search).has("code");
    if (!hasCode) {
      // Small delay so getSession() above can still win if there's an active session.
      const noCodeTimer = setTimeout(() => resolve(false), 500);
      return () => {
        subscription.unsubscribe();
        clearTimeout(noCodeTimer);
      };
    }

    // With a code present, give the exchange up to 8 s before giving up.
    const timer = setTimeout(() => resolve(false), 8000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  async function handleReset() {
    setError(null);
    if (!password) return;
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    try {
      setSubmitting(true);
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setStage("done");
      setTimeout(() => { window.location.href = "/login"; }, 2500);
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    padding: "12px 14px",
    borderRadius: 12,
    border: `1px solid ${t.inputBorder}`,
    fontSize: 16,
    width: "100%",
    boxSizing: "border-box",
    background: t.input,
    color: t.text,
  };

  return (
    <div style={{ minHeight: "100vh", background: t.bg, color: t.text, padding: 40, boxSizing: "border-box" }}>
      <div style={{ maxWidth: 460, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 52, fontWeight: 900, letterSpacing: -1, lineHeight: 1 }}>EOD HUB</div>
        </div>

        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 24 }}>Set New Password</h1>

        {stage === "verifying" && (
          <div style={{ color: t.textMuted, fontSize: 15 }}>
            Verifying your reset link…
          </div>
        )}

        {stage === "invalid" && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: 20, textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
            <div style={{ fontWeight: 700, color: "#991b1b", marginBottom: 6 }}>Link invalid or expired</div>
            <div style={{ fontSize: 14, color: "#7f1d1d" }}>
              This reset link is invalid or has expired.{" "}
              <a href="/login" style={{ color: "#b91c1c", fontWeight: 700 }}>
                Request a new one
              </a>
              .
            </div>
          </div>
        )}

        {stage === "done" && (
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: 20, textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
            <div style={{ fontWeight: 700, color: "#14532d", marginBottom: 4 }}>Password updated!</div>
            <div style={{ fontSize: 14, color: "#166534" }}>Taking you back to login…</div>
          </div>
        )}

        {stage === "form" && (
          <form
            onSubmit={(e) => { e.preventDefault(); handleReset(); }}
            style={{ display: "grid", gap: 12 }}
          >
            <input
              type="password"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
              autoFocus
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              style={{
                ...inputStyle,
                borderColor: confirmPassword && confirmPassword !== password ? "#ef4444" : undefined,
              }}
            />
            {error && (
              <div style={{ color: "#ef4444", fontSize: 14, fontWeight: 600 }}>{error}</div>
            )}
            <button
              type="submit"
              disabled={submitting || !password || password !== confirmPassword}
              style={{
                padding: "13px 12px",
                borderRadius: 12,
                border: "none",
                background: t.text,
                color: t.surface,
                fontWeight: 700,
                fontSize: 16,
                cursor: submitting ? "not-allowed" : "pointer",
                opacity: submitting || !password || password !== confirmPassword ? 0.65 : 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {submitting && <span className="btn-spinner" />}
              Update Password
            </button>
          </form>
        )}

        <div style={{ marginTop: 32, borderTop: `1px solid ${t.border}`, paddingTop: 16, fontSize: 12, color: t.textMuted, textAlign: "center" }}>
          © EOD Hub — A professional network for the Explosive Ordnance Disposal community
        </div>
      </div>
    </div>
  );
}
