"use client";

import type { RenderSafeLevel } from "./renderSafeTypes";

interface Props {
  level: RenderSafeLevel;
  score: number;
  mistakes: number;
  progress: number;
  missionStatus: string;
  overlay?: boolean;
}

const hudBoxStyle: React.CSSProperties = {
  background: "rgba(8,12,8,0.78)",
  border: "1px solid rgba(249,115,22,0.35)",
  borderRadius: 8,
  padding: "6px 10px",
  backdropFilter: "blur(4px)",
};

const labelStyle: React.CSSProperties = {
  fontSize: 9,
  textTransform: "uppercase",
  letterSpacing: 0.8,
  color: "rgba(255,255,255,0.55)",
  fontFamily: "monospace",
};

const valueStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#f0f0f0",
  fontFamily: "monospace",
};

export function RenderSafeHud({
  level,
  score,
  mistakes,
  progress,
  missionStatus,
  overlay = true,
}: Props) {
  if (!overlay) {
    return (
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={hudBoxStyle}>
          <div style={labelStyle}>{level.title}</div>
        </div>
        <div style={hudBoxStyle}>
          <div style={valueStyle}>{score} pts · {mistakes} err</div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 20,
        pointerEvents: "none",
      }}
    >
      <div style={{ position: "absolute", top: 8, left: 8, ...hudBoxStyle, maxWidth: "46%" }}>
        <div style={labelStyle}>Level</div>
        <div style={valueStyle}>{level.title}</div>
        <div style={{ ...labelStyle, marginTop: 6 }}>Objective</div>
        <div style={{ ...valueStyle, fontSize: 10, lineHeight: 1.3 }}>
          Get assault force to target
        </div>
      </div>

      <div style={{ position: "absolute", top: 8, right: 52, ...hudBoxStyle }}>
        <div style={{ display: "flex", gap: 14 }}>
          <div>
            <div style={labelStyle}>Score</div>
            <div style={{ ...valueStyle, color: "#f97316" }}>{score}</div>
          </div>
          <div>
            <div style={labelStyle}>Mistakes</div>
            <div style={valueStyle}>{mistakes}</div>
          </div>
          <div>
            <div style={labelStyle}>Progress</div>
            <div style={valueStyle}>{Math.round(progress)}%</div>
          </div>
        </div>
      </div>

      <div style={{ position: "absolute", bottom: 12, left: 8, ...hudBoxStyle }}>
        <div style={labelStyle}>Status</div>
        <div style={{ ...valueStyle, color: "#fbbf24" }}>{missionStatus}</div>
      </div>
    </div>
  );
}
