"use client";

import { useTheme } from "@/app/lib/ThemeContext";
import { BombSuitManAvatar } from "../bomb-suit-man/BombSuitManAvatar";
import { BSM_ACCENT, BSM_BUTTON_GRADIENT } from "../bomb-suit-man/bombSuitManTheme";
import { formatRainbowCowboyDuration } from "./rainbowCowboyFormat";
import { formatDifficultyLabel } from "./rainbowCowboyDifficulty";
import { getVictoryTitle } from "./rainbowCowboyScoring";
import type { RainbowCowboyRunResult } from "./rainbowCowboyTypes";

interface Props {
  result: RainbowCowboyRunResult;
  personalBestMessage: string;
  isAuthenticated: boolean;
  isVictory: boolean;
  nextLevel?: { title: string } | null;
  onNextLevel?: () => void;
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
  nextLevel,
  onNextLevel,
  onRestart,
  onBack,
}: Props) {
  const { t } = useTheme();
  const timeDisplay = formatRainbowCowboyDuration(result.durationSeconds);
  const isLevel2 = result.levelId === "level-2";
  const isLevel3 = result.levelId === "level-3";
  const isAdvancedLevel = isLevel2 || isLevel3;
  const victoryTitle = getVictoryTitle(result);

  return (
    <div
      style={{
        border: `2px solid ${isVictory ? BSM_ACCENT : "#666"}`,
        borderRadius: 16,
        background: t.surface,
        padding: "28px 22px",
        maxWidth: 480,
        margin: "0 auto",
        textAlign: "center",
      }}
    >
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
        {isVictory ? (
          isLevel2 ? (
            <span style={{ fontSize: 40 }}>🏜️</span>
          ) : (
            <BombSuitManAvatar size={48} />
          )
        ) : (
          <span style={{ fontSize: 40 }}>💥</span>
        )}
      </div>
      <h2 style={{ margin: "0 0 4px", color: isVictory ? BSM_ACCENT : "#aaa" }}>{victoryTitle}</h2>
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
        <Stat label="Difficulty" value={formatDifficultyLabel(result.difficulty)} t={t} />
        {isVictory && (
          <>
            <Stat label="Hearts Left" value={String(result.heartsRemaining)} t={t} />
            <Stat label="Drones Eaten" value={String(result.dronesEaten)} t={t} />
            {isAdvancedLevel && (
              <>
                <Stat label="Red Barons Down" value={String(result.redBaronsDestroyed)} t={t} />
                <Stat label="Nests Destroyed" value={String(result.nestsDestroyed)} t={t} />
                <Stat label="Bombs Dodged" value={String(result.bombsDodged)} t={t} />
              </>
            )}
            <Stat label="Balloons Avoided" value={String(result.balloonsSurvived)} t={t} />
            <Stat label="Rainbow Blasts" value={String(result.rainbowBlastsUsed)} t={t} />
            <Stat label="Damage Taken" value={String(result.damageTaken)} t={t} />
          </>
        )}
        <Stat
          label="Time"
          value={timeDisplay}
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
        {isVictory && nextLevel && onNextLevel && (
          <button
            type="button"
            onClick={onNextLevel}
            style={{
              padding: "12px 22px",
              borderRadius: 10,
              border: "none",
              background: BSM_BUTTON_GRADIENT,
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Next Level: {nextLevel.title}
          </button>
        )}
        <button
          type="button"
          onClick={onRestart}
          style={{
            padding: "12px 22px",
            borderRadius: 10,
            border: "none",
            background: BSM_ACCENT,
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
          Back to Levels
        </button>
      </div>
    </div>
  );
}
