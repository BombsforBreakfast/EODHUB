import type { SupabaseClient } from "@supabase/supabase-js";

export const BUSINESSES_STALE_MS = 10 * 60_000;

/**
 * Approved business listings. Read-only; safe to cache and share across
 * remounts (10 min stale). The caller passes the column set and limit so the
 * full /businesses page (wide columns, limit 500) and lighter surfaces can each
 * use an appropriate shape while still benefiting from caching.
 */
export async function fetchApprovedBusinessListings<T>(
  supabase: SupabaseClient,
  columns: string,
  limit: number,
): Promise<T[]> {
  const { data, error } = await supabase
    .from("business_listings")
    .select(columns)
    .eq("is_approved", true)
    .order("is_featured", { ascending: false })
    .order("business_name", { ascending: true, nullsFirst: false })
    .limit(limit);
  // The full page historically tolerates partial errors as long as some rows
  // returned; mirror that by returning whatever data exists and only throwing
  // when there is no data at all.
  if (error && (!data || (data as unknown[]).length === 0)) throw error;
  return (data ?? []) as T[];
}
