import { supabase } from "@/app/lib/lib/supabaseClient";
import type { ArcadeGameId, GameLeaderboardEntry } from "./gameLeaderboardTypes";

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
  const rpcName =
    game === "rainbow_cowboy" ? "get_rainbow_cowboy_leaderboard" : "get_render_safe_leaderboard";

  const { data, error } = await supabase.rpc(rpcName, {
    p_level_id: levelId,
    p_limit: limit,
  });

  if (error) {
    console.error(`Failed to load ${game} leaderboard:`, error);
    return [];
  }

  return ((data as LeaderboardRow[] | null) ?? []).map(mapRow);
}
