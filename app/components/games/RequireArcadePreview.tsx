"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useTheme } from "@/app/lib/ThemeContext";
import { getSupabaseSession } from "@/app/lib/lib/supabaseClient";

type AccessState =
  | { status: "loading" }
  | { status: "blocked" }
  | { status: "unlock"; requiresPassword: boolean }
  | { status: "ready" };

interface Props {
  children: ReactNode;
}

export function RequireArcadePreview({ children }: Props) {
  const { t } = useTheme();
  const [access, setAccess] = useState<AccessState>({ status: "loading" });
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadAccess() {
      const { data: { session } } = await getSupabaseSession();
      if (!session?.access_token) {
        if (mounted) setAccess({ status: "blocked" });
        return;
      }

      const res = await fetch("/api/arcade/access", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!mounted) return;

      if (!res.ok) {
        setAccess({ status: "blocked" });
        return;
      }

      const data = (await res.json()) as {
        canClick?: boolean;
        unlocked?: boolean;
        requiresPassword?: boolean;
      };

      if (!data.canClick) {
        setAccess({ status: "blocked" });
        return;
      }

      if (data.unlocked) {
        setAccess({ status: "ready" });
        return;
      }

      setAccess({ status: "unlock", requiresPassword: !!data.requiresPassword });
    }

    void loadAccess();
    return () => {
      mounted = false;
    };
  }, []);

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const { data: { session } } = await getSupabaseSession();
      if (!session?.access_token) {
        setError("Session expired. Please sign in again.");
        return;
      }

      const res = await fetch("/api/arcade/unlock", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });

      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not unlock arcade preview.");
        return;
      }

      setAccess({ status: "ready" });
    } finally {
      setSubmitting(false);
    }
  }

  if (access.status === "loading") {
    return (
      <div style={{ padding: "48px 16px", textAlign: "center", color: t.textMuted }}>
        Loading arcade…
      </div>
    );
  }

  if (access.status === "blocked") {
    return (
      <div style={{ padding: "32px 16px 48px", maxWidth: 480, margin: "0 auto", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🕹️</div>
        <h1 style={{ margin: "0 0 8px", fontSize: 24, fontWeight: 800, color: t.text }}>EOD Arcade</h1>
        <p style={{ margin: "0 0 20px", color: t.textMuted, lineHeight: 1.55 }}>
          Coming soon — fictional community games for EOD HUB members.
        </p>
        <Link
          href="/"
          style={{
            display: "inline-block",
            padding: "10px 18px",
            borderRadius: 10,
            background: "#111",
            color: "#fff",
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          Back to EOD HUB
        </Link>
      </div>
    );
  }

  if (access.status === "unlock") {
    return (
      <div style={{ padding: "32px 16px 48px", maxWidth: 420, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🕹️</div>
          <h1 style={{ margin: "0 0 8px", fontSize: 24, fontWeight: 800, color: t.text }}>Arcade Preview</h1>
          <p style={{ margin: 0, color: t.textMuted, lineHeight: 1.55, fontSize: 14 }}>
            Enter the preview password to test EOD Arcade before launch.
          </p>
        </div>

        {access.requiresPassword ? (
          <form onSubmit={handleUnlock}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6, color: t.text }}>
              Preview password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "10px 12px",
                borderRadius: 10,
                border: `1px solid ${t.border}`,
                background: t.bg,
                color: t.text,
                marginBottom: 10,
              }}
            />
            {error && (
              <p style={{ margin: "0 0 10px", color: "#b91c1c", fontSize: 13, fontWeight: 600 }}>{error}</p>
            )}
            <button
              type="submit"
              disabled={submitting || !password}
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: 10,
                border: "none",
                background: "#111",
                color: "#fff",
                fontWeight: 700,
                cursor: submitting || !password ? "not-allowed" : "pointer",
                opacity: submitting || !password ? 0.6 : 1,
              }}
            >
              {submitting ? "Checking…" : "Enter Arcade"}
            </button>
          </form>
        ) : (
          <p style={{ textAlign: "center", color: t.textMuted, fontSize: 14 }}>
            Preview password is not configured on the server.
          </p>
        )}

        <div style={{ textAlign: "center", marginTop: 16 }}>
          <Link href="/" style={{ color: t.textMuted, fontSize: 13, fontWeight: 600 }}>
            ← Back to EOD HUB
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
