import { supabase } from "@/app/lib/lib/supabaseClient";
import { formatRainbowCowboyDuration } from "./rainbowCowboyFormat";
import { formatDifficultyLabel } from "./rainbowCowboyDifficulty";
import { getRainbowCowboyLevels } from "./rainbowCowboyLevels";
import {
  applyCompletion,
  mergeProgressMaps,
  progressFromPersonalBestDifficulty,
  type RainbowCowboyProgressMap,
} from "./rainbowCowboyProgression";
import type {
  RainbowCowboyDifficulty,
  RainbowCowboyPersonalBest,
  RainbowCowboyRunResult,
} from "./rainbowCowboyTypes";

export { getRainbowCowboyLevels };

const REMOTE_ARCADE_DATA_CACHE_TTL_MS = 60 * 1000;

type RainbowCowboyArcadeData = {
  personalBests: Record<string, RainbowCowboyPersonalBest | null>;
  progress: RainbowCowboyProgressMap;
};

function remoteArcadeDataCacheKey(userId: string): string {
  return `rainbow-cowboy-arcade-data:${userId}`;
}

function readCachedRemoteArcadeData(userId: string): RainbowCowboyArcadeData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(remoteArcadeDataCacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RainbowCowboyArcadeData & { expiresAt?: number };
    if (!parsed.expiresAt || parsed.expiresAt <= Date.now()) {
      sessionStorage.removeItem(remoteArcadeDataCacheKey(userId));
      return null;
    }
    return {
      personalBests: parsed.personalBests,
      progress: parsed.progress,
    };
  } catch {
    return null;
  }
}

function cacheRemoteArcadeData(userId: string, data: RainbowCowboyArcadeData): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      remoteArcadeDataCacheKey(userId),
      JSON.stringify({ ...data, expiresAt: Date.now() + REMOTE_ARCADE_DATA_CACHE_TTL_MS }),
    );
  } catch {
    // Ignore cache failures; Supabase remains the source of truth.
  }
}

export function clearRainbowCowboyArcadeDataCache(userId: string | null): void {
  if (!userId || typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(remoteArcadeDataCacheKey(userId));
  } catch {
    // ignore
  }
}

export async function getRainbowCowboyPersonalBest(
  levelId: string,
  userId: string | null,
): Promise<RainbowCowboyPersonalBest | null> {
  if (!userId) return null;

  const { data, error } = await supabase
    .from("rainbow_cowboy_high_scores")
    .select("score, rank, duration_seconds, drones_eaten, difficulty")
    .eq("user_id", userId)
    .eq("level_id", levelId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    score: data.score,
    rank: data.rank ?? "",
    durationSeconds: data.duration_seconds,
    dronesEaten: data.drones_eaten,
    difficulty: (data.difficulty as RainbowCowboyPersonalBest["difficulty"]) ?? "easy",
  };
}

export type SavePersonalBestResult = {
  saved: boolean;
  saveFailed?: boolean;
  isNewScoreBest: boolean;
  isNewTimeBest: boolean;
  previousBest: number | null;
  currentBest: number;
  previousBestTime: number | null;
  currentBestTime: number | null;
  coinGranted?: boolean;
};

type RecordRainbowCowboyRunRpcRow = {
  saved: boolean;
  is_new_score_best: boolean;
  is_new_time_best: boolean;
  previous_best: number | null;
  current_best: number;
  previous_best_time: number | null;
  current_best_time: number | null;
  level_id: string;
  score: number;
  rank: string | null;
  duration_seconds: number | null;
  drones_eaten: number;
  difficulty: string | null;
  coin_granted?: boolean;
};

function emptySaveResult(
  existing: RainbowCowboyPersonalBest | null,
  result: RainbowCowboyRunResult,
): SavePersonalBestResult {
  return {
    saved: false,
    isNewScoreBest: false,
    isNewTimeBest: false,
    previousBest: existing?.score ?? null,
    currentBest: existing?.score ?? result.score,
    previousBestTime: existing?.durationSeconds ?? null,
    currentBestTime: existing?.durationSeconds ?? result.durationSeconds,
  };
}

type HighScoreRow = {
  level_id: string;
  score: number;
  rank: string | null;
  duration_seconds: number | null;
  drones_eaten: number;
  difficulty: string | null;
};

function mapHighScoreRow(row: HighScoreRow): RainbowCowboyPersonalBest {
  return {
    score: row.score,
    rank: row.rank ?? "",
    durationSeconds: row.duration_seconds,
    dronesEaten: row.drones_eaten,
    difficulty: (row.difficulty as RainbowCowboyPersonalBest["difficulty"]) ?? "easy",
  };
}

