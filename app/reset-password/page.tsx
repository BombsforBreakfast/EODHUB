"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/lib/supabaseClient";

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Supabase fires PASSWORD_RECOVERY when the reset link is opened
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
      }
    });
    return () => subscription.unsubscribe();
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
      setDone(true);
      setTimeout(() => { window.location.href = "/"; }, 2000);
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    padding: 10,
    borderRadius: 10,
    border: "1px solid #ccc",
    fontSize: 16,
    width: "100%",
    boxSizing: "border-box",
  };

  return (
    <div style={{ padding: 40, maxWidth: 500, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontSize: 52, fontWeight: 900, letterSpacing: -1, lineHeight: 1 }}>EOD HUB</div>
      </div>

      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Set New Password</h1>

      {done ? (
        <div style={{ marginTop: 24, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: 20, textAlign: "center" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
          <div style={{ fontWeight: 700 }}>Password updated!</div>
          <div style={{ fontSize: 14, color: "#555", marginTop: 4 }}>Redirecting you to the feed...</div>
        </div>
      ) : !ready ? (
        <div style={{ marginTop: 24, color: "#888", fontSize: 14 }}>
          Verifying your reset link... If nothing happens, your link may have expired.{" "}
          <a href="/login" style={{ color: "#111", fontWeight: 700 }}>Request a new one</a>.
        </div>
      ) : (
        <form
          onSubmit={(e) => { e.preventDefault(); handleReset(); }}
          style={{ display: "grid", gap: 12, marginTop: 24 }}
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
          {error && <div style={{ color: "#ef4444", fontSize: 14 }}>{error}</div>}
          <button
            type="submit"
            disabled={submitting || !password || password !== confirmPassword}
            style={{
              padding: 12, borderRadius: 12, border: "none",
              background: "black", color: "white", fontWeight: 700,
              cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting || !password || password !== confirmPassword ? 0.7 : 1,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
            }}
          >
            {submitting && <span className="btn-spinner" />}
            Update Password
          </button>
        </form>
      )}
    </div>
  );
}
