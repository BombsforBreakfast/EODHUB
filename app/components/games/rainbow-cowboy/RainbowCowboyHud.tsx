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
    <div className="rc-hud-root">
      <div className="rc-hud-top">
        <div className="rc-level-panel">
          <div style={{ color: "#ff80d0", fontWeight: 700 }}>{levelTitle}</div>
          <div className="rc-level-sub" style={{ opacity: 0.85 }}>
            {rideLabel ? `${rideLabel} · ` : ""}Eat drones · dodge hazards
          </div>
        </div>

        <div className="rc-score-panel">
          <div>Score: {hud.score}</div>
          <div style={{ color: "#ffe080" }}>Time: {formatRainbowCowboyDuration(hud.elapsedSeconds)}</div>
          {personalBest != null && (
            <div className="rc-score-pb">
              PB: {personalBest.score}
              {personalBest.durationSeconds != null &&
                ` · ${formatRainbowCowboyDuration(personalBest.durationSeconds)}`}
            </div>
          )}
        </div>
      </div>

      <div className="rc-hud-bottom">
        <div className="rc-hud-bottom-left">
          <div style={{ display: "flex", gap: 4 }}>
            {Array.from({ length: hud.maxHearts }).map((_, i) => (
              <span key={i} style={{ fontSize: 18, opacity: i < hud.hearts ? 1 : 0.25 }}>
                ❤️
              </span>
            ))}
          </div>
          <div
            className="rc-rainbow-charges"
            style={{
              border: `2px solid ${hud.rainbowCharges > 0 ? "rgba(255,224,128,0.7)" : "rgba(143,212,255,0.35)"}`,
              color: hud.rainbowCharges > 0 ? "#ffe080" : "#8fd4ff",
              fontWeight: hud.rainbowCharges > 0 ? 800 : 500,
              fontSize: hud.rainbowCharges > 0 ? 14 : 12,
            }}
          >
            🌈 ({hud.rainbowCharges})
          </div>
          {hud.weaponLabel && (
            <div className="rc-weapon-badge">🔫 {hud.weaponLabel}</div>
          )}
          {hud.bossActive && hud.bossMaxHp != null && hud.bossHp != null && (
            <div
              className="rc-boss-hp-badge"
              style={{
                marginTop: 4,
                padding: "2px 8px",
                borderRadius: 6,
                border: "1px solid rgba(255,80,80,0.6)",
                background: "rgba(0,0,0,0.35)",
                fontSize: 11,
                fontWeight: 700,
                color: "#ff8080",
              }}
            >
              NEST {hud.bossHp}/{hud.bossMaxHp}
            </div>
          )}
        </div>

        <div
          className="rc-status-badge"
          style={{
            color: hud.rampage ? "#ff80ff" : hud.gassed ? "#80ff80" : "#fff",
          }}
        >
          {hud.status}
        </div>
      </div>

      {hud.popupText && (
        <div className="rc-hud-popup">{hud.popupText}</div>
      )}
    </div>
  );
}
