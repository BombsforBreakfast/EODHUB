"use client";

import { useTheme } from "@/app/lib/ThemeContext";
import { formatRainbowCowboyDuration } from "./rainbow-cowboy/rainbowCowboyFormat";
import type { RainbowCowboyPersonalBest } from "./rainbow-cowboy/rainbowCowboyTypes";

export type ArcadeHighScoreRow = {
  gameLabel: string;
  levelLabel: string;
  scoreLabel: string;
  accent: string;
};

export function buildArcadeHighScoreRows(input: {
  rainbowCowboy: Record<string, RainbowCowboyPersonalBest | null>;
  rainbowCowboyLevelTitles: Record<string, string>;
}): ArcadeHighScoreRow[] {
  const rows: ArcadeHighScoreRow[] = [];

  for (const [levelId, best] of Object.entries(input.rainbowCowboy)) {
    if (!best) continue;
    const time =
      best.durationSeconds != null ? ` · ${formatRainbowCowboyDuration(best.durationSeconds)}` : "";
    rows.push({
      gameLabel: "Bomb Suit Man",
      levelLabel: input.rainbowCowboyLevelTitles[levelId] ?? levelId,
      scoreLabel: `${best.score}${time}`,
      accent: "#c9a227",
    });
  }

  return rows.sort((a, b) => a.levelLabel.localeCompare(b.levelLabel));
}

export function ArcadeHighScoresSummary({ rows }: { rows: ArcadeHighScoreRow[] }) {
  const { t } = useTheme();

  if (rows.length === 0) {
    return (
      <div
        style={{
          marginBottom: 16,
          padding: "12px 14px",
          borderRadius: 12,
          border: `1px dashed ${t.border}`,
          color: t.textMuted,
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        No personal bests yet. Each play costs 1 challenge coin; set a new global high score on a level to earn one back.
      </div>
    );
  }

  return (
    <div
      style={{
        marginBottom: 16,
        padding: "12px 14px",
        borderRadius: 12,
        border: `1px solid ${t.border}`,
        background: t.surface,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 800, color: t.textFaint, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 10 }}>
        Your High Scores
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {rows.map((row) => (
          <div
            key={`${row.gameLabel}-${row.levelLabel}`}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "baseline",
              fontSize: 13,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <span style={{ fontWeight: 800, color: row.accent }}>{row.gameLabel}</span>
              <span style={{ color: t.textMuted }}> · {row.levelLabel}</span>
            </div>
            <div style={{ fontWeight: 800, color: t.text, flexShrink: 0 }}>{row.scoreLabel}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
