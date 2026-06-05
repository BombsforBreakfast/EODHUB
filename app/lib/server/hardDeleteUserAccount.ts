import type { SupabaseClient } from "@supabase/supabase-js";
import { purgePersonalAccountData } from "@/app/lib/server/accountDeletion";

function normalizeEmail(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized.includes("@") ? normalized : null;
}

async function deleteByUserId(
  admin: SupabaseClient,
  table: string,
  column: string,
  userId: string,
): Promise<string | null> {
  const { error } = await admin.from(table).delete().eq(column, userId);
  return error ? `Failed clearing ${table}: ${error.message}` : null;
}

/**
 * Admin-only hard delete: remove profile, auth user, and signup friction data so
 * the email can register again cleanly.
 */
export async function hardDeleteUserAccount(
  adminClient: SupabaseClient,
  userId: string,
  options?: { actorUserId?: string },
): Promise<{ success: true } | { success: false; error: string }> {
  if (options?.actorUserId && options.actorUserId === userId) {
    return { success: false, error: "You cannot delete your own admin account." };
  }

  const { data: authData, error: authLookupError } = await adminClient.auth.admin.getUserById(userId);
  if (authLookupError) {
    return { success: false, error: `Could not load auth user: ${authLookupError.message}` };
  }
  if (!authData?.user) {
    return { success: false, error: "Auth user not found." };
  }

  const email = normalizeEmail(authData.user.email);

  const { error: commentsErr } = await adminClient
    .from("post_comments")
    .delete()
    .eq("user_id", userId);
  if (commentsErr) {
    return { success: false, error: `Failed clearing comments: ${commentsErr.message}` };
  }

  const purgeResult = await purgePersonalAccountData(adminClient, userId);
  if (purgeResult.error) {
    return { success: false, error: purgeResult.error };
  }

  const userScopedDeletes: { table: string; column: string }[] = [
    { table: "onboarding_events", column: "user_id" },
    { table: "account_deletion_requests", column: "user_id" },
    { table: "marketplace_listings", column: "user_id" },
    { table: "bug_reports", column: "user_id" },
    { table: "messages", column: "sender_id" },
  ];
  for (const { table, column } of userScopedDeletes) {
    const err = await deleteByUserId(adminClient, table, column, userId);
    if (err) return { success: false, error: err };
  }

  if (email) {
    const { error: waitlistErr } = await adminClient
      .from("waitlist_signups")
      .delete()
      .eq("email", email);
    if (waitlistErr) {
      return { success: false, error: `Failed clearing waitlist entry: ${waitlistErr.message}` };
    }

    const { error: failedAuthErr } = await adminClient
      .from("failed_auth_reports")
      .delete()
      .eq("normalized_email", email);
    if (failedAuthErr) {
      return { success: false, error: `Failed clearing failed-auth reports: ${failedAuthErr.message}` };
    }
  }

  const { error: profileErr } = await adminClient
    .from("profiles")
    .delete()
    .eq("user_id", userId);
  if (profileErr) {
    return { success: false, error: `Failed deleting profile: ${profileErr.message}` };
  }

  const { error: authDeleteErr } = await adminClient.auth.admin.deleteUser(userId);
  if (authDeleteErr) {
    return {
      success: false,
      error: `Profile removed, but auth user delete failed: ${authDeleteErr.message}`,
    };
  }

  return { success: true };
}
