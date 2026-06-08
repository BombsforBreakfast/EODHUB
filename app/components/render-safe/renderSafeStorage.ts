import { supabase } from "@/app/lib/lib/supabaseClient";
import { getRenderSafeLevels } from "./renderSafeLevels";
import type { RenderSafePersonalBest, RenderSafeRunResult } from "./renderSafeTypes";

export { getRenderSafeLevels };

export async function getRenderSafePersonalBest(
  levelId: string,
  userId: string | null,
): Promise<RenderSafePersonalBest | null> {
  if (!userId) return null;

  const { data, error } = await supabase
    .from("render_safe_high_scores")
    .select("score, rank, mistakes, duration_seconds")
    .eq("user_id", userId)
    .eq("level_id", levelId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    score: data.score,
    rank: data.rank,
    mistakes: data.mistakes,
    durationSeconds: data.duration_seconds,
  };
}

export type SavePersonalBestResult = {
  saved: boolean;
  isNewBest: boolean;
  previousBest: number | null;
  currentBest: number;
};

export async function saveRenderSafePersonalBest(
  result: RenderSafeRunResult,
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

  const existing = await getRenderSafePersonalBest(result.levelId, userId);

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
    mistakes: result.mistakes,
    completed: true,
    duration_seconds: result.durationSeconds,
    completed_at: result.completedAt,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { error } = await supabase
      .from("render_safe_high_scores")
      .update(row)
      .eq("user_id", userId)
      .eq("level_id", result.levelId);

    if (error) {
      console.error("Failed to update render safe high score:", error);
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

  const { error } = await supabase.from("render_safe_high_scores").insert(row);

  if (error) {
    console.error("Failed to insert render safe high score:", error);
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

const LOCAL_BEST_KEY = "render-safe-local-best";

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
    // ignore local storage errors
  }
}
