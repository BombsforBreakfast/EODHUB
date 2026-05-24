import type { SupabaseClient } from "@supabase/supabase-js";

export type GiphyEndpoint = "trending" | "search";

export async function logGiphyApiCall(
  adminClient: SupabaseClient,
  endpoint: GiphyEndpoint,
  userId: string | null,
): Promise<void> {
  const { error } = await adminClient.from("giphy_api_calls").insert([
    { endpoint, user_id: userId },
  ]);
  if (error) {
    console.warn("[giphy] failed to log api call:", error.message);
  }
}

export async function countGiphyCallsLastHour(
  adminClient: SupabaseClient,
): Promise<{ count: number; error: string | null }> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await adminClient
    .from("giphy_api_calls")
    .select("*", { count: "exact", head: true })
    .gte("created_at", since);

  if (error) {
    return { count: 0, error: error.message };
  }
  return { count: count ?? 0, error: null };
}
