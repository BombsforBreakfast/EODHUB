/** Client-safe group access helpers (pass isFounder from /api/me/is-founder). */

export function isEffectiveApprovedMember(
  membership: { status: string } | null | undefined,
  isFounder: boolean,
): boolean {
  return isFounder || membership?.status === "approved";
}

export function canViewUnitWallClient(
  visibility: "public" | "private" | undefined,
  membership: { status: string } | null | undefined,
  isFounder: boolean,
): boolean {
  if (isFounder) return true;
  if (membership?.status === "approved") return true;
  return visibility === "public";
}

export function isEffectiveUnitGod(
  membership: { role: string; status: string } | null | undefined,
  isFounder: boolean,
): boolean {
  if (isFounder) return true;
  return (
    membership?.status === "approved" &&
    (membership.role === "owner" || membership.role === "admin")
  );
}
