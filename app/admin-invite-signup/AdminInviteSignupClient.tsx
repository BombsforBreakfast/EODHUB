"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../lib/lib/supabaseClient";
import EodCrabLogo from "../components/EodCrabLogo";
import { useTheme } from "../lib/ThemeContext";

export default function AdminInviteSignupClient() {
  const { t, isDark } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [inviteKey, setInviteKey] = useState<string | null>(null);

  useEffect(() => {
    const k = new URLSearchParams(window.location.search).get("k");
    setInviteKey(k);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteKey) {
      alert("Invalid invite link.");
      return;
    }
    if (password !== confirmPassword) {
      alert("Passwords do not match.");
      return;
    }
    if (!firstName.trim() || !lastName.trim()) {
      alert("First and last name are required.");
      return;
    }

    try {
      setSubmitting(true);
      const { error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (signUpError) {
        alert(signUpError.message);
        return;
      }

      const { data: signInData, error: signInError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
      if (signInError || !signInData.session) {
        alert(signInError?.message ?? "Sign-in failed. If email confirmation is required, confirm then try logging in.");
        return;
      }

      const res = await fetch("/api/admin-invite/complete-profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${signInData.session.access_token}`,
        },
        body: JSON.stringify({
          inviteKey,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert((json as { error?: string }).error ?? "Could not complete staff profile.");
        return;
      }

      sessionStorage.setItem("eod_active", "1");
      window.location.href = "/";
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 10,
    border: `1px solid ${t.border}`,
    background: t.surface,
    color: t.text,
    fontSize: 15,
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontWeight: 700,
    fontSize: 13,
    marginBottom: 6,
    color: t.text,
  };

  if (inviteKey === null) {
    return (
      <div style={{ minHeight: "100vh", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: t.textMuted }}>Loading…</span>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: t.bg, color: t.text, padding: 24 }}>
      <div style={{ maxWidth: 420, margin: "0 auto", paddingTop: 40 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <Link href="/" aria-label="Home">
            <EodCrabLogo variant="navMobile" />
          </Link>
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 900, textAlign: "center", margin: "0 0 8px" }}>Staff admin signup</h1>
        <p style={{ fontSize: 14, color: t.textMuted, textAlign: "center", lineHeight: 1.5, marginBottom: 28 }}>
          This page is not linked from public signup. Use the invite URL from an existing admin.
        </p>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          style={{
            border: `1px solid ${t.border}`,
            borderRadius: 16,
            padding: 24,
            background: t.surface,
            boxShadow: isDark ? "none" : "0 4px 24px rgba(0,0,0,0.06)",
          }}
        >
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Password</label>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Confirm password</label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              style={inputStyle}
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
            <div>
              <label style={labelStyle}>First name</label>
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Last name</label>
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} required style={inputStyle} />
            </div>
          </div>
          <button
            type="submit"
            disabled={submitting}
            style={{
              width: "100%",
              padding: "14px 20px",
              borderRadius: 12,
              border: "none",
              background: "#111",
              color: "white",
              fontWeight: 800,
              fontSize: 16,
              cursor: submitting ? "wait" : "pointer",
              opacity: submitting ? 0.75 : 1,
            }}
          >
            {submitting ? "Creating account…" : "Create staff admin account"}
          </button>
        </form>

        <p style={{ fontSize: 13, color: t.textFaint, textAlign: "center", marginTop: 24 }}>
          Already have an account?{" "}
          <Link href="/login" style={{ color: "#2563eb", fontWeight: 700 }}>
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
