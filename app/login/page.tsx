"use client";

import { Eye, EyeOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/lib/supabaseClient";
import EodCrabLogo from "../components/EodCrabLogo";
import { useTheme } from "../lib/ThemeContext";
import { loadActiveProfile } from "../lib/auth/activeProfile";
import { clearAppAuthState, markAppSessionActive } from "../lib/auth/sessionState";
import {
  hasFullPlatformAccess,
  needsEmailVerification,
} from "../lib/verificationAccess";
import {
  captureReferralFromUrl,
  readStoredReferral,
} from "../lib/referralCapture";
import {
  loginFailureMessage,
  isLoginEmailNotFoundError,
  isLoginCredentialMismatchError,
  LOGIN_EMAIL_NOT_FOUND_BODY,
  LOGIN_EMAIL_NOT_FOUND_TITLE,
  mapSupabaseAuthError,
  oauthAccountExistsMessage,
  SIGNUP_USER_MESSAGES,
  SUPPORT_EMAIL,
  userMessageForSignupCode,
  type SignupErrorCode,
} from "../lib/auth/signupErrors";
import {
  mapSupabaseLoginError,
  type FailedAuthReason,
} from "../lib/auth/failedAuthReasons";
import { clearFailedAuthReportsAfterLogin } from "../lib/auth/clearFailedAuthReportsOnLogin";

function devClientAuthLog(tag: string, data: Record<string, unknown>) {
  if (process.env.NODE_ENV === "development") {
    console.debug(`[auth:${tag}]`, data);
  }
}

/**
 * Fire-and-forget client → server failure report. Never throws; never blocks
 * the login/signup flow. Used so admins can see bad-password attempts, unknown
 * emails, OAuth-existing confusion, etc. in the Failed Auth tab.
 */
function reportAuthFailure(payload: {
  email?: string | null;
  failureReason: FailedAuthReason;
  errorCode?: string | null;
  rawErrorMessage?: string | null;
  sourceRoute?: string;
}): void {
  try {
    void fetch("/api/auth/report-failure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        email: payload.email ?? undefined,
        failureReason: payload.failureReason,
        errorCode: payload.errorCode ?? undefined,
        rawErrorMessage: payload.rawErrorMessage ?? undefined,
        sourceRoute: payload.sourceRoute ?? "/login",
      }),
    }).catch(() => {});
  } catch {
    // Reporting must never throw.
  }
}


