import {
  buildPersonalBestMessage,
  getLocalPersonalBest,
  getLocalRainbowCowboyProgress,
  saveLocalPersonalBest,
  type SavePersonalBestResult,
} from "@/app/components/games/rainbow-cowboy/rainbowCowboyStorage";
import type {
  RainbowCowboyPersonalBest,
  RainbowCowboyRunResult,
} from "@/app/components/games/rainbow-cowboy/rainbowCowboyTypes";
import type { RainbowCowboyProgressMap } from "@/app/components/games/rainbow-cowboy/rainbowCowboyProgression";
import { getBsmSupabase } from "./supabaseClient";

export { buildPersonalBestMessage, getLocalPersonalBest, getLocalRainbowCowboyProgress, saveLocalPersonalBest };

export type BsmArcadeData = {
  personalBests: Record<string, RainbowCowboyPersonalBest | null>;
  progress: RainbowCowboyProgressMap;
};

export async function loadBsmArcadeData(userId: string | null): Promise<BsmArcadeData> {
  if (!userId) {
    const progress = getLocalRainbowCowboyProgress();
    const personalBests: Record<string, RainbowCowboyPersonalBest | null> = {};
    for (const levelId of Object.keys(progress)) {
      personalBests[levelId] = getLocalPersonalBest(levelId);
    }
    if (Object.keys(personalBests).length === 0) {
      personalBests["level-1"] = getLocalPersonalBest("level-1");
    }
    return { personalBests, progress };
  }

  const sb = getBsmSupabase();
  if (!sb) {
    return { personalBests: {}, progress: getLocalRainbowCowboyProgress() };
  }

  const { data, error } = await sb.rpc("get_bsm_personal_bests");
  if (error) {
    console.error("Failed to load BSM personal bests:", error);
    return { personalBests: {}, progress: {} };
  }

  const personalBests: Record<string, RainbowCowboyPersonalBest | null> = {};
  const progress: RainbowCowboyProgressMap = {};

  for (const row of (data ?? []) as Array<{
    level_id: string;
    score: number;
    rank: string | null;
    duration_seconds: number | null;
    difficulty: string | null;
    drones_eaten: number | null;
  }>) {
    const difficulty = (row.difficulty ?? "easy") as RainbowCowboyPersonalBest["difficulty"];
    personalBests[row.level_id] = {
      score: row.score,
      rank: row.rank ?? "",
      durationSeconds: row.duration_seconds,
      dronesEaten: row.drones_eaten ?? 0,
      difficulty,
    };
    progress[row.level_id] = { [difficulty]: true };
  }

  return { personalBests, progress };
}

export async function saveBsmPersonalBest(
  result: RainbowCowboyRunResult,
  userId: string,
): Promise<SavePersonalBestResult> {
  const sb = getBsmSupabase();
  if (!sb || !result.completed) {
    return saveLocalPersonalBest(result);
  }

  const { data, error } = await sb.rpc("record_bsm_run", {
    p_level_id: result.levelId,
    p_level_slug: result.levelSlug,
    p_score: result.score,
    p_rank: result.rank,
    p_duration_seconds: result.durationSeconds,
    p_difficulty: result.difficulty,
    p_drones_eaten: result.dronesEaten,
    p_balloons_survived: result.balloonsSurvived,
    p_rainbow_blasts_used: result.rainbowBlastsUsed,
    p_damage_taken: result.damageTaken,
    p_completed_at: new Date().toISOString(),
  });

  if (error) {
    console.error("record_bsm_run failed:", error);
    return { ...saveLocalPersonalBest(result), saveFailed: true };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return saveLocalPersonalBest(result);
  }

  return {
    saved: row.saved === true,
    isNewScoreBest: row.is_new_score_best === true,
    isNewTimeBest: row.is_new_time_best === true,
    previousBest: row.previous_best ?? null,
    currentBest: row.current_best ?? result.score,
    previousBestTime: row.previous_best_time ?? null,
    currentBestTime: row.current_best_time ?? result.durationSeconds,
  };
}

const MERGE_FLAG_KEY = "bsm-local-progress-merged";

export async function mergeLocalProgressToAccount(userId: string): Promise<void> {
  if (typeof window === "undefined") return;
  const flag = `${MERGE_FLAG_KEY}:${userId}`;
  if (localStorage.getItem(flag) === "1") return;

  const localProgress = getLocalRainbowCowboyProgress();
  const levelIds = Object.keys(localProgress);
  if (levelIds.length === 0) {
    localStorage.setItem(flag, "1");
    return;
  }

  for (const levelId of levelIds) {
    const best = getLocalPersonalBest(levelId);
    if (!best) continue;
    await saveBsmPersonalBest(
      {
        levelId,
        levelSlug: levelId,
        score: best.score,
        rank: best.rank,
        durationSeconds: best.durationSeconds ?? 0,
        difficulty: best.difficulty ?? "easy",
        dronesEaten: best.dronesEaten ?? 0,
        balloonsSurvived: 0,
        rainbowBlastsUsed: 0,
        damageTaken: 0,
        heartsRemaining: 0,
        redBaronsDestroyed: 0,
        nestsDestroyed: 0,
        bombsDodged: 0,
        completed: true,
        completedAt: new Date().toISOString(),
      },
      userId,
    );
  }

  localStorage.setItem(flag, "1");
}
