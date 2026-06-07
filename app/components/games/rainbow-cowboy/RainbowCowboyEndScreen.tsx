"use client";

import { useTheme } from "@/app/lib/ThemeContext";
import type { RainbowCowboyRunResult } from "./rainbowCowboyTypes";

interface Props {
  result: RainbowCowboyRunResult;
  personalBestMessage: string;
  isAuthenticated: boolean;
  isVictory: boolean;
  onRestart: () => void;
  onBack: () => void;
}

function Stat({ label, value, t }: { label: string; value: string; t: { textMuted: string; text: string } }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: t.textMuted }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 15 }}>{value}</div>
    </div>
  );
}

export function RainbowCowboyEndScreen({
  result,
  personalBestMessage,
  isAuthenticated,
  isVictory,
  onRestart,
  onBack,
}: Props) {
  const { t } = useTheme();
  const minutes = Math.floor(result.durationSeconds / 60);
  const seconds = result.durationSeconds % 60;

  return (
    <div
      style={{
        border: `2px solid ${isVictory ? "#ff60c0" : "#666"}`,
        borderRadius: 16,
        background: t.surface,
        padding: "28px 22px",
        maxWidth: 480,
        margin: "0 auto",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 40, marginBottom: 8 }}>{isVictory ? "🦄" : "💥"}</div>
      <h2 style={{ margin: "0 0 4px", color: isVictory ? "#ff60c0" : "#aaa" }}>
        {isVictory ? "Level Complete" : "Game Over"}
      </h2>
      {!isVictory && result.deathCause && (
        <p style={{ color: t.textMuted, fontSize: 13, marginBottom: 16 }}>{result.deathCause}</p>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          textAlign: "left",
          marginBottom: 20,
        }}
      >
        <Stat label="Score" value={String(result.score)} t={t} />
        <Stat label="Rank" value={result.rank} t={t} />
        {isVictory && (
          <>
            <Stat label="Hearts Left" value={String(result.heartsRemaining)} t={t} />
            <Stat label="Drones Eaten" value={String(result.dronesEaten)} t={t} />
            <Stat label="Balloons Avoided" value={String(result.balloonsSurvived)} t={t} />
            <Stat label="Rainbow Blasts" value={String(result.rainbowBlastsUsed)} t={t} />
            <Stat label="Damage Taken" value={String(result.damageTaken)} t={t} />
          </>
        )}
        <Stat
          label="Time"
          value={`${minutes}:${seconds.toString().padStart(2, "0")}`}
          t={t}
        />
      </div>

      {isVictory && (
        <div
          style={{
            padding: 14,
            borderRadius: 10,
            background: "rgba(255,96,192,0.1)",
            border: "1px solid rgba(255,96,192,0.35)",
            marginBottom: 16,
            fontSize: 14,
            color: t.text,
          }}
        >
          {personalBestMessage}
          {!isAuthenticated && (
            <div style={{ marginTop: 8, fontSize: 13, color: t.textMuted }}>
              Sign in to save your personal best.
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={onRestart}
          style={{
            padding: "12px 22px",
            borderRadius: 10,
            border: "none",
            background: "#ff60c0",
            color: "#fff",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Play Again
        </button>
        <button
          type="button"
          onClick={onBack}
          style={{
            padding: "12px 22px",
            borderRadius: 10,
            border: `1px solid ${t.border}`,
            background: "transparent",
            color: t.text,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Back to Arcade
        </button>
      </div>
    </div>
  );
}
