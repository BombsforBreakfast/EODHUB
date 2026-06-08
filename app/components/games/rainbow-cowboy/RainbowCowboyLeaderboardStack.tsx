"use client";

import { useEffect, useMemo, useState } from "react";
import { GameLeaderboard } from "@/app/components/games/GameLeaderboard";
import { fetchGameLeaderboard } from "@/app/components/games/gameLeaderboardStorage";
import type { GameLeaderboardEntry } from "@/app/components/games/gameLeaderboardTypes";
import type { RainbowCowboyLevel } from "./rainbowCowboyTypes";

interface Props {
  levels: RainbowCowboyLevel[];
}

export function RainbowCowboyLeaderboardStack({ levels }: Props) {
  const playableLevels = useMemo(
    () => levels.filter((level) => !level.locked && level.status !== "coming_soon"),
    [levels],
  );
  const levelKey = useMemo(() => playableLevels.map((level) => level.id).join(","), [playableLevels]);
  const [entriesByLevel, setEntriesByLevel] = useState<Record<string, GameLeaderboardEntry[]>>({});
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  useEffect(() => {
    if (playableLevels.length === 0) return;

    let cancelled = false;
    void Promise.all(
      playableLevels.map(async (level) => {
        const entries = await fetchGameLeaderboard("rainbow_cowboy", level.id, 10);
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
  }, [levelKey, playableLevels.length]);

  const loading = loadedKey !== levelKey;

  return (
    <>
      {playableLevels.map((level) => (
        <GameLeaderboard
          key={level.id}
          game="rainbow_cowboy"
          levelId={level.id}
          levelTitle={level.title}
          accentColor="#ff60c0"
          entries={entriesByLevel[level.id]}
          loading={loading && entriesByLevel[level.id] == null}
        />
      ))}
    </>
  );
}
