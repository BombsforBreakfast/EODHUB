import { supabase } from "@/app/lib/lib/supabaseClient";
import type { ArcadeGameId, GameLeaderboardEntry } from "./gameLeaderboardTypes";

const LEADERBOARD_CACHE_TTL_MS = 2 * 60 * 1000;
const leaderboardCache = new Map<string, { entries: GameLeaderboardEntry[]; expiresAt: number }>();

type LeaderboardRow = {
  user_id: string;
  display_name: string;
  photo_url: string | null;
  service: string | null;
  is_employer: boolean;
  score: number;
  rank: string | null;
  duration_seconds: number | null;
  completed_at: string;
  difficulty?: string | null;
};

function mapRow(row: LeaderboardRow): GameLeaderboardEntry {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    photoUrl: row.photo_url,
    service: row.service,
    isEmployer: row.is_employer,
    score: row.score,
    rank: row.rank,
    durationSeconds: row.duration_seconds,
    completedAt: row.completed_at,
    difficulty: row.difficulty ?? null,
  };
}

export async function fetchGameLeaderboard(
  game: ArcadeGameId,
  levelId: string,
  limit = 10,
): Promise<GameLeaderboardEntry[]> {
  const cacheKey = `${game}:${levelId}:${limit}`;
  const cached = leaderboardCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.entries;
  }

  const rpcName =
    game === "rainbow_cowboy" ? "get_rainbow_cowboy_leaderboard" : "get_render_safe_leaderboard";

  // Leaderboards load on page open/return only; this RPC is never called from gameplay loops.
  const { data, error } = await supabase.rpc(rpcName, {
    p_level_id: levelId,
    p_limit: limit,
  });

  if (error) {
    console.error(`Failed to load ${game} leaderboard:`, error);
    return [];
  }

  const entries = ((data as LeaderboardRow[] | null) ?? []).map(mapRow);
  leaderboardCache.set(cacheKey, {
    entries,
    expiresAt: Date.now() + LEADERBOARD_CACHE_TTL_MS,
  });
  return entries;
}

export function clearGameLeaderboardCache(game?: ArcadeGameId): void {
  if (!game) {
    leaderboardCache.clear();
    return;
  }
  for (const key of leaderboardCache.keys()) {
    if (key.startsWith(`${game}:`)) leaderboardCache.delete(key);
  }
}
