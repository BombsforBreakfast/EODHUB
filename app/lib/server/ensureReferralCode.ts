import type { SupabaseClient } from "@supabase/supabase-js";

const CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function makeReferralCode(length = 8): string {
  let code = "";
  const randomValues = new Uint32Array(length);
  crypto.getRandomValues(randomValues);

  for (let i = 0; i < length; i++) {
    code += CHARS[randomValues[i] % CHARS.length];
  }
  return code;
}

function isSystemReferralExemptEmail(email: string | null | undefined): boolean {
  const normalized = email?.trim().toLowerCase() ?? "";
  return normalized.includes("@system.") || normalized.endsWith(".invalid");
}

/** Assign a unique referral_code when missing. Returns the active code or null for exempt system rows. */
export async function ensureReferralCode(
  adminClient: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("referral_code, email")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError || !profile) {
    throw new Error(profileError?.message ?? "Profile not found");
  }

  const existing = profile.referral_code?.trim();
  if (existing) return existing;

  if (isSystemReferralExemptEmail(profile.email)) return null;

  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = makeReferralCode();
    const { data: collision } = await adminClient
      .from("profiles")
      .select("user_id")
      .eq("referral_code", candidate)
      .maybeSingle();

    if (collision) continue;

    const { data: updated, error: updateError } = await adminClient
      .from("profiles")
      .update({ referral_code: candidate })
      .eq("user_id", userId)
      .or("referral_code.is.null,referral_code.eq.")
      .select("referral_code")
      .maybeSingle();

    if (updateError) {
      if (updateError.code === "23505") continue;
      throw new Error(updateError.message);
    }

    if (updated?.referral_code?.trim()) {
      return updated.referral_code.trim();
    }

    const { data: refreshed } = await adminClient
      .from("profiles")
      .select("referral_code")
      .eq("user_id", userId)
      .maybeSingle();

    const refreshedCode = refreshed?.referral_code?.trim();
    if (refreshedCode) return refreshedCode;
  }

  throw new Error("Could not generate unique referral code");
}
