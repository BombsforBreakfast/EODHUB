"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../lib/lib/supabaseClient";
import { loadActiveProfile } from "../lib/auth/activeProfile";
import { clearAppAuthState } from "../lib/auth/sessionState";
import EodCrabLogo from "../components/EodCrabLogo";
import {
  hasFullPlatformAccess,
  isInAdminReviewQueue,
  needsEmailVerification,
} from "../lib/verificationAccess";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const linkError = searchParams.get("error") === "invalid";

  const [email, setEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const prevDocColorScheme = document.documentElement.style.colorScheme;
    const prevBodyColorScheme = document.body.style.colorScheme;
    document.documentElement.style.colorScheme = "light";
    document.body.style.colorScheme = "light";
    return () => {
      document.documentElement.style.colorScheme = prevDocColorScheme;
      document.body.style.colorScheme = prevBodyColorScheme;
    };
  }, []);

  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = "/login";
        return;
      }

      setEmail(user.email ?? null);

      const { profile } = await loadActiveProfile<{
        user_id: string;
        service: string | null;
        company_name: string | null;
        verification_status: string | null;
        email_verified: boolean | null;
        admin_verified: boolean | null;
      }>(supabase, user, {
        route: "app/verify-email/page.tsx:check",
        select: "user_id, service, company_name, verification_status, email_verified, admin_verified",
      });

      if (!profile?.service && !profile?.company_name) {
        window.location.href = "/onboarding";
        return;
      }

      if (hasFullPlatformAccess(profile)) {
        window.location.href = "/";
        return;
      }

      if (isInAdminReviewQueue(profile)) {
        window.location.href = "/pending";
        return;
      }

      if (!needsEmailVerification(profile)) {
        window.location.href = "/onboarding";
        return;
      }

      setChecking(false);
    }
    void check();
  }, []);

  async function handleResend() {
    setResending(true);
    setResendMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        window.location.href = "/login";
        return;
      }
      const res = await fetch("/api/auth/send-verification-email", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.status === 429) {
        const data = (await res.json()) as { message?: string };
        setResendMessage(data.message ?? "Too many attempts. Please wait a few minutes and try again.");
        return;
      }
      setResendMessage("If your account needs verification, we sent a new email. Check your inbox and spam folder.");
    } finally {
      setResending(false);
    }
  }

  async function handleLogout() {
    clearAppAuthState();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (checking) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f9fafb" }}>
        <p style={{ color: "#6b7280" }}>Loading…</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f9fafb", padding: 24 }}>
      <div style={{ maxWidth: 480, width: "100%", background: "white", borderRadius: 16, padding: "40px 36px", boxShadow: "0 4px 24px rgba(0,0,0,0.08)", textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
          <EodCrabLogo variant="login" priority />
        </div>
        <div style={{ fontSize: 13, color: "#888", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", marginBottom: 28 }}>
          Built for EOD Techs, by an EOD Tech.
        </div>

        <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#e0e7ff", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 28 }}>
          ✉️
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 900, margin: "0 0 12px", color: "#111" }}>
          Verify Your Email
        </h1>
        <p style={{ fontSize: 15, color: "#555", lineHeight: 1.7, margin: "0 0 8px" }}>
          We&apos;ve sent a verification link to your email address. Please verify your email to continue the EOD-HUB approval process.
        </p>
        <p style={{ fontSize: 13, color: "#888", lineHeight: 1.6, margin: "0 0 24px" }}>
          Check your inbox and spam folder. If you don&apos;t see the message, use resend below.
        </p>
        {email && (
          <p style={{ fontSize: 14, color: "#888", margin: "0 0 24px" }}>
            Sent to <strong>{email}</strong>
          </p>
        )}

        {linkError && (
          <p style={{ fontSize: 14, color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "12px 14px", marginBottom: 20, lineHeight: 1.5 }}>
            That verification link is invalid or has expired. Request a new email below.
          </p>
        )}

        {resendMessage && (
          <p style={{ fontSize: 14, color: "#374151", background: "#f3f4f6", borderRadius: 10, padding: "12px 14px", marginBottom: 20, lineHeight: 1.5 }}>
            {resendMessage}
          </p>
        )}

        <button
          type="button"
          onClick={() => void handleResend()}
          disabled={resending}
          style={{
            width: "100%",
            padding: "12px 20px",
            borderRadius: 10,
            border: "none",
            background: "#111827",
            color: "#fff",
            fontWeight: 700,
            fontSize: 15,
            cursor: resending ? "wait" : "pointer",
            marginBottom: 12,
            opacity: resending ? 0.7 : 1,
          }}
        >
          {resending ? "Sending…" : "Resend verification email"}
        </button>

        <button
          type="button"
          onClick={() => void handleLogout()}
          style={{ padding: "11px 28px", borderRadius: 10, border: "1px solid #d1d5db", background: "white", color: "#374151", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
        >
          Log Out
        </button>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f9fafb" }}>
          <p style={{ color: "#6b7280" }}>Loading…</p>
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
