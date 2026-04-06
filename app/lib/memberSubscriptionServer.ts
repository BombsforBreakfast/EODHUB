import type { SupabaseClient } from "@supabase/supabase-js";
import { memberHasInteractionAccess } from "./subscriptionAccess";

export async function assertMemberInteractionAllowed(
  adminClient: SupabaseClient,
  userId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data: profile } = await adminClient
    .from("profiles")
    .select("account_type, subscription_status, is_admin")
    .eq("user_id", userId)
    .maybeSingle();

  const { data: authData, error: authErr } = await adminClient.auth.admin.getUserById(userId);
  if (authErr || !authData?.user) {
    return { ok: false, message: "User not found" };
  }

  const allowed = memberHasInteractionAccess({
    accountType: profile?.account_type,
    subscriptionStatus: profile?.subscription_status ?? null,
    authUserCreatedAtIso: authData.user.created_at,
    isAdmin: profile?.is_admin,
  });

  if (!allowed) {
    return { ok: false, message: "Subscription required" };
  }
  return { ok: true };
}
