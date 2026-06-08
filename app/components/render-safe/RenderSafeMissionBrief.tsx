"use client";

import { useTheme } from "@/app/lib/ThemeContext";
import type { RenderSafeLevel } from "./renderSafeTypes";

interface Props {
  level: RenderSafeLevel;
  onStart: () => void;
  onBack: () => void;
}

export function RenderSafeMissionBrief({ level, onStart, onBack }: Props) {
  const { t } = useTheme();

  return (
    <div
      style={{
        border: `1px solid ${t.border}`,
        borderRadius: 16,
        background: t.surface,
        padding: "24px 20px",
        maxWidth: 560,
        margin: "0 auto",
      }}
    >
      <div style={{ fontSize: 12, color: "#f97316", fontWeight: 700, letterSpacing: 1 }}>
        MISSION BRIEF
      </div>
      <h2 style={{ margin: "8px 0 4px", fontSize: 22 }}>{level.title}</h2>
      <p style={{ margin: "0 0 16px", color: t.textMuted, fontSize: 14 }}>{level.subtitle}</p>
      <div
        style={{
          whiteSpace: "pre-line",
          fontSize: 14,
          lineHeight: 1.6,
          color: t.text,
          marginBottom: 20,
          padding: 16,
          borderRadius: 10,
          background: t.bg,
          border: `1px solid ${t.borderLight}`,
        }}
      >
        {level.missionBrief}
      </div>
      <p style={{ fontSize: 13, color: t.textMuted, marginBottom: 20 }}>
        <strong>Objective:</strong> {level.objective}
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={onStart}
          style={{
            flex: 1,
            minWidth: 140,
            padding: "12px 20px",
            borderRadius: 10,
            border: "none",
            background: "#f97316",
            color: "#fff",
            fontWeight: 700,
            fontSize: 15,
            cursor: "pointer",
          }}
        >
          Begin Mission
        </button>
        <button
          type="button"
          onClick={onBack}
          style={{
            padding: "12px 20px",
            borderRadius: 10,
            border: `1px solid ${t.border}`,
            background: t.surface,
            color: t.text,
            fontSize: 15,
            cursor: "pointer",
          }}
        >
          Back
        </button>
      </div>
    </div>
  );
}
