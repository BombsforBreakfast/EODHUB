import type { SupabaseClient } from "@supabase/supabase-js";
import { devAuthLog } from "@/app/lib/auth/signupErrors";
import {
  authMetadataDisplayName,
  parseSignupFullName,
} from "@/app/lib/profileCompleteness";

/**
 * Ensure a profiles row exists for a newly created auth user.
 * Onboarding updates this row; without it, onboarding .update() is a no-op
 * and the user is invisible in admin.
 */
export async function ensureProfileStubForUser(
  admin: SupabaseClient,
  userId: string,
  email: string,
): Promise<{ ok: boolean; error: string | null }> {
  const { data: existing, error: readErr } = await admin
    .from("profiles")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (readErr) {
    devAuthLog("ensure-profile-stub", { step: "read_failed", userId, error: readErr.message });
    return { ok: false, error: readErr.message };
  }

  if (existing) {
    return { ok: true, error: null };
  }

  const { data: authData } = await admin.auth.admin.getUserById(userId);
  const authName = authMetadataDisplayName(authData?.user?.user_metadata ?? null);
  const parsedName = authName ? parseSignupFullName(authName) : null;

  const { error: insertErr } = await admin.from("profiles").insert({
    user_id: userId,
    email,
    ...(parsedName
      ? { first_name: parsedName.firstName, last_name: parsedName.lastName }
      : {}),
  });

  if (insertErr) {
    devAuthLog("ensure-profile-stub", { step: "insert_failed", userId, error: insertErr.message });
    return { ok: false, error: insertErr.message };
  }

  devAuthLog("ensure-profile-stub", { step: "inserted", userId });
  return { ok: true, error: null };
}
