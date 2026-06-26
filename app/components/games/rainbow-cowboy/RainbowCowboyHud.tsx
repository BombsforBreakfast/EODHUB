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
  const hasBossHealth = hud.bossHp != null && hud.bossMaxHp != null;

  return (
    <div className={`rc-hud-root${hasBossHealth ? " rc-hud-root--boss" : ""}`}>
      <div className="rc-hud-top">
        <div className="rc-level-panel">
          <div style={{ color: "#ff80d0", fontWeight: 700 }}>{levelTitle}</div>
          <div className="rc-level-sub" style={{ opacity: 0.85 }}>
            {rideLabel ? `${rideLabel} · ` : ""}Eat drones · dodge hazards
          </div>
        </div>

        <div className="rc-score-panel">
          <div>Score: {hud.score}</div>
          <div>Time: {formatRainbowCowboyDuration(hud.elapsedSeconds)}</div>
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

      {hasBossHealth && (
        <div
          className="rc-boss-health-panel"
          style={{
            borderColor: hud.bossHatchOpen ? "rgba(255,220,80,0.85)" : "rgba(255,80,160,0.65)",
          }}
        >
          <div style={{ fontSize: 11, color: "#ff80d0", marginBottom: 4, fontWeight: 700 }}>
            THE HIVE {hud.bossPhase != null ? `- Phase ${hud.bossPhase}` : ""}
            {hud.bossHatchOpen ? " · VULNERABLE" : " · ARMORED"}
          </div>
          <div className="rc-boss-health-track">
            <div
              className="rc-boss-health-fill"
              style={{
                width: `${Math.max(0, Math.min(1, hud.bossHp! / hud.bossMaxHp!)) * 100}%`,
                background: hud.bossHatchOpen
                  ? "linear-gradient(90deg, #ffe060, #ff8040)"
                  : "linear-gradient(90deg, #ff4080, #cc2060)",
              }}
            />
            {Array.from({ length: hud.bossSegments ?? 10 }).map((_, i) => (
              <div key={i} className="rc-boss-health-notch" />
            ))}
          </div>
          <div style={{ fontSize: 10, color: "#ccc" }}>
            {hud.bossHp}/{hud.bossMaxHp} HP
          </div>
        </div>
      )}
    </div>
  );
}
