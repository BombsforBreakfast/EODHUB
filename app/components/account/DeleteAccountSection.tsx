"use client";

import { useState } from "react";
import { supabase } from "../../lib/lib/supabaseClient";
import { useTheme } from "../../lib/ThemeContext";
import { clearAppAuthState } from "../../lib/auth/sessionState";

const REASON_MAX = 500;

type Props = {
  isPureAdmin?: boolean | null;
};

export default function DeleteAccountSection({ isPureAdmin }: Props) {
  const { t } = useTheme();
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isPureAdmin) {
    return (
      <div style={{ border: `1px solid ${t.border}`, borderRadius: 16, padding: "18px 24px", background: t.surface }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: t.text }}>Close account</div>
        <p style={{ fontSize: 13, color: t.textMuted, marginTop: 8, marginBottom: 0, lineHeight: 1.5 }}>
          Staff accounts cannot be self-deleted. Contact support if you need help.
        </p>
      </div>
    );
  }

  async function handleDelete() {
    if (!confirmed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError("Your session expired. Please sign in again.");
        return;
      }

      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: reason.trim() || null }),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not close your account. Please try again.");
        return;
      }

      clearAppAuthState();
      await supabase.auth.signOut();
      window.location.href = "/login?deleted=1";
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ border: "1px solid #fecaca", borderRadius: 16, padding: "18px 24px", background: t.surface }}>
      <div style={{ fontWeight: 800, fontSize: 15, color: "#b91c1c" }}>Close account</div>
      <p style={{ fontSize: 13, color: t.textMuted, marginTop: 8, marginBottom: 14, lineHeight: 1.55 }}>
        Permanently closes your login and removes your profile, messages, connections, and saved items.
        Your feed posts, job listings, and business submissions stay on the site as &ldquo;Former member.&rdquo;
      </p>

      <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 6 }}>
        Why are you closing your account?
      </label>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value.slice(0, REASON_MAX))}
        placeholder="Optional — helps us improve"
        rows={3}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "10px 12px",
          borderRadius: 10,
          border: `1px solid ${t.inputBorder}`,
          background: t.input,
          color: t.text,
          fontSize: 14,
          resize: "vertical",
          fontFamily: "inherit",
        }}
      />
      <div style={{ fontSize: 11, color: t.textFaint, marginTop: 4, textAlign: "right" }}>
        {reason.length}/{REASON_MAX}
      </div>

      <label
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          marginTop: 14,
          fontSize: 13,
          color: t.text,
          cursor: "pointer",
          lineHeight: 1.45,
        }}
      >
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          style={{ marginTop: 3, flexShrink: 0 }}
        />
        <span>I understand this permanently closes my account and cannot be undone.</span>
      </label>

      {error && (
        <div style={{ marginTop: 12, fontSize: 13, color: "#b91c1c", fontWeight: 600 }}>{error}</div>
      )}

      <button
        type="button"
        onClick={() => void handleDelete()}
        disabled={!confirmed || submitting}
        style={{
          marginTop: 16,
          background: confirmed && !submitting ? "#b91c1c" : "#fca5a5",
          color: "white",
          border: "none",
          borderRadius: 10,
          padding: "10px 18px",
          fontWeight: 700,
          fontSize: 14,
          cursor: !confirmed || submitting ? "not-allowed" : "pointer",
          opacity: submitting ? 0.7 : 1,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {submitting && <span className="btn-spinner" />}
        {submitting ? "Closing account…" : "Close my account"}
      </button>
    </div>
  );
}
