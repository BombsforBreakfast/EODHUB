import type { GameLeaderboardEntry } from "@/app/components/games/gameLeaderboardTypes";
import { getBsmSupabase } from "./supabaseClient";

const LEADERBOARD_CACHE_TTL_MS = 2 * 60 * 1000;
const leaderboardCache = new Map<string, { entries: GameLeaderboardEntry[]; expiresAt: number }>();

type BsmLeaderboardRow = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  score: number;
  rank: string | null;
  duration_seconds: number | null;
  difficulty: string | null;
  completed_at: string;
};

function mapRow(row: BsmLeaderboardRow): GameLeaderboardEntry {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    photoUrl: row.avatar_url,
    service: null,
    isEmployer: false,
    score: row.score,
    rank: row.rank,
    durationSeconds: row.duration_seconds,
    completedAt: row.completed_at,
    difficulty: row.difficulty ?? null,
  };
}

export async function fetchGameLeaderboard(
  _game: "rainbow_cowboy" | "render_safe",
  levelId: string,
  limit = 10,
): Promise<GameLeaderboardEntry[]> {
  const sb = getBsmSupabase();
  if (!sb) return [];

  const cacheKey = `bsm:${levelId}:${limit}`;
  const cached = leaderboardCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.entries;
  }

  const { data, error } = await sb.rpc("get_bsm_leaderboard", {
    p_level_id: levelId,
    p_limit: limit,
  });

  if (error) {
    console.error("Failed to load BSM leaderboard:", error);
    return [];
  }

  const entries = ((data as BsmLeaderboardRow[] | null) ?? []).map(mapRow);
  leaderboardCache.set(cacheKey, {
    entries,
    expiresAt: Date.now() + LEADERBOARD_CACHE_TTL_MS,
  });
  return entries;
}

export function clearGameLeaderboardCache(): void {
  leaderboardCache.clear();
}
