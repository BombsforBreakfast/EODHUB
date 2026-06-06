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
  const level = levels[0];

  if (!level) return null;

  const selected = selectedLevelId === level.id;
  const best = personalBests[level.id];

  return (
    <div>
      <button
        type="button"
        onClick={() => onSelectLevel(level.id)}
        style={{
          width: "100%",
          textAlign: "left",
          padding: 18,
          borderRadius: 12,
          border: `2px solid ${selected ? "#f97316" : t.border}`,
          background: selected ? "rgba(249,115,22,0.08)" : t.surface,
          color: t.text,
          cursor: "pointer",
        }}
      >
        <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 4 }}>{level.difficulty}</div>
        <div style={{ fontWeight: 700, fontSize: 18 }}>{level.title}</div>
        <div style={{ fontSize: 14, color: t.textMuted, marginTop: 4 }}>{level.subtitle}</div>
        <div style={{ fontSize: 12, color: t.textFaint, marginTop: 8 }}>
          {level.estimatedMinutes}
        </div>
        {best != null && (
          <div style={{ fontSize: 12, color: "#f97316", marginTop: 10 }}>
            Personal Best: {best}
          </div>
        )}
      </button>

      <p
        style={{
          marginTop: 16,
          padding: "12px 14px",
          borderRadius: 10,
          border: `1px solid ${t.borderLight}`,
          background: t.bg,
          fontSize: 13,
          color: t.textMuted,
          lineHeight: 1.5,
          textAlign: "center",
        }}
      >
        More levels are on the way — keep an eye out for new missions.
      </p>
    </div>
  );
}
