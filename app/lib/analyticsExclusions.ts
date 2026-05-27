import type { SupabaseClient } from "@supabase/supabase-js";

/** Staff / founder accounts that should not pollute engagement metrics. */
export const ANALYTICS_EXCLUDED_USER_IDS = new Set<string>([
  "a28ddac8-dc3a-4ae1-83f5-b675e7b85871", // Michael Twigg
]);

export const ANALYTICS_EXCLUDED_EMAILS = new Set<string>([
  "hello@eod-hub.com", // EOD HUB Admin staff account
]);

export function isExcludedAnalyticsUser(user: {
  id?: string | null;
  email?: string | null;
} | null | undefined): boolean {
  if (!user) return false;
  if (user.id && ANALYTICS_EXCLUDED_USER_IDS.has(user.id)) return true;
  const email = user.email?.trim().toLowerCase();
  return !!email && ANALYTICS_EXCLUDED_EMAILS.has(email);
}

export function isExcludedAnalyticsUserId(userId: string | null | undefined): boolean {
  return !!userId && ANALYTICS_EXCLUDED_USER_IDS.has(userId);
}

/** Resolve static IDs plus any profile rows matching excluded emails. */
export async function loadAnalyticsExcludedUserIds(
  supabase: SupabaseClient,
): Promise<Set<string>> {
  const ids = new Set(ANALYTICS_EXCLUDED_USER_IDS);
  const emails = [...ANALYTICS_EXCLUDED_EMAILS];
  if (emails.length === 0) return ids;

  const { data, error } = await supabase.from("profiles").select("user_id, email").limit(5000);
  if (error || !data) return ids;

  for (const row of data as Array<{ user_id: string; email: string | null }>) {
    const email = row.email?.trim().toLowerCase();
    if (email && ANALYTICS_EXCLUDED_EMAILS.has(email)) {
      ids.add(row.user_id);
    }
  }

  return ids;
}
