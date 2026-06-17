"use client";

import { useTheme } from "@/app/lib/ThemeContext";
import { BSM_ACCENT, BSM_SURFACE_TINT } from "../bomb-suit-man/bombSuitManTheme";
import { formatRainbowCowboyDuration } from "./rainbowCowboyFormat";
import {
  getLevelLockMessage,
  isLevelUnlocked,
  type RainbowCowboyProgressMap,
} from "./rainbowCowboyProgression";
import { isFobThunderSecured } from "./rainbowCowboyCampaign";
import type { RainbowCowboyLevel, RainbowCowboyPersonalBest } from "./rainbowCowboyTypes";

interface Props {
  levels: RainbowCowboyLevel[];
  personalBests: Record<string, RainbowCowboyPersonalBest | null>;
  progress: RainbowCowboyProgressMap;
  onSelectLevel: (levelId: string) => void;
}

export function RainbowCowboyLevelSelect({
  levels,
  personalBests,
  progress,
  onSelectLevel,
}: Props) {
  const { t } = useTheme();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {levels.map((level) => {
        const isBranchBase =
          level.campaignBase === "camp_poseidon" || level.campaignBase === "skywatch";
        const branchAwaitingHive = isBranchBase && !isFobThunderSecured(progress);
        const comingSoon = level.locked || level.status === "coming_soon";
        const progressionLocked = !comingSoon && !isLevelUnlocked(level.id, progress, levels);
        const locked = comingSoon ? true : progressionLocked || branchAwaitingHive;
        const best = personalBests[level.id];
        const lockMessage = branchAwaitingHive
          ? "Secure FOB Thunder (beat The Hive) to unlock"
          : progressionLocked
            ? getLevelLockMessage(level.id, levels)
            : comingSoon && isBranchBase && isFobThunderSecured(progress)
              ? "Unlocked · Coming Soon"
              : null;

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
              border: `2px solid ${locked ? t.borderLight : BSM_ACCENT}`,
              background: locked ? t.bg : BSM_SURFACE_TINT,
              color: locked ? t.textFaint : t.text,
              cursor: locked ? "not-allowed" : "pointer",
              opacity: locked ? 0.65 : 1,
            }}
          >
            <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 4 }}>
              {branchAwaitingHive
                ? "Branch Base · Locked"
                : comingSoon
                  ? isBranchBase && isFobThunderSecured(progress)
                    ? "Branch Base · Unlocked"
                    : "Coming Soon"
                  : progressionLocked
                    ? "Locked"
                    : level.isBossLevel
                      ? "Boss · FOB Thunder"
                      : level.campaignBase === "camp_poseidon" || level.campaignBase === "skywatch"
                        ? "Branch Base"
                        : level.difficulty}
            </div>
            <div style={{ fontWeight: 700, fontSize: 17 }}>{level.title}</div>
            {!comingSoon && !progressionLocked && (
              <div style={{ fontSize: 13, color: t.textMuted, marginTop: 4 }}>{level.subtitle}</div>
            )}
            {lockMessage && (
              <div style={{ fontSize: 12, color: t.textMuted, marginTop: 6 }}>{lockMessage}</div>
            )}
            {level.id === "level-4" && !locked && isFobThunderSecured(progress) && (
              <div style={{ fontSize: 12, color: "#80ffc8", marginTop: 6 }}>FOB Thunder secured</div>
            )}
            {!locked && best != null && (
              <div style={{ fontSize: 12, color: BSM_ACCENT, marginTop: 8, lineHeight: 1.5 }}>
                <div>Score PB: {best.score}</div>
                {best.durationSeconds != null && (
                  <div>Time PB: {formatRainbowCowboyDuration(best.durationSeconds)}</div>
                )}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
