"use client";

import { useTheme } from "@/app/lib/ThemeContext";
import type { RenderSafeLevel } from "./renderSafeTypes";

interface Props {
  levels: RenderSafeLevel[];
  selectedLevelId: string | null;
  personalBests: Record<string, number | null>;
  onSelectLevel: (levelId: string) => void;
}

export function RenderSafeLevelSelect({
  levels,
  selectedLevelId,
  personalBests,
  onSelectLevel,
}: Props) {
  const { t } = useTheme();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {levels.map((level) => {
        const selected = selectedLevelId === level.id;
        const best = personalBests[level.id];
        const locked = level.locked === true;

        return (
          <button
            key={level.id}
            type="button"
            disabled={locked}
            onClick={() => !locked && onSelectLevel(level.id)}
            style={{
              width: "100%",
              textAlign: "left",
              padding: 18,
              borderRadius: 12,
              border: `2px solid ${selected ? "#f97316" : t.border}`,
              background: selected ? "rgba(249,115,22,0.08)" : locked ? t.bg : t.surface,
              color: locked ? t.textFaint : t.text,
              cursor: locked ? "not-allowed" : "pointer",
              opacity: locked ? 0.65 : 1,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 4 }}>{level.difficulty}</div>
              {locked && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: t.textMuted,
                    padding: "2px 8px",
                    borderRadius: 6,
                    border: `1px solid ${t.borderLight}`,
                  }}
                >
                  {level.status ?? "Locked"}
                </span>
              )}
            </div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>
              Level {level.id.replace("level-", "")}: {level.title}
            </div>
            <div style={{ fontSize: 14, color: t.textMuted, marginTop: 4 }}>{level.subtitle}</div>
            {!locked && (
              <div style={{ fontSize: 12, color: t.textFaint, marginTop: 8 }}>
                {level.estimatedMinutes}
              </div>
            )}
            {!locked && best != null && (
              <div style={{ fontSize: 12, color: "#f97316", marginTop: 10 }}>
                Personal Best: {best}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
