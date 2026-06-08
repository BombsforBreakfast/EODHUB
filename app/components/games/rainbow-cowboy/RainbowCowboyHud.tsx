"use client";

import { formatRainbowCowboyDuration } from "./rainbowCowboyFormat";
import type { RainbowCowboyHudSnapshot, RainbowCowboyPersonalBest } from "./rainbowCowboyTypes";

interface Props {
  hud: RainbowCowboyHudSnapshot;
  personalBest: RainbowCowboyPersonalBest | null;
  levelTitle: string;
  rideLabel?: string;
}

export function RainbowCowboyHud({ hud, personalBest, levelTitle, rideLabel }: Props) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 10,
        padding: "8px var(--rc-mobile-right-gutter, 12px) 8px var(--rc-safe-left, 12px)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          minWidth: 0,
          width: "100%",
        }}
      >
        <div
          style={{
            background: "rgba(0,0,0,0.55)",
            border: "2px solid rgba(255,120,200,0.5)",
            borderRadius: 8,
            padding: "5px 10px",
            fontFamily: "monospace",
            fontSize: 11,
            color: "#fff",
            lineHeight: 1.25,
            flex: "1 1 auto",
            minWidth: 0,
          }}
          className="rc-level-panel"
        >
          <div style={{ color: "#ff80d0", fontWeight: 700 }}>{levelTitle}</div>
          <div style={{ opacity: 0.85 }}>
            {rideLabel ? `${rideLabel} · ` : ""}Eat drones · dodge hazards
          </div>
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
            flex: "0 1 auto",
            minWidth: 0,
            maxWidth: "46vw",
          }}
          className="rc-score-panel"
        >
          <div>Score: {hud.score}</div>
          <div style={{ color: "#ffe080" }}>Time: {formatRainbowCowboyDuration(hud.elapsedSeconds)}</div>
          {personalBest != null && (
            <div style={{ opacity: 0.75 }}>
              PB: {personalBest.score}
              {personalBest.durationSeconds != null &&
                ` · ${formatRainbowCowboyDuration(personalBest.durationSeconds)}`}
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: 8,
          minWidth: 0,
          width: "100%",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", gap: 4 }}>
            {Array.from({ length: hud.maxHearts }).map((_, i) => (
              <span key={i} style={{ fontSize: 18, opacity: i < hud.hearts ? 1 : 0.25 }}>
                ❤️
              </span>
            ))}
          </div>
          <div
            style={{
              background: "rgba(0,0,0,0.55)",
              border: `2px solid ${hud.rainbowCharges > 0 ? "rgba(255,224,128,0.7)" : "rgba(143,212,255,0.35)"}`,
              borderRadius: 8,
              padding: "4px 10px",
              fontFamily: "monospace",
              fontSize: hud.rainbowCharges > 0 ? 14 : 12,
              fontWeight: hud.rainbowCharges > 0 ? 800 : 500,
              color: hud.rainbowCharges > 0 ? "#ffe080" : "#8fd4ff",
            }}
          >
            🌈 ({hud.rainbowCharges})
          </div>
          {hud.weaponLabel && (
            <div
              style={{
                background: "rgba(0,0,0,0.55)",
                border: "2px solid rgba(128,240,255,0.75)",
                borderRadius: 8,
                padding: "4px 10px",
                fontFamily: "monospace",
                fontSize: 13,
                fontWeight: 800,
                color: "#80f0ff",
              }}
            >
              🔫 {hud.weaponLabel}
            </div>
          )}
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
            flex: "0 1 auto",
            minWidth: 0,
            maxWidth: "42vw",
            textAlign: "right",
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

      <style>{`
        @media (max-width: 900px), (max-height: 500px), (pointer: coarse) {
          .rc-level-panel {
            max-width: min(320px, 52vw);
            padding: 4px 8px !important;
            line-height: 1.2 !important;
          }
          .rc-score-panel {
            margin-top: 54px;
            min-width: 96px;
            max-width: min(46vw, 168px) !important;
          }
        }
      `}</style>
    </div>
  );
}
