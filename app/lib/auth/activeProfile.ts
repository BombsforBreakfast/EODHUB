import type { SupabaseClient, User } from "@supabase/supabase-js";

export const ACTIVE_PROFILE_DEBUG_COLUMNS =
  "user_id, email, display_name, first_name, last_name, photo_url";

export type ActiveProfileDebugFields = {
  user_id: string;
  email?: string | null;
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  photo_url?: string | null;
};

type LoadActiveProfileOptions = {
  route: string;
  select: string;
};

export async function loadActiveProfile<T extends ActiveProfileDebugFields>(
  supabase: SupabaseClient,
  user: User,
  options: LoadActiveProfileOptions
): Promise<{ profile: T | null; error: Error | null }> {
  console.log("AUTH DEBUG:", {
    route: options.route,
    user_id: user.id,
    email: user.email ?? null,
  });

  const { data, error } = await supabase
    .from("profiles")
    .select(options.select)
    .eq("user_id", user.id)
    .maybeSingle();

  const profile = (data ?? null) as T | null;

  console.log("PROFILE DEBUG:", {
    route: options.route,
    profile_found: !!profile,
    profile_user_id: profile?.user_id ?? null,
    profile_email: profile?.email ?? null,
    profile_display_name: profile?.display_name ?? null,
    profile_first_name: profile?.first_name ?? null,
    profile_last_name: profile?.last_name ?? null,
    profile_photo_url: profile?.photo_url ?? null,
  });

  return { profile, error: error as Error | null };
}
