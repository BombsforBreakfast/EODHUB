"use client";

import { FormEvent, useEffect, useState } from "react";

type GateState = "loading" | "locked" | "unlocked";

export default function LoginMaintenanceModal() {
  const [state, setState] = useState<GateState>("loading");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/maintenance/status", { cache: "no-store" });
        const data = (await res.json()) as { enabled?: boolean; unlocked?: boolean };
        if (cancelled) return;
        if (!data.enabled || data.unlocked) {
          setState("unlocked");
          return;
        }
        setState("locked");
      } catch {
        if (!cancelled) setState("locked");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/maintenance/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error || "Incorrect password.");
        return;
      }
      setState("unlocked");
    } catch {
      setError("Could not verify password. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (state === "unlocked") return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-maint-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: "rgba(8, 10, 14, 0.92)",
        backdropFilter: "blur(6px)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "#111827",
          color: "#f9fafb",
          padding: "28px 24px 24px",
          boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
          textAlign: "center",
        }}
      >
        {state === "loading" ? (
          <p style={{ margin: 0, fontSize: 15, color: "#9ca3af" }}>Checking status…</p>
        ) : (
          <>
            <div
              id="login-maint-title"
              style={{
                fontSize: 22,
                fontWeight: 800,
                lineHeight: 1.3,
                letterSpacing: -0.2,
                marginBottom: 12,
              }}
            >
              Site is currently down for maintenance
            </div>
            <p style={{ margin: "0 0 22px", fontSize: 15, lineHeight: 1.5, color: "#d1d5db" }}>
              We apologize for any inconvenience.
            </p>
            <form onSubmit={onSubmit} style={{ textAlign: "left" }}>
              <label
                htmlFor="login-maint-password"
                style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#9ca3af", marginBottom: 6 }}
              >
                Staff access
              </label>
              <input
                id="login-maint-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.16)",
                  background: "#0b1220",
                  color: "#f9fafb",
                  padding: "12px 14px",
                  fontSize: 16,
                  marginBottom: 10,
                }}
              />
              {error && (
                <div style={{ color: "#fca5a5", fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={submitting || !password.trim()}
                style={{
                  width: "100%",
                  border: "none",
                  borderRadius: 10,
                  padding: "12px 14px",
                  fontSize: 15,
                  fontWeight: 800,
                  cursor: submitting || !password.trim() ? "not-allowed" : "pointer",
                  opacity: submitting || !password.trim() ? 0.55 : 1,
                  background: "#facc15",
                  color: "#111827",
                }}
              >
                {submitting ? "Checking…" : "Continue"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