function emptyPersonalBestsRecord(): Record<string, RainbowCowboyPersonalBest | null> {
  const out: Record<string, RainbowCowboyPersonalBest | null> = {};
  for (const level of getRainbowCowboyLevels()) {
    if (!level.locked) out[level.id] = null;
  }
  return out;
}

function progressFromHighScoreRows(rows: HighScoreRow[]): RainbowCowboyProgressMap {
  const out: RainbowCowboyProgressMap = {};
  for (const row of rows) {
    out[row.level_id] = progressFromPersonalBestDifficulty(
      (row.difficulty as RainbowCowboyPersonalBest["difficulty"]) ?? "easy",
    );
  }
  return out;
}

function progressFromCompletionRows(
  rows: { level_id: string; difficulty: string }[],
): RainbowCowboyProgressMap {
  const out: RainbowCowboyProgressMap = {};
  for (const row of rows) {
    const levelId = row.level_id;
    const difficulty = row.difficulty as RainbowCowboyDifficulty;
    out[levelId] = {
      ...out[levelId],
      [difficulty]: true,
    };
  }
  return out;
}

export async function loadRainbowCowboyArcadeData(userId: string | null): Promise<{
  personalBests: Record<string, RainbowCowboyPersonalBest | null>;
  progress: RainbowCowboyProgressMap;
}> {
  if (!userId) {
    const personalBests = emptyPersonalBestsRecord();
    for (const level of getRainbowCowboyLevels()) {
      if (level.locked) continue;
      personalBests[level.id] = getLocalPersonalBest(level.id);
    }
    return { personalBests, progress: getLocalRainbowCowboyProgress() };
  }

  const cached = readCachedRemoteArcadeData(userId);
  if (cached) return cached;

  // Page-open state only: two bounded reads hydrate progress and personal bests outside gameplay.
  const [completionsRes, highScoresRes] = await Promise.all([
    supabase.from("rainbow_cowboy_completions").select("level_id, difficulty").eq("user_id", userId),
    supabase
      .from("rainbow_cowboy_high_scores")
      .select("level_id, score, rank, duration_seconds, drones_eaten, difficulty")
      .eq("user_id", userId),
  ]);

  if (completionsRes.error) {
    console.error("Failed to load rainbow cowboy completions:", completionsRes.error);
  }
  if (highScoresRes.error) {
    console.error("Failed to load rainbow cowboy high scores:", highScoresRes.error);
  }

  const personalBests = emptyPersonalBestsRecord();
  const highScoreRows = (highScoresRes.data as HighScoreRow[] | null) ?? [];
  for (const row of highScoreRows) {
    personalBests[row.level_id] = mapHighScoreRow(row);
  }

  const progress = mergeProgressMaps(
    progressFromCompletionRows((completionsRes.data as { level_id: string; difficulty: string }[] | null) ?? []),
    progressFromHighScoreRows(highScoreRows),
  );

  const result = { personalBests, progress };
  cacheRemoteArcadeData(userId, result);
  return result;
}

export async function getRainbowCowboyProgress(userId: string | null): Promise<RainbowCowboyProgressMap> {
  const { progress } = await loadRainbowCowboyArcadeData(userId);
  return progress;
}

export async function recordRainbowCowboyCompletion(
  result: RainbowCowboyRunResult,
  userId: string | null,
): Promise<RainbowCowboyProgressMap> {
  if (!result.completed) {
    return userId ? await getRainbowCowboyProgress(userId) : getLocalRainbowCowboyProgress();
  }

  if (!userId) {
    return recordLocalRainbowCowboyCompletion(result);
  }

  const { error } = await supabase.from("rainbow_cowboy_completions").upsert(
    {
      user_id: userId,
      level_id: result.levelId,
      difficulty: result.difficulty,
      completed_at: result.completedAt,
    },
    { onConflict: "user_id,level_id,difficulty" },
  );

  if (error) {
    console.error("Failed to record rainbow cowboy completion:", error);
  }

  return getRainbowCowboyProgress(userId);
}

