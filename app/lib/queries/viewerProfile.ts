import type { QueryClient } from "@tanstack/react-query";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { queryKeys } from "../queryKeys";
import type { OnboardingGateProfile } from "../onboardingGate";

/**
 * Superset of every column read from `profiles` for the *viewer's own* profile
 * across the redirect gates, the shell, NavBar, and the home/jobs/businesses
 * inits. One cached fetch backs all of them so a single navigation no longer
 * issues 4-6 overlapping profile reads.
 *
 * IMPORTANT: must remain a superset. If any consumer needs a new column, add it
 * here (not via a separate narrower select) or that consumer will read stale
 * cache missing the field.
 */
export const VIEWER_PROFILE_SELECT =
  "user_id, first_name, last_name, service, company_name, account_type, is_pure_admin, must_complete_onboarding, created_at, email_verified, admin_verified, verification_status, is_approved, email, display_name, photo_url, status, professional_tags, unit_history_tags, subscription_status, referral_code, is_admin, show_memorial_feed_cards, nav_helper_seen, is_employer, privacy_show_online";

export const VIEWER_PROFILE_STALE_MS = 5 * 60_000;

export type ViewerProfile = OnboardingGateProfile & {
  email?: string | null;
  display_name?: string | null;
  photo_url?: string | null;
  status?: string | null;
  professional_tags?: string[] | null;
  unit_history_tags?: string[] | null;
  subscription_status?: string | null;
  referral_code?: string | null;
  is_admin?: boolean | null;
  show_memorial_feed_cards?: boolean | null;
  nav_helper_seen?: boolean | null;
  is_employer?: boolean | null;
  privacy_show_online?: boolean | null;
};

async function rawFetchViewerProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<ViewerProfile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(VIEWER_PROFILE_SELECT)
    .eq("user_id", userId)
    .maybeSingle();
  // Throw on a real error so React Query does not cache a transient failure as a
  // null result (which would otherwise pin the viewer into a redirect for the
  // whole stale window). A genuine "no row" returns null and is safe to cache.
  if (error) throw error;
  return (data ?? null) as ViewerProfile | null;
}

/**
 * Cached viewer-profile fetch shared by every gate/consumer. Control flow at the
 * call sites is unchanged: callers still receive the same profile shape and run
 * their own redirect logic. Errors resolve to `null` (matching the prior
 * `loadActiveProfile` behavior) and are NOT cached.
 */
export async function fetchViewerProfileCached(
  queryClient: QueryClient,
  supabase: SupabaseClient,
  user: User,
): Promise<ViewerProfile | null> {
  try {
    return await queryClient.fetchQuery({
      queryKey: queryKeys.viewerProfile(user.id),
      queryFn: () => rawFetchViewerProfile(supabase, user.id),
      staleTime: VIEWER_PROFILE_STALE_MS,
    });
  } catch (err) {
    console.error("viewer profile fetch failed:", err);
    return null;
  }
}

/** Invalidate the cached viewer profile after the viewer edits their own row. */
export function invalidateViewerProfile(queryClient: QueryClient, userId: string | null) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.viewerProfile(userId) });
}
