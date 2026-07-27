import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  canUsePostAsSelector,
  LISTING_SHARE_DEFAULT_POST_AS_MODE,
  POST_AS_ADMIN_EMAIL,
  type PostAsMode,
} from "../postAsIdentity";

/** Returns admin profile user_id when mode is admin and caller is allowed; otherwise null. */
export async function resolveOptionalAdminPostAsUserId(
  adminClient: SupabaseClient,
  user: User,
  postAsMode?: PostAsMode | null,
): Promise<string | null> {
  const email = user.email?.trim().toLowerCase() ?? null;
  if (!canUsePostAsSelector(email)) return null;
  if (postAsMode !== "admin") return null;

  const { data: adminProfile } = await adminClient
    .from("profiles")
    .select("user_id")
    .ilike("email", POST_AS_ADMIN_EMAIL)
    .maybeSingle();

  return adminProfile?.user_id ?? null;
}

export async function resolveListingSharePostAsUserId(
  adminClient: SupabaseClient,
  user: User,
  postAsMode?: PostAsMode | null,
): Promise<string | null> {
  const mode: PostAsMode = postAsMode ?? LISTING_SHARE_DEFAULT_POST_AS_MODE;
  return resolveOptionalAdminPostAsUserId(adminClient, user, mode);
}