async function saveRainbowCowboyPersonalBestDirect(
  result: RainbowCowboyRunResult,
  userId: string,
): Promise<SavePersonalBestResult> {
  const { error: completionError } = await supabase.from("rainbow_cowboy_completions").upsert(
    {
      user_id: userId,
      level_id: result.levelId,
      difficulty: result.difficulty,
      completed_at: result.completedAt,
    },
    { onConflict: "user_id,level_id,difficulty" },
  );

  if (completionError) {
    console.error("Failed to record rainbow cowboy completion (fallback):", completionError);
    return { ...emptySaveResult(null, result), saveFailed: true };
  }

  const existing = await getRainbowCowboyPersonalBest(result.levelId, userId);
  const scoreImproved = !existing || result.score > existing.score;
  const timeImproved =
    existing?.durationSeconds == null || result.durationSeconds < existing.durationSeconds;

  if (!scoreImproved && !timeImproved) {
    return emptySaveResult(existing, result);
  }

  const nextScore = scoreImproved ? result.score : existing!.score;
  const nextRank = scoreImproved ? result.rank : existing!.rank;
  const nextDuration = timeImproved ? result.durationSeconds : existing!.durationSeconds;
  const nextDifficulty = scoreImproved ? result.difficulty : (existing?.difficulty ?? result.difficulty);
  const nextDronesEaten = scoreImproved ? result.dronesEaten : (existing?.dronesEaten ?? 0);

  const { error: highScoreError } = await supabase.from("rainbow_cowboy_high_scores").upsert(
    {
      user_id: userId,
      level_id: result.levelId,
      level_slug: result.levelSlug,
      score: nextScore,
      rank: nextRank,
      completed: true,
      duration_seconds: nextDuration,
      difficulty: nextDifficulty,
      drones_eaten: nextDronesEaten,
      balloons_survived: result.balloonsSurvived,
      rainbow_blasts_used: result.rainbowBlastsUsed,
      damage_taken: result.damageTaken,
      completed_at: result.completedAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,level_id" },
  );

  if (highScoreError) {
    console.error("Failed to record rainbow cowboy high score (fallback):", highScoreError);
    return { ...emptySaveResult(existing, result), saveFailed: true };
  }

  return {
    saved: true,
    isNewScoreBest: scoreImproved,
    isNewTimeBest: timeImproved,
    previousBest: existing?.score ?? null,
    currentBest: nextScore,
    previousBestTime: existing?.durationSeconds ?? null,
    currentBestTime: nextDuration,
  };
}

export async function saveRainbowCowboyPersonalBest(
  result: RainbowCowboyRunResult,
  userId: string | null,
): Promise<SavePersonalBestResult> {
  if (!userId || !result.completed) {
    return emptySaveResult(null, result);
  }

  clearRainbowCowboyArcadeDataCache(userId);

  // One bounded RPC records completion + personal best so victory never fans out into repeated writes/reads.
  const { data, error } = await supabase.rpc("record_rainbow_cowboy_run", {
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
    p_completed_at: result.completedAt,
  });

  if (error) {
    console.error("Failed to record rainbow cowboy run:", error);
    return saveRainbowCowboyPersonalBestDirect(result, userId);
  }

  const row = ((data as RecordRainbowCowboyRunRpcRow[] | null) ?? [])[0];
  if (!row) {
    console.warn("record_rainbow_cowboy_run returned no row; using direct save fallback.");
    return saveRainbowCowboyPersonalBestDirect(result, userId);
  }

  return {
    saved: row.saved,
    isNewScoreBest: row.is_new_score_best,
    isNewTimeBest: row.is_new_time_best,
    previousBest: row.previous_best,
    currentBest: row.current_best,
    previousBestTime: row.previous_best_time,
    currentBestTime: row.current_best_time,
    coinGranted: row.coin_granted === true,
  };
}

const LOCAL_BEST_KEY = "rainbow-cowboy-local-best";
const LOCAL_PROGRESS_KEY = "rainbow-cowboy-local-progress";

type LocalBestRecord = {
  score: number;
  durationSeconds: number | null;
  difficulty?: RainbowCowboyPersonalBest["difficulty"];
};

function parseLocalBests(raw: string | null): Record<string, LocalBestRecord> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, LocalBestRecord | number>;
    const out: Record<string, LocalBestRecord> = {};
    for (const [levelId, value] of Object.entries(parsed)) {
      if (typeof value === "number") {
        out[levelId] = { score: value, durationSeconds: null };
      } else {
        out[levelId] = value;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function getLocalPersonalBest(levelId: string): RainbowCowboyPersonalBest | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = parseLocalBests(localStorage.getItem(LOCAL_BEST_KEY));
    const best = parsed[levelId];
    if (!best) return null;
    return {
      score: best.score,
      rank: "",
      durationSeconds: best.durationSeconds,
      dronesEaten: 0,
      difficulty: best.difficulty ?? "easy",
    };
  } catch {
    return null;
  }
}

function parseLocalProgress(raw: string | null): RainbowCowboyProgressMap {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as RainbowCowboyProgressMap;
  } catch {
    return {};
  }
}

