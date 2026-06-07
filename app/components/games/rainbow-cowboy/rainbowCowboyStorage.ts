import { supabase } from "@/app/lib/lib/supabaseClient";
import { formatRainbowCowboyDuration } from "./rainbowCowboyFormat";
import { getRainbowCowboyLevels } from "./rainbowCowboyLevels";
import type { RainbowCowboyPersonalBest, RainbowCowboyRunResult } from "./rainbowCowboyTypes";

export { getRainbowCowboyLevels };

export async function getRainbowCowboyPersonalBest(
  levelId: string,
  userId: string | null,
): Promise<RainbowCowboyPersonalBest | null> {
  if (!userId) return null;

  const { data, error } = await supabase
    .from("rainbow_cowboy_high_scores")
    .select("score, rank, duration_seconds, drones_eaten")
    .eq("user_id", userId)
    .eq("level_id", levelId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    score: data.score,
    rank: data.rank ?? "",
    durationSeconds: data.duration_seconds,
    dronesEaten: data.drones_eaten,
  };
}

export type SavePersonalBestResult = {
  saved: boolean;
  isNewScoreBest: boolean;
  isNewTimeBest: boolean;
  previousBest: number | null;
  currentBest: number;
  previousBestTime: number | null;
  currentBestTime: number | null;
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

export async function saveRainbowCowboyPersonalBest(
  result: RainbowCowboyRunResult,
  userId: string | null,
): Promise<SavePersonalBestResult> {
  if (!userId || !result.completed) {
    return emptySaveResult(null, result);
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

  const row = {
    user_id: userId,
    level_id: result.levelId,
    level_slug: result.levelSlug,
    score: nextScore,
    rank: nextRank,
    completed: true,
    duration_seconds: nextDuration,
    drones_eaten: scoreImproved ? result.dronesEaten : existing!.dronesEaten,
    balloons_survived: result.balloonsSurvived,
    rainbow_blasts_used: result.rainbowBlastsUsed,
    damage_taken: result.damageTaken,
    completed_at: result.completedAt,
    updated_at: new Date().toISOString(),
  };

  if (existing && !scoreImproved) {
    const { data: fullExisting } = await supabase
      .from("rainbow_cowboy_high_scores")
      .select("drones_eaten, balloons_survived, rainbow_blasts_used, damage_taken")
      .eq("user_id", userId)
      .eq("level_id", result.levelId)
      .maybeSingle();

    if (fullExisting) {
      row.drones_eaten = fullExisting.drones_eaten;
      row.balloons_survived = fullExisting.balloons_survived;
      row.rainbow_blasts_used = fullExisting.rainbow_blasts_used;
      row.damage_taken = fullExisting.damage_taken;
    }
  }

  const { error } = existing
    ? await supabase
        .from("rainbow_cowboy_high_scores")
        .update(row)
        .eq("user_id", userId)
        .eq("level_id", result.levelId)
    : await supabase.from("rainbow_cowboy_high_scores").insert(row);

  if (error) {
    console.error("Failed to save rainbow cowboy high score:", error);
    return emptySaveResult(existing, result);
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

const LOCAL_BEST_KEY = "rainbow-cowboy-local-best";

type LocalBestRecord = {
  score: number;
  durationSeconds: number | null;
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
    };
  } catch {
    return null;
  }
}

export function saveLocalPersonalBest(result: RainbowCowboyRunResult): SavePersonalBestResult {
  if (typeof window === "undefined" || !result.completed) {
    return emptySaveResult(null, result);
  }

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
          ? `Personal Best Saved — ${saveResult.currentBest} pts`
          : `New Score PB — ${saveResult.currentBest} pts`,
      );
    }
    if (saveResult.isNewTimeBest) {
      parts.push(
        saveResult.previousBestTime == null
          ? `Best Time — ${runTime}`
          : `New Best Time — ${formatRainbowCowboyDuration(saveResult.currentBestTime ?? result.durationSeconds)}`,
      );
    }
    return parts.join(" · ");
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
