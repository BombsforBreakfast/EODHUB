import type { SupabaseClient } from "@supabase/supabase-js";

const REASON_MAX = 500;
const VERIFICATION_DOCS_BUCKET = "verification-docs";

async function removeVerificationDocs(
  admin: SupabaseClient,
  userId: string,
): Promise<{ error?: string }> {
  const { data: profile } = await admin
    .from("profiles")
    .select("eod_cert_path")
    .eq("user_id", userId)
    .maybeSingle<{ eod_cert_path: string | null }>();

  const paths = new Set<string>();
  if (profile?.eod_cert_path?.trim()) {
    paths.add(profile.eod_cert_path.trim());
  }

  const { data: listed, error: listError } = await admin.storage
    .from(VERIFICATION_DOCS_BUCKET)
    .list(`${userId}/eod-cert`, { limit: 100 });

  if (listError && !/not found|Bucket not found/i.test(listError.message)) {
    return { error: `Failed listing verification docs: ${listError.message}` };
  }

  for (const file of listed ?? []) {
    if (file?.name) paths.add(`${userId}/eod-cert/${file.name}`);
  }

  if (paths.size > 0) {
    const { error: removeError } = await admin.storage
      .from(VERIFICATION_DOCS_BUCKET)
      .remove([...paths]);
    if (removeError && !/not found|Bucket not found/i.test(removeError.message)) {
      return { error: `Failed removing verification docs: ${removeError.message}` };
    }
  }

  return {};
}

export function normalizeDeletionReason(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, REASON_MAX);
}

/** Remove private/social data; keep posts, jobs, business listings, unit posts on ghost profile. */
export async function purgePersonalAccountData(
  admin: SupabaseClient,
  userId: string,
): Promise<{ error?: string }> {
  const verificationCleanup = await removeVerificationDocs(admin, userId);
  if (verificationCleanup.error) return verificationCleanup;

  const tablesByUserId: { table: string; column: string }[] = [
    { table: "cert_uploads", column: "user_id" },
    { table: "notifications", column: "user_id" },
    { table: "notifications", column: "recipient_user_id" },
    { table: "profile_connections", column: "requester_user_id" },
    { table: "profile_connections", column: "target_user_id" },
    { table: "profile_vouches", column: "voucher_user_id" },
    { table: "profile_vouches", column: "vouchee_user_id" },
    { table: "profile_vouch_dismissals", column: "viewer_user_id" },
    { table: "profile_vouch_dismissals", column: "vouchee_user_id" },
    { table: "unit_members", column: "user_id" },
    { table: "unit_post_likes", column: "user_id" },
    { table: "saved_jobs", column: "user_id" },
    { table: "saved_events", column: "user_id" },
    { table: "profile_photos", column: "user_id" },
    { table: "push_device_tokens", column: "user_id" },
    { table: "user_blocks", column: "blocker_id" },
    { table: "user_blocks", column: "blocked_id" },
  ];

  for (const { table, column } of tablesByUserId) {
    const { error } = await admin.from(table).delete().eq(column, userId);
    if (error) {
      // Legacy/orphan tables (e.g. cert_uploads) may not exist in every environment.
      if (/does not exist|Could not find the table/i.test(error.message)) continue;
      return { error: `Failed clearing ${table}: ${error.message}` };
    }
  }

  const { error: convErr } = await admin
    .from("conversations")
    .delete()
    .or(`participant_1.eq.${userId},participant_2.eq.${userId}`);
  if (convErr) {
    return { error: `Failed clearing conversations: ${convErr.message}` };
  }

  return {};
}

export async function anonymizeProfileForDeletion(
  admin: SupabaseClient,
  userId: string,
): Promise<{ error?: string }> {
  const now = new Date().toISOString();
  const { error } = await admin
    .from("profiles")
    .update({
      account_deleted_at: now,
      email: null,
      first_name: null,
      last_name: null,
      display_name: "Former member",
      name: null,
      photo_url: null,
      bio: null,
      company_name: null,
      company_website: null,
      company_phone: null,
      linkedin_url: null,
      referral_code: null,
      country: null,
      eod_cert_path: null,
      eod_cert_file_name: null,
      eod_cert_uploaded_at: null,
      privacy_discoverable: false,
      privacy_show_online: false,
      must_complete_onboarding: false,
      must_change_password: false,
      stripe_customer_id: null,
      subscription_status: null,
    })
    .eq("user_id", userId);

  if (error) {
    return { error: `Failed anonymizing profile: ${error.message}` };
  }
  return {};
}

export async function logAccountDeletionRequest(
  admin: SupabaseClient,
  params: { userId: string; email: string | null; reason: string | null },
): Promise<{ error?: string }> {
  const { error } = await admin.from("account_deletion_requests").insert({
    user_id: params.userId,
    email: params.email,
    reason: params.reason,
  });
  if (error) {
    return { error: `Failed logging deletion: ${error.message}` };
  }
  return {};
}
