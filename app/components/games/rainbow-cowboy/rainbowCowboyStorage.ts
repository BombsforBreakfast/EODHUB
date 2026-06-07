import { supabase } from "@/app/lib/lib/supabaseClient";
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
  isNewBest: boolean;
  previousBest: number | null;
  currentBest: number;
};

export async function saveRainbowCowboyPersonalBest(
  result: RainbowCowboyRunResult,
  userId: string | null,
): Promise<SavePersonalBestResult> {
  if (!userId || !result.completed) {
    return {
      saved: false,
      isNewBest: false,
      previousBest: null,
      currentBest: result.score,
    };
  }

  const existing = await getRainbowCowboyPersonalBest(result.levelId, userId);

  if (existing && result.score <= existing.score) {
    return {
      saved: false,
      isNewBest: false,
      previousBest: existing.score,
      currentBest: existing.score,
    };
  }

  const row = {
    user_id: userId,
    level_id: result.levelId,
    level_slug: result.levelSlug,
    score: result.score,
    rank: result.rank,
    completed: true,
    duration_seconds: result.durationSeconds,
    drones_eaten: result.dronesEaten,
    balloons_survived: result.balloonsSurvived,
    rainbow_blasts_used: result.rainbowBlastsUsed,
    damage_taken: result.damageTaken,
    completed_at: result.completedAt,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { error } = await supabase
      .from("rainbow_cowboy_high_scores")
      .update(row)
      .eq("user_id", userId)
      .eq("level_id", result.levelId);

    if (error) {
      console.error("Failed to update rainbow cowboy high score:", error);
      return {
        saved: false,
        isNewBest: false,
        previousBest: existing.score,
        currentBest: existing.score,
      };
    }

    return {
      saved: true,
      isNewBest: true,
      previousBest: existing.score,
      currentBest: result.score,
    };
  }

  const { error } = await supabase.from("rainbow_cowboy_high_scores").insert(row);

  if (error) {
    console.error("Failed to insert rainbow cowboy high score:", error);
    return {
      saved: false,
      isNewBest: false,
      previousBest: null,
      currentBest: result.score,
    };
  }

  return {
    saved: true,
    isNewBest: true,
    previousBest: null,
    currentBest: result.score,
  };
}

const LOCAL_BEST_KEY = "rainbow-cowboy-local-best";

export function getLocalPersonalBest(levelId: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LOCAL_BEST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, number>;
    return parsed[levelId] ?? null;
  } catch {
    return null;
  }
}

export function saveLocalPersonalBest(levelId: string, score: number): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(LOCAL_BEST_KEY);
    const parsed: Record<string, number> = raw ? JSON.parse(raw) : {};
    const existing = parsed[levelId];
    if (existing == null || score > existing) {
      parsed[levelId] = score;
      localStorage.setItem(LOCAL_BEST_KEY, JSON.stringify(parsed));
    }
  } catch {
    // ignore
  }
}
