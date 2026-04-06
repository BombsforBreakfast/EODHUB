import type { SupabaseClient } from "@supabase/supabase-js";

/** Profiles with is_admin bypass verification and unit membership checks (QA / operations). */
export async function fetchProfileIsAppAdmin(
  adminClient: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data } = await adminClient
    .from("profiles")
    .select("is_admin")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.is_admin === true;
}
