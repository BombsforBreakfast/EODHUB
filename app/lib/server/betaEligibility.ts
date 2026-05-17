import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServiceRoleClient } from "@/app/lib/auth/adminAuthLookup";

/** Shown when email is not on waitlist and not an approved member (generic). */
export const BETA_EMAIL_NOT_FOUND_MESSAGE =
  "User not found. Please double check your email or join the waitlist.";

async function emailOnWaitlist(client: SupabaseClient, normalizedEmail: string): Promise<boolean> {
  const { data, error } = await client
    .from("waitlist_signups")
    .select("id")
    .ilike("email", normalizedEmail)
    .limit(1)
    .maybeSingle();
  if (error) return false;
  return !!data;
}

async function emailHasApprovedProfile(client: SupabaseClient, normalizedEmail: string): Promise<boolean> {
  const { data, error } = await client
    .from("profiles")
    .select("user_id")
    .ilike("email", normalizedEmail)
    .eq("is_approved", true)
    .limit(1)
    .maybeSingle();
  if (error) return false;
  return !!data;
}

/** Waitlist signup or approved profile (service role; bypasses RLS). */
export async function isEmailEligibleForBetaAccess(normalizedEmail: string): Promise<{
  eligible: boolean;
  error: "missing_env" | "db_error" | null;
}> {
  const { client, error } = createSupabaseServiceRoleClient();
  if (error || !client) {
    return { eligible: false, error: "missing_env" };
  }

  try {
    const [onWaitlist, approved] = await Promise.all([
      emailOnWaitlist(client, normalizedEmail),
      emailHasApprovedProfile(client, normalizedEmail),
    ]);
    return { eligible: onWaitlist || approved, error: null };
  } catch {
    return { eligible: false, error: "db_error" };
  }
}