export default function LoginPage() {
  const { t, isDark } = useTheme();
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [isGoogleAccount, setIsGoogleAccount] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Turnstile temporarily disabled (May 2026) — was blocking legitimate users
  // in in-app browsers (Facebook, Instagram). We rely on velocity limits and
  // disposable-email checks instead.
  const [signupCount, setSignupCount] = useState<number | null>(null);
  const [countFlash, setCountFlash] = useState(false);
  const [signupError, setSignupError] = useState<string | null>(null);
  const [loginMessage, setLoginMessage] = useState<string | null>(null);
  const [signupAwaitingEmail, setSignupAwaitingEmail] = useState(false);
  /**
   * Populated when /api/auth/signup returns oauth_account_exists. The login
   * page shows two action buttons (Google + Email me a setup link) so the
   * user can either sign in with the linked OAuth provider or add a password
   * to their existing account via the standard reset-password flow.
   */
  const [oauthExistsProviders, setOauthExistsProviders] = useState<string[] | null>(null);
  const [oauthSetupSent, setOauthSetupSent] = useState(false);
  const [oauthSetupSubmitting, setOauthSetupSubmitting] = useState(false);
  const [emailNotFoundGuidance, setEmailNotFoundGuidance] = useState(false);
  const [highlightSignupCta, setHighlightSignupCta] = useState(false);
  const [signupCtaReducedMotion, setSignupCtaReducedMotion] = useState(false);
  const signupCtaRef = useRef<HTMLButtonElement>(null);

  function clearEmailNotFoundGuidance() {
    setEmailNotFoundGuidance(false);
    setHighlightSignupCta(false);
  }

  function guideToSignupAfterEmailNotFound() {
    setLoginMessage(null);
    setEmailNotFoundGuidance(true);
    setMode("signup");
  }

  // Persist ?ref= referral code through signup flow (cookie + localStorage)
  useEffect(() => {
    captureReferralFromUrl();
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

  useEffect(() => {
    if (!emailNotFoundGuidance || mode !== "signup") return;

    let cancelled = false;
    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setSignupCtaReducedMotion(reducedMotion);

    const run = async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 80));
      if (cancelled) return;

      const el = signupCtaRef.current;
      if (el) {
        el.scrollIntoView({
          behavior: reducedMotion ? "auto" : "smooth",
          block: "center",
          inline: "nearest",
        });
      }

      await new Promise((resolve) =>
        window.setTimeout(resolve, reducedMotion ? 0 : 480),
      );
      if (cancelled) return;

      setHighlightSignupCta(true);
      await new Promise((resolve) =>
        window.setTimeout(resolve, reducedMotion ? 5000 : 4700),
      );
      if (!cancelled) setHighlightSignupCta(false);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [emailNotFoundGuidance, mode]);

  function signInWithGoogleOAuth() {
    clearAppAuthState();
    const storedRef = readStoredReferral();
    const onboardingNext = storedRef
      ? `/onboarding?ref=${encodeURIComponent(storedRef)}`
      : "/onboarding";
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(onboardingNext)}`;
    const hint = email.trim();
    const options =
      hint.includes("@")
        ? { redirectTo, queryParams: { login_hint: hint } }
        : { redirectTo };
    return supabase.auth.signInWithOAuth({ provider: "google", options });
  }

  async function shouldGuideToSignupAfterLoginFailure(
    rawMessage: string,
    authErrorCode: string | null,
  ): Promise<boolean> {
    if (isLoginEmailNotFoundError(rawMessage, authErrorCode)) {
      return true;
    }

    if (!isLoginCredentialMismatchError(rawMessage, authErrorCode)) {
      return false;
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail.includes("@")) {
      return false;
    }

    try {
      const res = await fetch("/api/auth/login-guidance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail }),
      });
      if (!res.ok) return false;
      const data = (await res.json().catch(() => ({}))) as {
        suggestCreateAccount?: boolean;
      };
      return data.suggestCreateAccount === true;
    } catch {
      return false;
    }
  }

  async function handleLogin() {
    setLoginMessage(null);
    clearEmailNotFoundGuidance();
    try {
      setSubmitting(true);

      clearAppAuthState();
      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        const mapped = mapSupabaseAuthError(error.message);
        devClientAuthLog("login", { step: "signInWithPassword_error", code: mapped, rawMessage: error.message });

        const authErrorCode =
          typeof (error as { code?: unknown }).code === "string"
            ? (error as { code: string }).code
            : null;

        if (await shouldGuideToSignupAfterLoginFailure(error.message, authErrorCode)) {
          guideToSignupAfterEmailNotFound();
          reportAuthFailure({
            email,
            failureReason: "EMAIL_NOT_FOUND",
            errorCode: authErrorCode ?? "email_not_found",
            rawErrorMessage: error.message,
            sourceRoute: "/login",
          });
          return;
        }

        setLoginMessage(
          mapped === "rate_limited"
            ? userMessageForSignupCode("rate_limited")
            : loginFailureMessage(error.message),
        );
        reportAuthFailure({
          email,
          failureReason: mapSupabaseLoginError(error.message),
          errorCode: mapped,
          rawErrorMessage: error.message,
          sourceRoute: "/login",
        });
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        setLoginMessage(SIGNUP_USER_MESSAGES.generic);
        reportAuthFailure({
          email,
          failureReason: "SERVER_ERROR",
          errorCode: "no_session_after_signin",
          sourceRoute: "/login",
        });
        return;
      }

      // Remember me logic — mark whether this session should persist past browser close
      markAppSessionActive(rememberMe);
      clearFailedAuthReportsAfterLogin(session.access_token);

      const { profile } = await loadActiveProfile<{
        user_id: string;
        email: string | null;
        display_name: string | null;
        first_name: string | null;
        last_name: string | null;
        photo_url: string | null;
        verification_status: string | null;
        email_verified: boolean | null;
        admin_verified: boolean | null;
        must_complete_onboarding: boolean | null;
      }>(supabase, session.user, {
        route: "app/login/page.tsx:handleLogin",
        select: "user_id, email, display_name, first_name, last_name, photo_url, verification_status, email_verified, admin_verified, must_complete_onboarding, is_pure_admin",
      });

      devClientAuthLog("login", {
        step: "profile_loaded",
        verification_status: profile?.verification_status ?? null,
        email_verified: profile?.email_verified ?? null,
        admin_verified: profile?.admin_verified ?? null,
      });

      if (profile && hasFullPlatformAccess(profile)) {
        window.location.href = "/";
        return;
      }

      if (profile?.must_complete_onboarding) {
        window.location.href = "/onboarding";
        return;
      }

      if (!profile) {
        window.location.href = "/onboarding";
        return;
      }

      if (needsEmailVerification(profile)) {
        window.location.href = "/verify-email";
        return;
      }

      window.location.href = "/pending";
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignup() {
    setSignupError(null);
    setSignupAwaitingEmail(false);
    setOauthExistsProviders(null);
    setOauthSetupSent(false);

    if (password !== confirmPassword) {
      setSignupError("Passwords do not match.");
      reportAuthFailure({
        email,
        failureReason: "CLIENT_VALIDATION_FAILED",
        errorCode: "password_mismatch",
        sourceRoute: "/login",
      });
      return;
    }

    try {
      setSubmitting(true);

      clearAppAuthState();
      const signupRes = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const signupData = (await signupRes.json().catch(() => ({}))) as {
        ok?: boolean;
        email?: string;
        code?: SignupErrorCode;
        providers?: string[];
      };
      devClientAuthLog("signup", {
        step: "server-signup",
        status: signupRes.status,
        ok: signupData.ok,
        code: signupData.code,
      });

      if (!signupRes.ok || !signupData.ok) {
        if (signupData.code === "oauth_account_exists") {
          // Existing OAuth-only account — show consolidation options.
          const providers = signupData.providers ?? [];
          setOauthExistsProviders(providers);
          setSignupError(oauthAccountExistsMessage(providers));
          return;
        }
        const msg = userMessageForSignupCode(signupData.code);
        if (signupData.code === "account_exists_login") {
          setLoginMessage(msg);
          setSignupError(null);
          setMode("login");
        } else {
          setSignupError(msg);
        }
        return;
      }

      const normalizedEmail = signupData.email ?? email.trim().toLowerCase();
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (signInError || !signInData.user) {
        devClientAuthLog("signup", {
          step: "signIn_after_server_signup",
          code: signInError ? mapSupabaseAuthError(signInError.message) : "generic",
        });
        setSignupError(
          signInError
            ? userMessageForSignupCode(mapSupabaseAuthError(signInError.message))
            : SIGNUP_USER_MESSAGES.generic,
        );
        reportAuthFailure({
          email: normalizedEmail,
          failureReason: signInError ? mapSupabaseLoginError(signInError.message) : "ACCOUNT_CREATION_FAILED",
          errorCode: "signin_after_signup_failed",
          rawErrorMessage: signInError?.message,
          sourceRoute: "/login",
        });
        return;
      }

      devClientAuthLog("signup", {
        step: "server_signup_signIn_ok",
        hasSession: !!signInData.session,
        hasUser: !!signInData.user,
      });

      markAppSessionActive(true);
      clearFailedAuthReportsAfterLogin(signInData.session?.access_token);
      window.location.href = "/onboarding";
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * Send a Supabase password-reset email to an existing OAuth-only account so
   * the user can ADD a password identity to their account. Because Supabase
   * auto-links identities by verified email, the result is a single user_id
   * with both Google and email/password sign-in working — same profile, same
   * posts, no duplicate row.
   *
   * Safe to call for an OAuth-existing email: the email goes to the legitimate
   * owner, and the new password is only set after they click the link.
   */
  async function requestAddPasswordLink() {
    const target = email.trim();
    if (!target) return;
    setOauthSetupSubmitting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(target, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        setSignupError(`Couldn't send the setup link: ${error.message}`);
        reportAuthFailure({
          email: target,
          failureReason: "SERVER_ERROR",
          errorCode: "oauth_consolidation_reset_failed",
          rawErrorMessage: error.message,
          sourceRoute: "/login",
        });
        return;
      }
      setOauthSetupSent(true);
    } catch (err) {
      setSignupError("Couldn't send the setup link. Please try again.");
      reportAuthFailure({
        email: target,
        failureReason: "NETWORK_ERROR",
        errorCode: "oauth_consolidation_network_error",
        rawErrorMessage: err instanceof Error ? err.message : String(err),
        sourceRoute: "/login",
      });
    } finally {
      setOauthSetupSubmitting(false);
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
    padding: "12px 14px",
    borderRadius: 14,
    border: `1px solid ${t.inputBorder}`,
    fontSize: 18,
    width: "100%",
    boxSizing: "border-box",
    background: t.input,
    color: t.text,
  };

  const buttonPrimary: React.CSSProperties = {
    padding: "14px 12px",
    borderRadius: 14,
    border: "none",
    background: t.text,
    color: t.surface,
    fontWeight: 700,
    cursor: "pointer",
  };

  const buttonSecondary: React.CSSProperties = {
    padding: "13px 12px",
    borderRadius: 14,
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
        padding: 20,
        maxWidth: 500,
        margin: "0 auto",
        color: t.text,
        background: t.bg,
      }}
    >
      <div style={{ textAlign: "center", marginBottom: 18 }}>
        <div style={{ fontSize: 50, fontWeight: 900, letterSpacing: -1, lineHeight: 1, color: t.text }}>EOD HUB</div>
        <div
          style={{
            display: "inline-block",
            marginTop: 8,
            padding: "4px 12px",
            borderRadius: 999,
            background: "#d4c45c",
            color: "#1a1c14",
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: 1,
            textTransform: "uppercase",
          }}
        >
          Currently in Beta
        </div>
        <div style={{ marginTop: 8, display: "flex", justifyContent: "center" }}>
          <EodCrabLogo variant="login" priority />
        </div>
        <div style={{ fontSize: 12, color: t.textMuted, marginTop: 8, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>Built for EOD Techs, by an EOD Tech.</div>
      </div>

      <section className="sr-only" aria-label="About EOD Hub">
        <p>
          EOD Hub is a professional network and community platform built specifically for the Explosive Ordnance Disposal (EOD) community.
          It connects active duty technicians, veterans, and industry professionals through job opportunities, business listings, events, and real conversations.
          The goal of EOD Hub is to bring the EOD community together in one place-making it easier to stay connected, find opportunities, and share knowledge.
        </p>
      </section>

      <div
        style={{
          marginBottom: 10,
          padding: "6px 6px 4px",
          color: t.textMuted,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 18, lineHeight: 1.4, fontWeight: 700, color: t.text }}>
          EOD Hub connects the community in one place—built by and for those who&apos;ve done the work
        </div>
        <div style={{ marginTop: 10, fontSize: 16, lineHeight: 1.55, color: t.text }}>
          <div>- Jobs, businesses, and events</div>
          <div>- Groups and real conversations</div>
          <div>- Resources and deep-dive knowledge</div>
        </div>
        <div style={{ marginTop: 10, fontSize: 16, lineHeight: 1.45, color: t.text }}>
          Join the network. Find opportunities. Stay connected.
        </div>
      </div>

      <div
        aria-live="polite"
        aria-atomic="true"
        style={{
          marginBottom: 10,
          fontSize: 12,
          lineHeight: 1.35,
          color: t.textMuted,
          fontWeight: 700,
          padding: "8px 10px",
          borderRadius: 10,
          border: `1px solid ${t.border}`,
          background: countFlash ? (isDark ? "rgba(124, 58, 237, 0.18)" : "rgba(124, 58, 237, 0.08)") : t.surface,
          transition: "background 0.35s ease",
          fontVariantNumeric: "tabular-nums",
          textAlign: "center",
        }}
      >
        {signupCount === null ? (
          <span style={{ opacity: 0.7 }}>Loading community size...</span>
        ) : (
          <>
            <span style={{ color: t.text, fontWeight: 800, fontSize: 14 }}>{signupCount.toLocaleString()}</span>{" "}
            EOD HUB users have already signed up!
          </>
        )}
      </div>

      {mode !== "login" && (
        <h1 style={{ fontSize: 40, fontWeight: 800, margin: "0 0 6px" }}>
          {mode === "signup" ? "Sign Up" : "Reset Password"}
        </h1>
      )}

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
              <div style={{ fontWeight: 700, marginBottom: 6, color: "#14532d" }}>Check your email</div>
              <div style={{ fontSize: 14, color: "#166534" }}>
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
      {mode === "signup" && signupAwaitingEmail && (
        <div
          style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: 20, textAlign: "center", marginTop: 16 }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6, color: "#14532d" }}>Check your email</div>
          <div style={{ fontSize: 14, color: "#166534" }}>
            We sent a confirmation link to <strong>{email.trim().toLowerCase()}</strong>. Click the link to continue setting up your account.
          </div>
          <button
            type="button"
            onClick={() => { setSignupAwaitingEmail(false); setMode("login"); }}
            style={{ ...buttonSecondary, marginTop: 14, width: "100%" }}
          >
            Back to Login
          </button>
        </div>
      )}

      {mode !== "forgot" && !(mode === "signup" && signupAwaitingEmail) && (
        <>
          {emailNotFoundGuidance && mode === "signup" && (
            <div
              role="alert"
              style={{
                marginTop: 8,
                marginBottom: 4,
                padding: "14px 16px",
                borderRadius: 12,
                border: `1px solid ${isDark ? "rgba(147, 197, 253, 0.35)" : "rgba(59, 130, 246, 0.28)"}`,
                background: isDark ? "rgba(59, 130, 246, 0.12)" : "rgba(239, 246, 255, 0.95)",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 800, color: t.text, lineHeight: 1.35 }}>
                {LOGIN_EMAIL_NOT_FOUND_TITLE}
              </div>
              <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.55, color: t.text }}>
                {LOGIN_EMAIL_NOT_FOUND_BODY}
              </div>
            </div>
          )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (mode === "login") {
              handleLogin();
            } else {
              handleSignup();
            }
          }}
          style={{ display: "grid", gap: mode === "login" ? 9 : 12, marginTop: mode === "login" ? 0 : 8 }}
        >
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setSignupError(null);
              setOauthExistsProviders(null);
              setOauthSetupSent(false);
              clearEmailNotFoundGuidance();
            }}
            style={inputStyle}
          />

          <PasswordInput
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            showPassword={showPassword}
            onToggleShow={() => setShowPassword((prev) => !prev)}
            inputStyle={inputStyle}
            textMuted={t.textMuted}
          />

          {mode === "signup" && (
            <PasswordInput
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              showPassword={showPassword}
              onToggleShow={() => setShowPassword((prev) => !prev)}
              inputStyle={inputStyle}
              textMuted={t.textMuted}
              borderColor={confirmPassword && confirmPassword !== password ? "#ef4444" : undefined}
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

          {mode === "login" ? (
            <>
              {loginMessage && (
                <div style={{ display: "grid", gap: 6 }} role="alert">
                  <div style={{ fontSize: 14, color: "#b91c1c", lineHeight: 1.4 }}>
                    {loginMessage}
                  </div>
                  <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.4 }}>
                    Still stuck? Email{" "}
                    <a
                      href={`mailto:${SUPPORT_EMAIL}?subject=EOD%20Hub%20login%20help`}
                      style={{ color: t.textMuted, textDecoration: "underline" }}
                    >
                      {SUPPORT_EMAIL}
                    </a>{" "}
                    and we&apos;ll get you in.
                  </div>
                </div>
              )}
              <button
                type="submit"
                disabled={submitting}
                style={{ ...buttonPrimary, opacity: submitting ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}
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
              <button type="button" onClick={() => { clearEmailNotFoundGuidance(); setMode("signup"); }} disabled={submitting} style={buttonSecondary}>
                Need an account? Sign Up
              </button>
            </>
          ) : (
            <>
              {signupError && (
                <div style={{ display: "grid", gap: 6 }} role="alert">
                  <div style={{ fontSize: 14, color: "#b91c1c", lineHeight: 1.4 }}>
                    {signupError}
                  </div>
                  {oauthExistsProviders && oauthExistsProviders.length > 0 ? (
                    oauthSetupSent ? (
                      <div
                        style={{
                          marginTop: 4,
                          padding: 12,
                          borderRadius: 10,
                          background: "#f0fdf4",
                          border: "1px solid #bbf7d0",
                          color: "#166534",
                          fontSize: 13,
                          lineHeight: 1.5,
                        }}
                      >
                        We sent a password setup link to <strong>{email.trim().toLowerCase()}</strong>. Click it to add a
                        password to your account — once set, both sign-in methods will work.
                      </div>
                    ) : (
                      <div style={{ display: "grid", gap: 8, marginTop: 6 }}>
                        <button
                          type="button"
                          onClick={() => signInWithGoogleOAuth()}
                          disabled={submitting || oauthSetupSubmitting}
                          style={{ ...buttonSecondary, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}
                        >
                          <GoogleIcon />
                          Sign in with Google
                        </button>
                        <button
                          type="button"
                          onClick={() => requestAddPasswordLink()}
                          disabled={submitting || oauthSetupSubmitting || !email.trim()}
                          style={{
                            ...buttonSecondary,
                            opacity: oauthSetupSubmitting ? 0.7 : 1,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 7,
                          }}
                        >
                          {oauthSetupSubmitting && (
                            <span className={isDark ? "btn-spinner btn-spinner-dark" : "btn-spinner"} />
                          )}
                          Email me a setup link
                        </button>
                      </div>
                    )
                  ) : null}
                  <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.4 }}>
                    Need help? Email{" "}
                    <a
                      href={`mailto:${SUPPORT_EMAIL}?subject=EOD%20Hub%20signup%20help`}
                      style={{ color: t.textMuted, textDecoration: "underline" }}
                    >
                      {SUPPORT_EMAIL}
                    </a>
                    .
                  </div>
                </div>
              )}
              {highlightSignupCta && (
                <div
                  style={{
                    textAlign: "center",
                    fontSize: 13,
                    fontWeight: 700,
                    color: t.textMuted,
                    letterSpacing: 0.2,
                  }}
                  aria-hidden
                >
                  ↓ Create your account here
                </div>
              )}
              <button
                ref={signupCtaRef}
                type="submit"
                disabled={submitting}
                className={[
                  "login-signup-cta-target",
                  highlightSignupCta
                    ? signupCtaReducedMotion
                      ? "login-signup-cta-highlight-static"
                      : "login-signup-cta-highlight"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{ ...buttonPrimary, opacity: submitting ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}
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
              <button type="button" onClick={() => { clearEmailNotFoundGuidance(); setMode("login"); }} disabled={submitting} style={buttonSecondary}>
                Back to Login
              </button>
            </>
          )}

        </form>
        </>
      )}

      <div
        style={{
          marginTop: 18,
          padding: "10px 12px",
          textAlign: "center",
          fontSize: 12,
          lineHeight: 1.5,
          color: t.textMuted,
        }}
      >
        Questions or experiencing login issues — email{" "}
        <a
          href="mailto:murphy@eod-hub.com"
          style={{ color: t.text, fontWeight: 700, textDecoration: "underline" }}
        >
          murphy@eod-hub.com
        </a>
      </div>
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

function PasswordInput({
  placeholder,
  value,
  onChange,
  showPassword,
  onToggleShow,
  inputStyle,
  textMuted,
  borderColor,
  autoComplete,
}: {
  placeholder: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  showPassword: boolean;
  onToggleShow: () => void;
  inputStyle: React.CSSProperties;
  textMuted: string;
  borderColor?: string;
  autoComplete?: string;
}) {
  return (
    <div style={{ position: "relative" }}>
      <input
        placeholder={placeholder}
        type={showPassword ? "text" : "password"}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        style={{
          ...inputStyle,
          paddingRight: 48,
          borderColor,
        }}
      />
      <button
        type="button"
        aria-label={showPassword ? "Hide password" : "Show password"}
        onClick={onToggleShow}
        style={{
          position: "absolute",
          right: 4,
          top: "50%",
          transform: "translateY(-50%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 44,
          minHeight: 44,
          background: "none",
          border: "none",
          cursor: "pointer",
          color: textMuted,
          padding: 0,
        }}
      >
        {showPassword ? (
          <EyeOff size={18} strokeWidth={2} aria-hidden />
        ) : (
          <Eye size={18} strokeWidth={2} aria-hidden />
        )}
      </button>
    </div>
  );
}

