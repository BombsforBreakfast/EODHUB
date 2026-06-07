"use client";

import { useTheme } from "@/app/lib/ThemeContext";
import type { RainbowCowboyLevel } from "./rainbowCowboyTypes";

interface Props {
  levels: RainbowCowboyLevel[];
  personalBests: Record<string, number | null>;
  onSelectLevel: (levelId: string) => void;
}

export function RainbowCowboyLevelSelect({ levels, personalBests, onSelectLevel }: Props) {
  const { t } = useTheme();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {levels.map((level) => {
        const locked = level.locked || level.status === "coming_soon";
        const best = personalBests[level.id];

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
              {locked ? "Coming Soon" : level.difficulty}
            </div>
            <div style={{ fontWeight: 700, fontSize: 17 }}>{level.title}</div>
            {!locked && (
              <div style={{ fontSize: 13, color: t.textMuted, marginTop: 4 }}>{level.subtitle}</div>
            )}
            {!locked && best != null && (
              <div style={{ fontSize: 12, color: "#ff60c0", marginTop: 8 }}>Personal Best: {best}</div>
            )}
          </button>
        );
      })}
    </div>
  );
}
