import type { SupabaseClient } from "@supabase/supabase-js";

export type ReferrerProfile = {
  user_id: string;
  is_approved: boolean | null;
  verification_status: string | null;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
};

export function isEligibleReferrer(profile: Pick<ReferrerProfile, "is_approved" | "verification_status">): boolean {
  return profile.is_approved === true || profile.verification_status === "verified";
}

export function referrerDisplayName(profile: Pick<ReferrerProfile, "display_name" | "first_name" | "last_name">): string {
  return (
    profile.display_name?.trim() ||
    `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() ||
    "Member"
  );
}

export async function lookupReferrerByCode(
  adminClient: SupabaseClient,
  referralCode: string,
): Promise<ReferrerProfile | null> {
  const code = referralCode.trim();
  if (!code) return null;

  const { data: referrer } = await adminClient
    .from("profiles")
    .select("user_id, is_approved, verification_status, first_name, last_name, display_name")
    .eq("referral_code", code)
    .maybeSingle();

  if (!referrer || !isEligibleReferrer(referrer)) return null;
  return referrer as ReferrerProfile;
}
