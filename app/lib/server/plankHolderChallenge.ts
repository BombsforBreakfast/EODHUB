import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

export const PLANK_HOLDER_CAP = 50;

export type PlankHolderTaskKey = "profilePhoto" | "bio" | "contribution" | "connection" | "invite";

export type PlankHolderProgress = Record<PlankHolderTaskKey, boolean> & {
  completedCount: number;
  total: 5;
};

export type PlankHolderApiResponse = {
  ok: true;
  eligible: boolean;
  progress: PlankHolderProgress;
  awarded: boolean;
  plankHolderNumber?: number;
  claimedCount: number;
  remainingSpots: number;
  alreadyClosed: boolean;
  seenModal: boolean;
};

type TaskStatusRow = {
  profile_photo?: boolean | null;
  bio?: boolean | null;
  contribution?: boolean | null;
  connection?: boolean | null;
  invite?: boolean | null;
  completed_count?: number | null;
  total?: number | null;
};

type AwardRow = {
  awarded?: boolean | null;
  plank_holder_number?: number | null;
  remaining_spots?: number | null;
  already_closed?: boolean | null;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export function createPlankHolderAdminClient(): SupabaseClient {
  return createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );
}

function createUserClient(token: string): SupabaseClient {
  return createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
}

export async function requirePlankHolderUser(req: NextRequest): Promise<
  | { user: User; admin: SupabaseClient }
  | NextResponse
> {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const userClient = createUserClient(token);
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return {
    user: data.user,
    admin: createPlankHolderAdminClient(),
  };
}

function normalizeTaskStatus(row: TaskStatusRow | null | undefined): PlankHolderProgress {
  const progress = {
    profilePhoto: !!row?.profile_photo,
    bio: !!row?.bio,
    contribution: !!row?.contribution,
    connection: !!row?.connection,
    invite: !!row?.invite,
  };

  return {
    ...progress,
    completedCount:
      row?.completed_count ??
      Object.values(progress).filter(Boolean).length,
    total: 5,
  };
}

function firstRow<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function getPlankHolderGlobalStats(admin: SupabaseClient): Promise<{
  claimedCount: number;
  remainingSpots: number;
  alreadyClosed: boolean;
}> {
  const { count, error } = await admin
    .from("profiles")
    .select("user_id", { count: "exact", head: true })
    .eq("plank_holder_awarded", true);

  if (error) throw error;

  const claimedCount = count ?? 0;
  return {
    claimedCount,
    remainingSpots: Math.max(PLANK_HOLDER_CAP - claimedCount, 0),
    alreadyClosed: claimedCount >= PLANK_HOLDER_CAP,
  };
}

export async function evaluatePlankHolderProgress(
  admin: SupabaseClient,
  userId: string,
): Promise<PlankHolderProgress> {
  const { data, error } = await admin.rpc("plank_holder_task_status", { p_user_id: userId });
  if (error) throw error;
  return normalizeTaskStatus(firstRow(data as TaskStatusRow | TaskStatusRow[] | null));
}

export async function awardPlankHolderIfEligible(
  admin: SupabaseClient,
  userId: string,
): Promise<{
  awarded: boolean;
  plankHolderNumber?: number;
  remainingSpots: number;
  alreadyClosed: boolean;
}> {
  const { data, error } = await admin.rpc("award_plank_holder_if_eligible", { p_user_id: userId });
  if (error) throw error;

  const row = firstRow(data as AwardRow | AwardRow[] | null);
  return {
    awarded: !!row?.awarded,
    plankHolderNumber: row?.plank_holder_number ?? undefined,
    remainingSpots: row?.remaining_spots ?? 0,
    alreadyClosed: !!row?.already_closed,
  };
}

export async function markPlankHolderInviteCompleted(
  admin: SupabaseClient,
  userId: string,
): Promise<void> {
  const { error } = await admin
    .from("profiles")
    .update({ invite_teammate_completed_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("invite_teammate_completed_at", null);

  if (error) throw error;
}

export async function markPlankHolderModalSeen(
  admin: SupabaseClient,
  userId: string,
): Promise<void> {
  const { error } = await admin
    .from("profiles")
    .update({ plank_holder_seen_modal: true })
    .eq("user_id", userId);

  if (error) throw error;
}

export async function getPlankHolderProfileState(
  admin: SupabaseClient,
  userId: string,
): Promise<{
  awarded: boolean;
  plankHolderNumber?: number;
  seenModal: boolean;
  isPureAdmin: boolean;
}> {
  const { data, error } = await admin
    .from("profiles")
    .select("plank_holder_awarded, plank_holder_number, plank_holder_seen_modal, is_pure_admin")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;

  return {
    awarded: !!data?.plank_holder_awarded,
    plankHolderNumber: data?.plank_holder_number ?? undefined,
    seenModal: !!data?.plank_holder_seen_modal,
    isPureAdmin: !!data?.is_pure_admin,
  };
}

export async function buildPlankHolderResponse(
  admin: SupabaseClient,
  userId: string,
): Promise<PlankHolderApiResponse> {
  const profile = await getPlankHolderProfileState(admin, userId);
  const progress = await evaluatePlankHolderProgress(admin, userId);
  const award = profile.isPureAdmin
    ? { awarded: profile.awarded, plankHolderNumber: profile.plankHolderNumber, remainingSpots: 0, alreadyClosed: false }
    : await awardPlankHolderIfEligible(admin, userId);
  const stats = await getPlankHolderGlobalStats(admin);

  const awarded = award.awarded || profile.awarded;
  return {
    ok: true,
    eligible: !profile.isPureAdmin,
    progress,
    awarded,
    plankHolderNumber: award.plankHolderNumber ?? profile.plankHolderNumber,
    claimedCount: stats.claimedCount,
    remainingSpots: award.remainingSpots,
    alreadyClosed: award.alreadyClosed || stats.alreadyClosed,
    seenModal: profile.seenModal,
  };
}
