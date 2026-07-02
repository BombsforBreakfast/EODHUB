import type { SupabaseClient } from "@supabase/supabase-js";
import { isFounderUserId } from "./server/founderAccess";

export type UnitVisibility = "public" | "private";

export const UNIT_CORE_SELECT =
  "id, name, slug, description, cover_photo_url, type, created_by, created_at, visibility";

export function normalizeUnitVisibility(value: unknown): UnitVisibility {
  return value === "public" ? "public" : "private";
}

/** Founder account bypasses private-group invite walls (FOUNDER_USER_ID). */
export function hasFounderUnitGodAccess(userId: string | null | undefined): boolean {
  return isFounderUserId(userId);
}

export function canViewUnitWall(
  visibility: UnitVisibility,
  membership: { status: string } | null | undefined,
  userId?: string | null,
): boolean {
  if (hasFounderUnitGodAccess(userId)) return true;
  if (membership?.status === "approved") return true;
  return visibility === "public";
}

type UnitMembership = {
  role: string;
  status: string;
};

export type UnitAccessResult =
  | { ok: true; membership: UnitMembership | null; isFounderGod: boolean }
  | { ok: false };

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

export function isApprovedUnitMember(
  membership: UnitMembership | null | undefined,
  userId?: string | null,
): boolean {
  return hasFounderUnitGodAccess(userId) || membership?.status === "approved";
}

export function isUnitAdmin(
  membership: UnitMembership | null | undefined,
  userId?: string | null,
): boolean {
  if (hasFounderUnitGodAccess(userId)) return true;
  return (
    membership?.status === "approved" &&
    ["owner", "admin"].includes(membership.role)
  );
}

export async function assertApprovedUnitMember(
  db: SupabaseClient,
  unitId: string,
  userId: string,
): Promise<UnitAccessResult> {
  if (hasFounderUnitGodAccess(userId)) {
    return { ok: true, membership: null, isFounderGod: true };
  }
  const membership = await fetchUnitMembership(db, unitId, userId);
  if (membership?.status === "approved") {
    return { ok: true, membership, isFounderGod: false };
  }
  return { ok: false };
}

export async function assertUnitAdmin(
  db: SupabaseClient,
  unitId: string,
  userId: string,
): Promise<UnitAccessResult> {
  if (hasFounderUnitGodAccess(userId)) {
    return { ok: true, membership: null, isFounderGod: true };
  }
  const membership = await fetchUnitMembership(db, unitId, userId);
  if (
    membership?.status === "approved" &&
    ["owner", "admin"].includes(membership.role)
  ) {
    return { ok: true, membership, isFounderGod: false };
  }
  return { ok: false };
}

export async function canUserViewUnitWall(
  db: SupabaseClient,
  unit: { id: string; visibility?: unknown },
  userId: string,
): Promise<{ allowed: boolean; membership: UnitMembership | null }> {
  const membership = await fetchUnitMembership(db, unit.id, userId);
  const visibility = normalizeUnitVisibility(unit.visibility);
  return {
    allowed: canViewUnitWall(visibility, membership, userId),
    membership,
  };
}
