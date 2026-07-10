import type { SupabaseClient } from "@supabase/supabase-js";

/** Resolve merged duplicate signup emails to the canonical auth.users email. */
export async function resolveAuthLoginEmail(
  supabase: SupabaseClient,
  email: string,
): Promise<string> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return normalized;

  const { data, error } = await supabase.rpc("resolve_auth_login_email", {
    p_email: normalized,
  });

  if (error || typeof data !== "string" || !data.trim()) {
    return normalized;
  }

  return data.trim().toLowerCase();
}
