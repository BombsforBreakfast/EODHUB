import { supabase } from "@/app/lib/lib/supabaseClient";
import { getRenderSafeLevels } from "./renderSafeLevels";
import type { RenderSafePersonalBest, RenderSafeRunResult } from "./renderSafeTypes";

export { getRenderSafeLevels };

const REMOTE_RENDER_SAFE_BESTS_CACHE_TTL_MS = 60 * 1000;

function remoteRenderSafeBestsCacheKey(userId: string): string {
  return `render-safe-personal-bests:${userId}`;
}

function readCachedRemoteRenderSafeBests(userId: string): Record<string, RenderSafePersonalBest | null> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(remoteRenderSafeBestsCacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      bests?: Record<string, RenderSafePersonalBest | null>;
      expiresAt?: number;
    };
    if (!parsed.expiresAt || parsed.expiresAt <= Date.now() || !parsed.bests) {
      sessionStorage.removeItem(remoteRenderSafeBestsCacheKey(userId));
      return null;
    }
    return parsed.bests;
  } catch {
    return null;
  }
}

function cacheRemoteRenderSafeBests(
  userId: string,
  bests: Record<string, RenderSafePersonalBest | null>,
): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      remoteRenderSafeBestsCacheKey(userId),
      JSON.stringify({ bests, expiresAt: Date.now() + REMOTE_RENDER_SAFE_BESTS_CACHE_TTL_MS }),
    );
  } catch {
    // Ignore cache failures; Supabase remains the source of truth.
  }
}

export function clearRenderSafePersonalBestsCache(userId: string | null): void {
  if (!userId || typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(remoteRenderSafeBestsCacheKey(userId));
  } catch {
    // ignore
  }
}

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

export async function loadRenderSafePersonalBests(
  userId: string | null,
): Promise<Record<string, RenderSafePersonalBest | null>> {
  const out: Record<string, RenderSafePersonalBest | null> = {};
  for (const level of getRenderSafeLevels()) {
    out[level.id] = userId ? null : {
      score: getLocalPersonalBest(level.id) ?? 0,
      rank: "",
      mistakes: 0,
      durationSeconds: null,
    };
    if (!userId && out[level.id]?.score === 0 && getLocalPersonalBest(level.id) == null) {
      out[level.id] = null;
    }
  }

  if (!userId) return out;

  const cached = readCachedRemoteRenderSafeBests(userId);
  if (cached) return cached;

  // One bounded RPC replaces per-level personal-best reads on arcade page load.
  const { data, error } = await supabase.rpc("get_render_safe_personal_bests");
  if (error) {
    console.error("Failed to load render safe personal bests:", error);
    return out;
  }

  for (const row of (data as {
    level_id: string;
    score: number;
    rank: string | null;
    mistakes: number;
    duration_seconds: number | null;
  }[] | null) ?? []) {
    out[row.level_id] = {
      score: row.score,
      rank: row.rank ?? "",
      mistakes: row.mistakes,
      durationSeconds: row.duration_seconds,
    };
  }

  cacheRemoteRenderSafeBests(userId, out);
  return out;
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

  clearRenderSafePersonalBestsCache(userId);

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
