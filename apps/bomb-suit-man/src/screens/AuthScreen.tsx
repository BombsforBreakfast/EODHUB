import { useState, type FormEvent } from "react";
import { useTheme } from "@/app/lib/ThemeContext";
import { useAuth } from "@bsm/context/AuthProvider";
import { BombSuitManAvatar } from "@/app/components/games/bomb-suit-man/BombSuitManAvatar";
import { BSM_TITLE_GRADIENT } from "@/app/components/games/bomb-suit-man/bombSuitManTheme";

interface Props {
  title?: string;
  subtitle?: string;
  onDismiss?: () => void;
}

export function AuthScreen({
  title = "Save your progress",
  subtitle = "Create a free account to unlock Level 3 and beyond, save scores, and compete on leaderboards.",
  onDismiss,
}: Props) {
  const { t } = useTheme();
  const { signInWithGoogle, signInWithApple, signInWithEmail, signUpWithEmail, isConfigured } = useAuth();
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleEmailSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const message =
        mode === "signup"
          ? await signUpWithEmail(email.trim(), password)
          : await signInWithEmail(email.trim(), password);
      if (message) setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        padding: "24px 16px 40px",
        boxSizing: "border-box",
        background: t.bg,
        color: t.text,
      }}
    >
      <div style={{ maxWidth: 420, margin: "0 auto", textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
          <BombSuitManAvatar size={64} />
        </div>
        <h1
          style={{
            margin: "0 0 8px",
            fontSize: 28,
            fontWeight: 800,
            background: BSM_TITLE_GRADIENT,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          {title}
        </h1>
        <p style={{ margin: "0 0 24px", color: t.textMuted, lineHeight: 1.55, fontSize: 14 }}>{subtitle}</p>

        {!isConfigured && (
          <p style={{ color: "#b45309", fontSize: 13, fontWeight: 600 }}>
            Add BSM Supabase env vars to enable sign-in.
          </p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
          <button
            type="button"
            disabled={!isConfigured || busy}
            onClick={() => void signInWithApple()}
            style={oauthButtonStyle(t.border, t.text)}
          >
            Continue with Apple
          </button>
          <button
            type="button"
            disabled={!isConfigured || busy}
            onClick={() => void signInWithGoogle()}
            style={oauthButtonStyle(t.border, t.text)}
          >
            Continue with Google
          </button>
        </div>

        <form onSubmit={handleEmailSubmit} style={{ textAlign: "left" }}>
          <label style={labelStyle(t.text)}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            style={inputStyle(t)}
          />
          <label style={{ ...labelStyle(t.text), marginTop: 12 }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            required
            minLength={6}
            style={inputStyle(t)}
          />
          {error && (
            <p style={{ margin: "10px 0 0", color: "#b91c1c", fontSize: 13, fontWeight: 600 }}>{error}</p>
          )}
          <button
            type="submit"
            disabled={!isConfigured || busy}
            style={{
              width: "100%",
              marginTop: 14,
              padding: "12px 16px",
              borderRadius: 10,
              border: "none",
              background: "#111",
              color: "#fff",
              fontWeight: 700,
              cursor: busy ? "wait" : "pointer",
              opacity: busy ? 0.7 : 1,
            }}
          >
            {mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => setMode((m) => (m === "signup" ? "signin" : "signup"))}
          style={{
            marginTop: 14,
            background: "none",
            border: "none",
            color: t.textMuted,
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          {mode === "signup" ? "Already have an account? Sign in" : "Need an account? Sign up"}
        </button>

        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            style={{
              marginTop: 18,
              background: "none",
              border: "none",
              color: t.textMuted,
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Maybe later — replay Levels 1–2
          </button>
        )}
      </div>
    </div>
  );
}

function oauthButtonStyle(border: string, text: string) {
  return {
    width: "100%",
    padding: "12px 16px",
    borderRadius: 10,
    border: `1px solid ${border}`,
    background: "transparent",
    color: text,
    fontWeight: 700,
    cursor: "pointer",
  } as const;
}

function labelStyle(color: string) {
  return {
    display: "block",
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 6,
    color,
  } as const;
}

function inputStyle(t: { bg: string; text: string; border: string }) {
  return {
    width: "100%",
    boxSizing: "border-box" as const,
    padding: "10px 12px",
    borderRadius: 10,
    border: `1px solid ${t.border}`,
    background: t.bg,
    color: t.text,
  };
}
