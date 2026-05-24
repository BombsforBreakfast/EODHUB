"use client";

import { useState } from "react";
import { supabase } from "../../lib/lib/supabaseClient";
import { useTheme } from "../../lib/ThemeContext";

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

type Props = {
  hasEmailPassword: boolean;
  onProvidersChange?: (providers: string[]) => void;
};

export default function ChangePasswordSection({ hasEmailPassword, onProvidersChange }: Props) {
  const { t } = useTheme();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const inputStyle: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 10,
    border: `1px solid ${t.inputBorder}`,
    fontSize: 14,
    width: "100%",
    boxSizing: "border-box",
    background: t.input,
    color: t.text,
  };

  function validateNewPassword(password: string, confirm: string, current?: string): string | null {
    if (password !== confirm) return "Passwords do not match.";
    if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
      return `Password must be between ${PASSWORD_MIN} and ${PASSWORD_MAX} characters.`;
    }
    if (current !== undefined && password === current) {
      return "New password must be different from your current password.";
    }
    return null;
  }

  async function refreshProviders() {
    const { data: { user } } = await supabase.auth.getUser();
    const providers = (user?.identities ?? []).map((i: { provider: string }) => i.provider);
    onProvidersChange?.(providers);
  }

  async function handleAddPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const validationError = validateNewPassword(newPassword, confirmPassword);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) {
        setError("Your account doesn't have an email address to sign in with.");
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) {
        setError(updateError.message);
        return;
      }

      await refreshProviders();
      setSuccessMessage("Password added — you can now sign in with email.");
      setNewPassword("");
      setConfirmPassword("");
      setExpanded(false);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!currentPassword) {
      setError("Enter your current password.");
      return;
    }

    const validationError = validateNewPassword(newPassword, confirmPassword, currentPassword);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) {
        setError("Couldn't verify your account.");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (signInError) {
        setError("Current password is incorrect.");
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) {
        setError(updateError.message);
        return;
      }

      setSuccessMessage("Password updated successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setExpanded(false);
    } finally {
      setSubmitting(false);
    }
  }

  const passwordsMatch = !confirmPassword || newPassword === confirmPassword;
  const canSubmitAdd = !!newPassword && !!confirmPassword && passwordsMatch && !submitting;
  const canSubmitChange =
    !!currentPassword && !!newPassword && !!confirmPassword && passwordsMatch && !submitting;

  const actionLabel = hasEmailPassword ? "Change password" : "Add password";

  function collapseForm() {
    setExpanded(false);
    setError(null);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  const secondaryBtn: React.CSSProperties = {
    padding: "6px 14px",
    borderRadius: 8,
    border: `1px solid ${t.border}`,
    background: t.surface,
    color: t.text,
    fontWeight: 700,
    fontSize: 12,
    cursor: "pointer",
  };

  const primaryBtn: React.CSSProperties = {
    padding: "8px 16px",
    borderRadius: 8,
    border: "none",
    background: t.text,
    color: t.surface,
    fontWeight: 700,
    fontSize: 13,
    display: "flex",
    alignItems: "center",
    gap: 6,
  };

  return (
    <div style={{ padding: "8px 0 4px", borderBottom: `1px solid ${t.border}` }}>
      {successMessage && (
        <div
          style={{
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: 10,
            padding: "10px 14px",
            fontSize: 13,
            color: "#166534",
            fontWeight: 700,
            marginBottom: 12,
          }}
        >
          {successMessage}
        </div>
      )}

      {!expanded ? (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setSuccessMessage(null);
            setExpanded(true);
          }}
          style={secondaryBtn}
        >
          {actionLabel}
        </button>
      ) : (
        <>
          {!hasEmailPassword && (
            <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.5, marginBottom: 10 }}>
              Set a password to sign in with your email address in addition to Google.
            </div>
          )}

          {hasEmailPassword ? (
            <form onSubmit={handleChangePassword} style={{ display: "grid", gap: 10, maxWidth: 420 }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: t.textMuted }}>Current password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              style={inputStyle}
            />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: t.textMuted }}>New password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              style={inputStyle}
            />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: t.textMuted }}>Confirm new password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              style={{
                ...inputStyle,
                borderColor: confirmPassword && !passwordsMatch ? "#ef4444" : undefined,
              }}
            />
          </label>

          {error && (
            <div style={{ color: "#ef4444", fontSize: 13, fontWeight: 600 }}>{error}</div>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="submit"
              disabled={!canSubmitChange}
              style={{
                ...primaryBtn,
                cursor: canSubmitChange ? "pointer" : "not-allowed",
                opacity: canSubmitChange ? 1 : 0.65,
              }}
            >
              {submitting && <span className="btn-spinner" />}
              Update password
            </button>
            <button type="button" onClick={collapseForm} disabled={submitting} style={secondaryBtn}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleAddPassword} style={{ display: "grid", gap: 10, maxWidth: 420 }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: t.textMuted }}>Password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              style={inputStyle}
            />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: t.textMuted }}>Confirm password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              style={{
                ...inputStyle,
                borderColor: confirmPassword && !passwordsMatch ? "#ef4444" : undefined,
              }}
            />
          </label>

          {error && (
            <div style={{ color: "#ef4444", fontSize: 13, fontWeight: 600 }}>{error}</div>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="submit"
              disabled={!canSubmitAdd}
              style={{
                ...primaryBtn,
                cursor: canSubmitAdd ? "pointer" : "not-allowed",
                opacity: canSubmitAdd ? 1 : 0.65,
              }}
            >
              {submitting && <span className="btn-spinner" />}
              Add password
            </button>
            <button type="button" onClick={collapseForm} disabled={submitting} style={secondaryBtn}>
              Cancel
            </button>
          </div>
        </form>
      )}
        </>
      )}
    </div>
  );
}
