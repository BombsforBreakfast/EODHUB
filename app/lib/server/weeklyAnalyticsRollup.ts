import type { SupabaseClient } from "@supabase/supabase-js";

export type WeeklyAnalyticsRollup = {
  window_start: string;
  window_end: string;
  this_week: {
    new_users: number;
    new_verified: number;
    new_community_jobs: number;
    new_resources: number;
    new_posts: number;
    new_recruits: number;
    new_plank_holders: number;
  };
  platform: {
    total_members: number;
    verified_members: number;
    pending_verification: number;
    completed_profiles: number;
    plank_holders: number;
    recruiters: number;
    wau: number;
    authenticated_untracked: number;
  };
  this_week_engagement: {
    distinct_posters: number;
    distinct_commenters: number;
    active_users: number;
  };
  demographics: {
    active_duty: number;
    retired: number;
    former: number;
    army: number;
    marines: number;
    air_force: number;
    navy: number;
    civilian_bomb_tech: number;
  };
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Previous 7-day window ending at `until` (exclusive upper bound). */
export function weeklyAnalyticsWindow(until: Date = new Date()): { since: Date; until: Date } {
  const end = new Date(until);
  const start = new Date(end.getTime() - 7 * MS_PER_DAY);
  return { since: start, until: end };
}

export async function fetchWeeklyAnalyticsRollup(
  admin: SupabaseClient,
  since: Date,
  until: Date,
): Promise<WeeklyAnalyticsRollup> {
  const { data, error } = await admin.rpc("weekly_analytics_snapshot", {
    p_since: since.toISOString(),
    p_until: until.toISOString(),
  });

  if (error) {
    throw new Error(`weekly_analytics_snapshot failed: ${error.message}`);
  }

  return data as WeeklyAnalyticsRollup;
}
