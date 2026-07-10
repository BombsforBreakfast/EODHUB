import type { SupabaseClient, User } from "@supabase/supabase-js";

type ClaimRow = {
  status: string;
  primary_user_id: string | null;
  primary_email: string | null;
  error_message: string | null;
};

export type ClaimPendingOAuthLoginAliasResult =
  | { status: "unchanged" }
  | { status: "claimed"; primaryUser: User }
  | { status: "error"; message: string };

/** Move a fresh Google OAuth sign-in onto a pre-registered alias account. */
export async function claimPendingOAuthLoginAlias(
  adminClient: SupabaseClient,
  oauthUserId: string,
): Promise<ClaimPendingOAuthLoginAliasResult> {
  const { data, error } = await adminClient.rpc("claim_auth_login_email_alias", {
    p_oauth_user_id: oauthUserId,
  });

  if (error) {
    return { status: "error", message: error.message };
  }

  const row = (Array.isArray(data) ? data[0] : data) as ClaimRow | null;
  if (!row) {
    return { status: "unchanged" };
  }

  if (row.status === "error") {
    return { status: "error", message: row.error_message ?? "Alias claim failed." };
  }

  if (row.status !== "claimed" || !row.primary_user_id) {
    return { status: "unchanged" };
  }

  const { data: primaryData, error: primaryError } = await adminClient.auth.admin.getUserById(
    row.primary_user_id,
  );
  if (primaryError || !primaryData.user) {
    return {
      status: "error",
      message: primaryError?.message ?? "Primary account could not be loaded after alias claim.",
    };
  }

  return { status: "claimed", primaryUser: primaryData.user };
}

/** Issue a server-side session for the canonical account after alias claim. */
export async function establishMagicLinkSessionForEmail(
  supabase: SupabaseClient,
  adminClient: SupabaseClient,
  email: string,
): Promise<{ ok: true; user: User } | { ok: false; message: string }> {
  const normalizedEmail = email.trim().toLowerCase();
  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: "magiclink",
    email: normalizedEmail,
  });

  if (linkError || !linkData.properties?.hashed_token) {
    return {
      ok: false,
      message: linkError?.message ?? "Could not prepare canonical account session.",
    };
  }

  const { data: sessionData, error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "magiclink",
  });

  if (verifyError || !sessionData.user) {
    return {
      ok: false,
      message: verifyError?.message ?? "Could not establish canonical account session.",
    };
  }

  return { ok: true, user: sessionData.user };
}

/**
 * If this OAuth session belongs to a pre-registered alias email, merge it onto
 * the canonical account and swap the server session to that user.
 */
export async function resolveClaimedOAuthSessionUser(
  supabase: SupabaseClient,
  adminClient: SupabaseClient,
  oauthUser: User,
): Promise<{ user: User; claimError: string | null }> {
  const claim = await claimPendingOAuthLoginAlias(adminClient, oauthUser.id);
  if (claim.status === "unchanged") {
    return { user: oauthUser, claimError: null };
  }

  if (claim.status === "error") {
    return { user: oauthUser, claimError: claim.message };
  }

  const primaryEmail = claim.primaryUser.email?.trim().toLowerCase();
  if (!primaryEmail) {
    return { user: oauthUser, claimError: "Primary account is missing an email address." };
  }

  const session = await establishMagicLinkSessionForEmail(supabase, adminClient, primaryEmail);
  if (!session.ok) {
    return { user: oauthUser, claimError: session.message };
  }

  return { user: session.user, claimError: null };
}
