import type { SupabaseClient, User } from "@supabase/supabase-js";
import { isPortalOnlyIdentity } from "../account/access";
import { accountFetch } from "../account/client";

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
  if(isPortalOnlyIdentity(user)) {
    try { const result=await accountFetch(supabase,"/api/account/hub-profile");return {profile:result.profile as T|null,error:null}; }
    catch(error){return {profile:null,error:error instanceof Error?error:new Error("Could not load your profile.")};}
  }
  const { data, error } = await supabase
    .from("profiles")
    .select(options.select)
    .eq("user_id", user.id)
    .maybeSingle();

  const profile = (data ?? null) as T | null;

  return { profile, error: error as Error | null };
}
