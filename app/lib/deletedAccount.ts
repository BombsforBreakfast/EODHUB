export const DELETED_MEMBER_LABEL = "Former member";

export type ProfileNameFields = {
  account_deleted_at?: string | null;
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

export function isDeletedProfile(profile: { account_deleted_at?: string | null } | null | undefined): boolean {
  return profile?.account_deleted_at != null;
}

/** Display name for feed/comments; deleted accounts show a neutral label. */
export function profileDisplayName(profile: ProfileNameFields | null | undefined, fallback = "Member"): string {
  if (!profile) return fallback;
  if (isDeletedProfile(profile)) return DELETED_MEMBER_LABEL;
  return (
    profile.display_name?.trim() ||
    `${profile.first_name || ""} ${profile.last_name || ""}`.trim() ||
    fallback
  );
}
