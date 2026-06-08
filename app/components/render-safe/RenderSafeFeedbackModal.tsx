"use client";

import { useTheme } from "@/app/lib/ThemeContext";

interface Props {
  message: string;
  type: "success" | "warning";
  onContinue: () => void;
}

export function RenderSafeFeedbackModal({ message, type, onContinue }: Props) {
  const { t } = useTheme();
  const accent = type === "success" ? "#22c55e" : "#f97316";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 105,
        padding: 16,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          borderRadius: 16,
          border: `2px solid ${accent}`,
          background: t.surface,
          padding: "22px 18px",
        }}
      >
        <p style={{ fontSize: 15, lineHeight: 1.5, color: t.text, margin: "0 0 18px" }}>{message}</p>
        <button
          type="button"
          onClick={onContinue}
          style={{
            width: "100%",
            padding: "12px 16px",
            borderRadius: 10,
            border: "none",
            background: accent,
            color: "#fff",
            fontWeight: 700,
            fontSize: 15,
            cursor: "pointer",
          }}
        >
          Continue
        </button>
      </div>
    </div>
  );
}

interface FailureProps {
  message: string;
  variant: "mission_failed" | "player_killed";
  onRestart: () => void;
}

export function RenderSafeFailureModal({ message, variant, onRestart }: FailureProps) {
  const { t } = useTheme();
  const isKilled = variant === "player_killed";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: isKilled ? "rgba(80,0,0,0.75)" : "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 120,
        padding: 16,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          borderRadius: 16,
          border: `2px solid ${isKilled ? "#ef4444" : t.border}`,
          background: t.surface,
          padding: "24px 20px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 36, marginBottom: 10 }}>{isKilled ? "💀" : "⚠️"}</div>
        <h3 style={{ margin: "0 0 12px", color: isKilled ? "#ef4444" : t.text }}>
          {isKilled ? "KIA" : "Mission Failed"}
        </h3>
        <p style={{ fontSize: 15, lineHeight: 1.5, color: t.textMuted, marginBottom: 20 }}>{message}</p>
        <button
          type="button"
          onClick={onRestart}
          style={{
            width: "100%",
            padding: "12px 16px",
            borderRadius: 10,
            border: "none",
            background: "#f97316",
            color: "#fff",
            fontWeight: 700,
            fontSize: 15,
            cursor: "pointer",
          }}
        >
          Restart Level
        </button>
      </div>
    </div>
  );
}
