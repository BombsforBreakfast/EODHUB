"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/lib/supabaseClient";
import { Turnstile } from "@marsidev/react-turnstile";
import type { TurnstileInstance } from "@marsidev/react-turnstile";
import { useTheme } from "../lib/ThemeContext";


export default function LoginPage() {
  const { t, isDark } = useTheme();
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [isGoogleAccount, setIsGoogleAccount] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState(false);
  const turnstileRef = useRef<TurnstileInstance>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
  const [signupCount, setSignupCount] = useState<number | null>(null);
  const [countFlash, setCountFlash] = useState(false);

  // Persist ?ref= referral code through signup flow via localStorage
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) localStorage.setItem("eod_ref", ref.toUpperCase());
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadCount() {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const res = await fetch("/api/public-signup-count", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { count?: number };
        const n = typeof data.count === "number" ? data.count : 0;
        if (cancelled) return;
        setSignupCount((prev) => {
          const prevN = prev ?? null;
          if (prevN !== null && n > prevN) {
            setCountFlash(true);
            window.setTimeout(() => setCountFlash(false), 900);
          }
          return n;
        });
      } catch {
        /* ignore */
      }
    }

    void loadCount();
    const pollMs = 5000;
    const interval = window.setInterval(loadCount, pollMs);

    const channel = supabase
      .channel("login-page-signup-count")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        () => {
          void loadCount();
        }
      )
      .subscribe();

    const onVis = () => {
      if (!document.hidden) void loadCount();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
      supabase.removeChannel(channel);
    };
  }, []);

  function signInWithGoogleOAuth() {
    const redirectTo = `${window.location.origin}/onboarding`;
    const hint = email.trim();
    const options =
      hint.includes("@")
        ? { redirectTo, queryParams: { login_hint: hint } }
        : { redirectTo };
    return supabase.auth.signInWithOAuth({ provider: "google", options });
  }

  async function verifyTurnstile(): Promise<boolean> {
    if (!siteKey) return true; // not configured — allow through
    if (turnstileError) return true; // widget failed to load — allow through
    if (!turnstileToken) return false;
    const res = await fetch("/api/verify-turnstile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: turnstileToken }),
    });
    const data = await res.json() as { success: boolean };
    return data.success;
  }

  async function handleLogin() {
    try {
      setSubmitting(true);

      if (!await verifyTurnstile()) {
        alert("Please complete the security check.");
        turnstileRef.current?.reset();
        setTurnstileToken(null);
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        alert("Login error: " + error.message);
        turnstileRef.current?.reset();
        setTurnstileToken(null);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        alert("Login succeeded, but no session was found yet. Please try again.");
        return;
      }

      // Remember me logic — mark whether this session should persist past browser close
      if (!rememberMe) {
        localStorage.setItem("eod_no_persist", "1");
      } else {
        localStorage.removeItem("eod_no_persist");
      }
      sessionStorage.setItem("eod_active", "1");

      const { data: profile } = await supabase
        .from("profiles")
        .select("verification_status")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (profile?.verification_status === "verified") {
        window.location.href = "/";
      } else {
        window.location.href = "/pending";
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignup() {
    if (password !== confirmPassword) {
      alert("Passwords do not match.");
      return;
    }

    try {
      setSubmitting(true);

      if (!await verifyTurnstile()) {
        alert("Please complete the security check.");
        turnstileRef.current?.reset();
        setTurnstileToken(null);
        return;
      }

      const { error: signUpError } = await supabase.auth.signUp({ email, password });

      if (signUpError) {
        alert("Signup error: " + signUpError.message);
        return;
      }

      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });

      if (signInError || !signInData.user) {
        alert("Sign-in after signup failed: " + (signInError?.message ?? "No user"));
        return;
      }

      sessionStorage.setItem("eod_active", "1");
      window.location.href = "/onboarding";
    } finally {
      setSubmitting(false);
    }
  }

  async function handleForgotPassword() {
    if (!forgotEmail.trim()) return;
    try {
      setSubmitting(true);
      setIsGoogleAccount(false);

      // If this email only has OAuth (no email/password identity), password reset does not apply
      const res = await fetch("/api/check-auth-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });
      const authJson = await res.json() as { providers?: string[] };
      const providers = authJson.providers ?? [];
      if (providers.length > 0) {
        const hasEmailIdentity = providers.includes("email");
        const hasOnlyOAuth = !hasEmailIdentity;
        if (hasOnlyOAuth) {
          setIsGoogleAccount(true);
          return;
        }
      }

      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        alert("Error: " + error.message);
        return;
      }
      setForgotSent(true);
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    padding: 10,
    borderRadius: 10,
    border: `1px solid ${t.inputBorder}`,
    fontSize: 16,
    width: "100%",
    boxSizing: "border-box",
    background: t.input,
    color: t.text,
  };

  const buttonPrimary: React.CSSProperties = {
    padding: 12,
    borderRadius: 12,
    border: "none",
    background: t.text,
    color: t.surface,
    fontWeight: 700,
    cursor: "pointer",
  };

  const buttonSecondary: React.CSSProperties = {
    padding: 12,
    borderRadius: 12,
    border: `1px solid ${t.border}`,
    background: t.surface,
    color: t.text,
    fontWeight: 700,
    cursor: "pointer",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        boxSizing: "border-box",
        padding: 40,
        maxWidth: 500,
        margin: "0 auto",
        color: t.text,
        background: t.bg,
      }}
    >
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontSize: 52, fontWeight: 900, letterSpacing: -1, lineHeight: 1, color: t.text }}>EOD HUB</div>
        <div style={{ fontSize: 14, color: t.textMuted, marginTop: 6, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>Built for EOD Techs, by an EOD Tech.</div>
        <div
          aria-live="polite"
          aria-atomic="true"
          style={{
            marginTop: 18,
            fontSize: 15,
            lineHeight: 1.45,
            color: t.textMuted,
            fontWeight: 600,
            padding: "12px 16px",
            borderRadius: 12,
            border: `1px solid ${t.border}`,
            background: countFlash ? (isDark ? "rgba(124, 58, 237, 0.18)" : "rgba(124, 58, 237, 0.08)") : t.surface,
            transition: "background 0.35s ease",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {signupCount === null ? (
            <span style={{ opacity: 0.7 }}>Loading community size…</span>
          ) : (
            <>
              <span style={{ color: t.text, fontWeight: 800, fontSize: 17 }}>{signupCount.toLocaleString()}</span>{" "}
              EOD HUB users have already signed up!
            </>
          )}
        </div>
      </div>

      <h1 style={{ fontSize: 28, fontWeight: 700 }}>
        {mode === "login" ? "Login" : mode === "signup" ? "Sign Up" : "Reset Password"}
      </h1>

      {/* ── Forgot password flow ── */}
      {mode === "forgot" && (
        <div style={{ marginTop: 20 }}>
          {isGoogleAccount ? (
            <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 12, padding: 20, textAlign: "center" }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>G</div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Google Account Detected</div>
              <div style={{ fontSize: 14, color: t.textMuted, marginBottom: 16 }}>
                This account was created with Google Sign-In — there&apos;s no password to reset. Use the <strong>Continue with Google</strong> button on the login page to sign in.
              </div>
              <button type="button" onClick={() => { setMode("login"); setIsGoogleAccount(false); }}
                style={{ background: "#1d4ed8", color: "white", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                Back to Login
              </button>
            </div>
          ) : forgotSent ? (
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: 20, textAlign: "center" }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📬</div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Check your email</div>
              <div style={{ fontSize: 14, color: t.textMuted }}>
                We sent a password reset link to <strong>{forgotEmail}</strong>. Click the link in the email to set a new password.
              </div>
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); handleForgotPassword(); }} style={{ display: "grid", gap: 12, marginTop: 16 }}>
              <div style={{ fontSize: 14, color: t.textMuted }}>
                Enter your email address and we&apos;ll send you a link to reset your password.
              </div>
              <input
                type="email"
                placeholder="Email address"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                style={inputStyle}
                autoFocus
              />
              <button type="submit" disabled={submitting || !forgotEmail.trim()} style={{ ...buttonPrimary, opacity: submitting || !forgotEmail.trim() ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                {submitting && <span className={isDark ? "btn-spinner btn-spinner-dark" : "btn-spinner"} />}
                Send Reset Link
              </button>
            </form>
          )}
          <button
            type="button"
            onClick={() => { setMode("login"); setForgotSent(false); setForgotEmail(""); }}
            style={{ ...buttonSecondary, marginTop: 12, width: "100%" }}
          >
            Back to Login
          </button>
        </div>
      )}

      {/* ── Login / Signup flow ── */}
      {mode !== "forgot" && (
        <form
          onSubmit={(e) => { e.preventDefault(); mode === "login" ? handleLogin() : handleSignup(); }}
          style={{ display: "grid", gap: 12, marginTop: 20 }}
        >
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
          />

          <input
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
          />

          {mode === "signup" && (
            <input
              placeholder="Confirm Password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              style={{
                ...inputStyle,
                borderColor: confirmPassword && confirmPassword !== password ? "#ef4444" : undefined,
              }}
            />
          )}

          {mode === "login" && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer", userSelect: "none" }}>
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  style={{ width: 16, height: 16, cursor: "pointer" }}
                />
                Remember me on this device
              </label>
              <button
                type="button"
                onClick={() => setMode("forgot")}
                style={{ background: "none", border: "none", fontSize: 14, color: t.textMuted, cursor: "pointer", padding: 0, textDecoration: "underline" }}
              >
                Forgot password?
              </button>
            </div>
          )}

          {siteKey && (
            <Turnstile
              ref={turnstileRef}
              siteKey={siteKey}
              onSuccess={(token) => setTurnstileToken(token)}
              onExpire={() => setTurnstileToken(null)}
              onError={() => { setTurnstileToken(null); setTurnstileError(true); }}
              options={{ theme: "light", size: "normal" }}
            />
          )}

          {mode === "login" ? (
            <>
              <button
                onClick={handleLogin}
                disabled={submitting || (!!siteKey && !turnstileToken && !turnstileError)}
                style={{ ...buttonPrimary, opacity: submitting || (!!siteKey && !turnstileToken && !turnstileError) ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}
              >
                {submitting && <span className={isDark ? "btn-spinner btn-spinner-dark" : "btn-spinner"} />}
                Login
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0" }}>
                <div style={{ flex: 1, height: 1, background: t.border }} />
                <span style={{ fontSize: 13, color: t.textMuted }}>or</span>
                <div style={{ flex: 1, height: 1, background: t.border }} />
              </div>
              <button
                type="button"
                onClick={() => signInWithGoogleOAuth()}
                disabled={submitting}
                style={{ ...buttonSecondary, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}
              >
                <GoogleIcon />
                Sign in with Google
              </button>
              <button onClick={() => setMode("signup")} disabled={submitting} style={buttonSecondary}>
                Need an account? Sign Up
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleSignup}
                disabled={submitting || (!!siteKey && !turnstileToken && !turnstileError)}
                style={{ ...buttonPrimary, opacity: submitting || (!!siteKey && !turnstileToken && !turnstileError) ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}
              >
                {submitting && <span className={isDark ? "btn-spinner btn-spinner-dark" : "btn-spinner"} />}
                Complete Signup
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0" }}>
                <div style={{ flex: 1, height: 1, background: t.border }} />
                <span style={{ fontSize: 13, color: t.textMuted }}>or</span>
                <div style={{ flex: 1, height: 1, background: t.border }} />
              </div>
              <button
                type="button"
                onClick={() => signInWithGoogleOAuth()}
                disabled={submitting}
                style={{ ...buttonSecondary, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}
              >
                <GoogleIcon />
                Sign up with Google
              </button>
              <button onClick={() => setMode("login")} disabled={submitting} style={buttonSecondary}>
                Back to Login
              </button>
            </>
          )}
        </form>
      )}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.7-8 19.7-20 0-1.3-.1-2.7-.1-4z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.1 18.9 12 24 12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5l-6.2-5.2C29.4 35.6 26.8 36 24 36c-5.2 0-9.6-2.9-11.3-7l-6.5 5C9.8 40 16.4 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.6l6.2 5.2C41 35.5 44 30.2 44 24c0-1.3-.1-2.7-.4-4z"/>
    </svg>
  );
}

