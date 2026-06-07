"use client";

import type { RainbowCowboyHudSnapshot } from "./rainbowCowboyTypes";

interface Props {
  hud: RainbowCowboyHudSnapshot;
  personalBest: number | null;
  levelTitle: string;
}

export function RainbowCowboyHud({ hud, personalBest, levelTitle }: Props) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 10,
        padding: "8px 12px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div
          style={{
            background: "rgba(0,0,0,0.55)",
            border: "2px solid rgba(255,120,200,0.5)",
            borderRadius: 8,
            padding: "6px 10px",
            fontFamily: "monospace",
            fontSize: 11,
            color: "#fff",
            lineHeight: 1.4,
          }}
        >
          <div style={{ color: "#ff80d0", fontWeight: 700 }}>{levelTitle}</div>
          <div style={{ opacity: 0.85 }}>Eat drones · dodge hazards</div>
        </div>

        <div
          style={{
            background: "rgba(0,0,0,0.55)",
            border: "2px solid rgba(255,200,80,0.45)",
            borderRadius: 8,
            padding: "6px 10px",
            fontFamily: "monospace",
            fontSize: 11,
            color: "#fff",
            textAlign: "right",
            lineHeight: 1.5,
          }}
        >
          <div>Score: {hud.score}</div>
          {personalBest != null && <div style={{ opacity: 0.75 }}>Best: {personalBest}</div>}
          <div style={{ color: "#8fd4ff" }}>🌈 {hud.rainbowCharges}</div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div style={{ display: "flex", gap: 4 }}>
          {Array.from({ length: hud.maxHearts }).map((_, i) => (
            <span key={i} style={{ fontSize: 18, opacity: i < hud.hearts ? 1 : 0.25 }}>
              ❤️
            </span>
          ))}
        </div>

        <div
          style={{
            background: "rgba(0,0,0,0.5)",
            borderRadius: 6,
            padding: "4px 10px",
            fontFamily: "monospace",
            fontSize: 11,
            color: hud.rampage ? "#ff80ff" : hud.gassed ? "#80ff80" : "#fff",
            fontWeight: 700,
          }}
        >
          {hud.status}
        </div>
      </div>

      {hud.popupText && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "42%",
            transform: "translate(-50%, -50%)",
            background: "rgba(0,0,0,0.7)",
            border: "3px solid #ff60c0",
            borderRadius: 10,
            padding: "10px 20px",
            fontFamily: "monospace",
            fontSize: 18,
            fontWeight: 800,
            color: "#fff",
            textShadow: "2px 2px 0 #802060",
          }}
        >
          {hud.popupText}
        </div>
      )}
    </div>
  );
}