export function getLocalRainbowCowboyProgress(): RainbowCowboyProgressMap {
  if (typeof window === "undefined") return {};

  try {
    const fromCompletions = parseLocalProgress(localStorage.getItem(LOCAL_PROGRESS_KEY));
    const parsed = parseLocalBests(localStorage.getItem(LOCAL_BEST_KEY));
    const fromHighScores: RainbowCowboyProgressMap = {};
    for (const [levelId, best] of Object.entries(parsed)) {
      fromHighScores[levelId] = progressFromPersonalBestDifficulty(best.difficulty);
    }
    return mergeProgressMaps(fromCompletions, fromHighScores);
  } catch {
    return {};
  }
}

export function recordLocalRainbowCowboyCompletion(
  result: RainbowCowboyRunResult,
): RainbowCowboyProgressMap {
  if (typeof window === "undefined" || !result.completed) {
    return getLocalRainbowCowboyProgress();
  }

  try {
    const current = parseLocalProgress(localStorage.getItem(LOCAL_PROGRESS_KEY));
    const next = applyCompletion(current, result.levelId, result.difficulty);
    localStorage.setItem(LOCAL_PROGRESS_KEY, JSON.stringify(next));
    return mergeProgressMaps(next, getLocalRainbowCowboyProgress());
  } catch {
    return getLocalRainbowCowboyProgress();
  }
}

export function saveLocalPersonalBest(result: RainbowCowboyRunResult): SavePersonalBestResult {
  if (typeof window === "undefined" || !result.completed) {
    return emptySaveResult(null, result);
  }

  recordLocalRainbowCowboyCompletion(result);

  try {
    const parsed = parseLocalBests(localStorage.getItem(LOCAL_BEST_KEY));
    const existing = parsed[result.levelId] ?? null;
    const scoreImproved = !existing || result.score > existing.score;
    const timeImproved =
      existing?.durationSeconds == null || result.durationSeconds < existing.durationSeconds;

    if (!scoreImproved && !timeImproved) {
      return emptySaveResult(
        existing
          ? {
              score: existing.score,
              rank: "",
              durationSeconds: existing.durationSeconds,
              dronesEaten: 0,
            }
          : null,
        result,
      );
    }

    const next: LocalBestRecord = {
      score: scoreImproved ? result.score : existing!.score,
      durationSeconds: timeImproved ? result.durationSeconds : existing!.durationSeconds,
      difficulty: scoreImproved ? result.difficulty : (existing?.difficulty ?? result.difficulty),
    };
    parsed[result.levelId] = next;
    localStorage.setItem(LOCAL_BEST_KEY, JSON.stringify(parsed));

    return {
      saved: true,
      isNewScoreBest: scoreImproved,
      isNewTimeBest: timeImproved,
      previousBest: existing?.score ?? null,
      currentBest: next.score,
      previousBestTime: existing?.durationSeconds ?? null,
      currentBestTime: next.durationSeconds,
    };
  } catch {
    return emptySaveResult(null, result);
  }
}

export function buildPersonalBestMessage(
  saveResult: SavePersonalBestResult,
  result: RainbowCowboyRunResult,
): string {
  const runTime = formatRainbowCowboyDuration(result.durationSeconds);

  if (saveResult.saved) {
    const parts: string[] = [];
    if (saveResult.isNewScoreBest) {
      parts.push(
        saveResult.previousBest == null
          ? `Personal Best Saved — ${saveResult.currentBest} pts (${formatDifficultyLabel(result.difficulty)})`
          : `New Score PB — ${saveResult.currentBest} pts (${formatDifficultyLabel(result.difficulty)})`,
      );
    }
    if (saveResult.isNewTimeBest) {
      parts.push(
        saveResult.previousBestTime == null
          ? `Best Time — ${runTime}`
          : `New Best Time — ${formatRainbowCowboyDuration(saveResult.currentBestTime ?? result.durationSeconds)}`,
      );
    }
    if (saveResult.coinGranted) {
      parts.push("+1 Challenge Coin — global high score!");
    }
    return parts.join(" · ");
  }

  if (saveResult.saveFailed) {
    return `Run Score: ${result.score} · Could not save to leaderboard — try again.`;
  }

  const scoreLine =
    saveResult.previousBest != null
      ? `Score PB: ${saveResult.currentBest}`
      : `Run Score: ${result.score}`;
  const timeLine =
    saveResult.previousBestTime != null
      ? ` · Time PB: ${formatRainbowCowboyDuration(saveResult.previousBestTime)}`
      : "";

  return `${scoreLine}${timeLine} · This run: ${runTime}`;
}
