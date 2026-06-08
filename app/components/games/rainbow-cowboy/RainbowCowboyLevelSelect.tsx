"use client";

import { useTheme } from "@/app/lib/ThemeContext";
import { formatRainbowCowboyDuration } from "./rainbowCowboyFormat";
import {
  getLevelLockMessage,
  isLevelUnlocked,
  type RainbowCowboyProgressMap,
} from "./rainbowCowboyProgression";
import type { RainbowCowboyLevel, RainbowCowboyPersonalBest } from "./rainbowCowboyTypes";

interface Props {
  levels: RainbowCowboyLevel[];
  personalBests: Record<string, RainbowCowboyPersonalBest | null>;
  progress: RainbowCowboyProgressMap;
  onSelectLevel: (levelId: string) => void;
}

export function RainbowCowboyLevelSelect({
  levels,
  personalBests,
  progress,
  onSelectLevel,
}: Props) {
  const { t } = useTheme();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {levels.map((level) => {
        const comingSoon = level.locked || level.status === "coming_soon";
        const progressionLocked = !comingSoon && !isLevelUnlocked(level.id, progress, levels);
        const locked = comingSoon || progressionLocked;
        const best = personalBests[level.id];
        const lockMessage = progressionLocked ? getLevelLockMessage(level.id, levels) : null;

        return (
          <button
            key={level.id}
            type="button"
            disabled={locked}
            onClick={() => !locked && onSelectLevel(level.id)}
            style={{
              width: "100%",
              textAlign: "left",
              padding: 16,
              borderRadius: 12,
              border: `2px solid ${locked ? t.borderLight : "#ff60c0"}`,
              background: locked ? t.bg : "rgba(255,96,192,0.08)",
              color: locked ? t.textFaint : t.text,
              cursor: locked ? "not-allowed" : "pointer",
              opacity: locked ? 0.65 : 1,
            }}
          >
            <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 4 }}>
              {comingSoon ? "Coming Soon" : progressionLocked ? "Locked" : level.difficulty}
            </div>
            <div style={{ fontWeight: 700, fontSize: 17 }}>{level.title}</div>
            {!comingSoon && !progressionLocked && (
              <div style={{ fontSize: 13, color: t.textMuted, marginTop: 4 }}>{level.subtitle}</div>
            )}
            {lockMessage && (
              <div style={{ fontSize: 12, color: t.textMuted, marginTop: 6 }}>{lockMessage}</div>
            )}
            {!locked && best != null && (
              <div style={{ fontSize: 12, color: "#ff60c0", marginTop: 8, lineHeight: 1.5 }}>
                <div>Score PB: {best.score}</div>
                {best.durationSeconds != null && (
                  <div>Time PB: {formatRainbowCowboyDuration(best.durationSeconds)}</div>
                )}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
