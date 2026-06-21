"use client";

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/app/lib/ThemeContext";
import { GameLeaderboardTopPreview } from "@/app/components/games/GameLeaderboard";
import { fetchGameLeaderboard } from "@/app/components/games/gameLeaderboardStorage";
import type { GameLeaderboardEntry } from "@/app/components/games/gameLeaderboardTypes";
import { BSM_ACCENT, BSM_SURFACE_TINT } from "../bomb-suit-man/bombSuitManTheme";
import { formatRainbowCowboyDuration } from "./rainbowCowboyFormat";
import {
  getLevelLockMessage,
  isLevelUnlocked,
  isPlayableLevelMeta,
  type RainbowCowboyProgressMap,
} from "./rainbowCowboyProgression";
import { isFobThunderSecured } from "./rainbowCowboyCampaign";
import type { RainbowCowboyLevel, RainbowCowboyPersonalBest } from "./rainbowCowboyTypes";

const LEADERBOARD_ACCENT = "#c9a227";

interface Props {
  levels: RainbowCowboyLevel[];
  personalBests: Record<string, RainbowCowboyPersonalBest | null>;
  progress: RainbowCowboyProgressMap;
  refreshKey?: number;
  onSelectLevel: (levelId: string) => void;
  /** Standalone BSM app: hide leaderboard previews (separate Supabase). Default true. */
  showLeaderboards?: boolean;
  /** Extra gate (e.g. guest signup wall). Evaluated after campaign locks. */
  isAccessBlocked?: (levelId: string) => boolean;
  getAccessBlockMessage?: (levelId: string) => string | null;
}

export function RainbowCowboyLevelSelect({
  levels,
  personalBests,
  progress,
  refreshKey = 0,
  onSelectLevel,
  showLeaderboards = true,
  isAccessBlocked,
  getAccessBlockMessage,
}: Props) {
  const { t } = useTheme();

  const leaderboardLevels = useMemo(
    () => levels.filter(isPlayableLevelMeta),
    [levels],
  );
  const levelKey = useMemo(
    () => leaderboardLevels.map((level) => level.id).join(","),
    [leaderboardLevels],
  );
  const [entriesByLevel, setEntriesByLevel] = useState<Record<string, GameLeaderboardEntry[]>>({});
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!showLeaderboards || leaderboardLevels.length === 0) return;

    let cancelled = false;
    void Promise.all(
      leaderboardLevels.map(async (level) => {
        const entries = await fetchGameLeaderboard("rainbow_cowboy", level.id, 1);
        return [level.id, entries] as const;
      }),
    ).then((rows) => {
      if (cancelled) return;
      const next: Record<string, GameLeaderboardEntry[]> = {};
      for (const [levelId, entries] of rows) {
        next[levelId] = entries;
      }
      setEntriesByLevel(next);
      setLoadedKey(levelKey);
    });

    return () => {
      cancelled = true;
    };
  }, [levelKey, leaderboardLevels.length, refreshKey, showLeaderboards]);

  const leaderboardLoading = loadedKey !== levelKey;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {levels.map((level) => {
        const isBranchBase =
          level.campaignBase === "camp_poseidon" ||
          level.campaignBase === "camp_poseidon_trench" ||
          level.campaignBase === "camp_gator_gulch" ||
          level.campaignBase === "camp_poseidon_abyss";
        const branchAwaitingHive = isBranchBase && !isFobThunderSecured(progress);
        const comingSoon = level.locked || level.status === "coming_soon";
        const progressionLocked = !comingSoon && !isLevelUnlocked(level.id, progress, levels);
        const accessBlocked = isAccessBlocked?.(level.id) ?? false;
        const locked = comingSoon ? true : progressionLocked || branchAwaitingHive || accessBlocked;
        const best = personalBests[level.id];
        const lockMessage = accessBlocked
          ? (getAccessBlockMessage?.(level.id) ?? "Sign in to continue")
          : branchAwaitingHive
            ? "Secure FOB Thunder (beat The Hive) to unlock"
            : progressionLocked
              ? getLevelLockMessage(level.id, levels)
              : comingSoon && isBranchBase && isFobThunderSecured(progress)
                ? "Unlocked · Coming Soon"
                : null;
        const showLeaderboard = showLeaderboards && isPlayableLevelMeta(level);
        const topEntry = entriesByLevel[level.id]?.[0] ?? null;
        const entryLoading = showLeaderboard && leaderboardLoading && entriesByLevel[level.id] == null;

        return (
          <div
            key={level.id}
            role="button"
            tabIndex={locked ? -1 : 0}
            onClick={() => !locked && onSelectLevel(level.id)}
            onKeyDown={(e) => {
              if (!locked && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                onSelectLevel(level.id);
              }
            }}
            style={{
              width: "100%",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "stretch",
              gap: 12,
              padding: 14,
              borderRadius: 12,
              border: `2px solid ${locked ? t.borderLight : BSM_ACCENT}`,
              background: locked ? t.bg : BSM_SURFACE_TINT,
              color: locked ? t.textFaint : t.text,
              cursor: locked ? "not-allowed" : "pointer",
              opacity: locked ? 0.65 : 1,
            }}
          >
            <div style={{ flex: "1 1 180px", minWidth: 0 }}>
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
                        ? level.id === "level-8"
                          ? "Boss · Camp Poseidon"
                          : "Boss · FOB Thunder"
                        : level.campaignBase === "camp_poseidon" ||
                            level.campaignBase === "camp_poseidon_trench" ||
                            level.campaignBase === "camp_gator_gulch" ||
                            level.campaignBase === "camp_poseidon_abyss"
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
              {level.id === "level-8" && !locked && progress["level-8"] && (
                <div style={{ fontSize: 12, color: "#80ffc8", marginTop: 6 }}>Camp Poseidon secured</div>
              )}
              {!locked && best != null && (
                <div style={{ fontSize: 12, color: BSM_ACCENT, marginTop: 8, lineHeight: 1.5 }}>
                  <div>Your PB: {best.score}</div>
                  {best.durationSeconds != null && (
                    <div>Time PB: {formatRainbowCowboyDuration(best.durationSeconds)}</div>
                  )}
                </div>
              )}
            </div>

            {showLeaderboard && (
              <div
                style={{
                  flex: "0 1 240px",
                  minWidth: 200,
                  borderLeft: `1px solid ${locked ? t.borderLight : `${LEADERBOARD_ACCENT}33`}`,
                  paddingLeft: 12,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    color: LEADERBOARD_ACCENT,
                    marginBottom: 6,
                  }}
                >
                  Top Score
                </div>
                <GameLeaderboardTopPreview
                  entry={topEntry}
                  loading={entryLoading}
                  accentColor={LEADERBOARD_ACCENT}
                  emptyLabel="No scores yet — be first!"
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
