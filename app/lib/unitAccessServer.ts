import type { SupabaseClient } from "@supabase/supabase-js";

export type UnitVisibility = "public" | "private";

export const UNIT_CORE_SELECT =
  "id, name, slug, description, cover_photo_url, type, created_by, created_at, visibility";

export function normalizeUnitVisibility(value: unknown): UnitVisibility {
  return value === "public" ? "public" : "private";
}

export function canViewUnitWall(
  visibility: UnitVisibility,
  membership: { status: string } | null | undefined,
): boolean {
  if (membership?.status === "approved") return true;
  return visibility === "public";
}

type UnitMembership = {
  role: string;
  status: string;
};

export async function fetchUnitMembership(
  db: SupabaseClient,
  unitId: string,
  userId: string,
): Promise<UnitMembership | null> {
  const { data } = await db
    .from("unit_members")
    .select("role, status")
    .eq("unit_id", unitId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as UnitMembership | null) ?? null;
}

export async function canUserViewUnitWall(
  db: SupabaseClient,
  unit: { id: string; visibility?: unknown },
  userId: string,
): Promise<{ allowed: boolean; membership: UnitMembership | null }> {
  const membership = await fetchUnitMembership(db, unit.id, userId);
  const visibility = normalizeUnitVisibility(unit.visibility);
  return {
    allowed: canViewUnitWall(visibility, membership),
    membership,
  };
}
