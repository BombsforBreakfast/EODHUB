import type { QueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  postConnectionAction,
  RUMINT_USER_ID,
  type KnowStatus,
} from "../userDirectory";
import { queryKeys } from "../queryKeys";

export const DISCOVER_PROFILES_STALE_MS = 5 * 60_000;

const DISCOVER_POOL_MAX = 50;
const DISCOVER_FETCH_LIMIT = 500;

export type DiscoverProfile = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  service: string | null;
  status: string | null;
  professional_tags: string[] | null;
  unit_history_tags: string[] | null;
  affinityScore: number;
  affinityReasons: string[];
  knowStatus: KnowStatus;
};

type DiscoverAffinitySource = {
  service: string | null;
  status: string | null;
  professional_tags: string[] | null;
  unit_history_tags: string[] | null;
};

function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function isConnV2MissingColumnError(error: unknown): boolean {
  const msg = (error as { message?: string } | null)?.message?.toLowerCase?.() ?? "";
  return msg.includes("column") && (msg.includes("status") || msg.includes("worked_with"));
}

function normalizeTagArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const deduped = new Set<string>();
  const out: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string") continue;
    const cleaned = raw.replace(/\s+/g, " ").trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (deduped.has(key)) continue;
    deduped.add(key);
    out.push(cleaned);
  }
  return out;
}

function toComparableTagSet(tags: string[] | null | undefined): Set<string> {
  return new Set(normalizeTagArray(tags).map((tag) => tag.toLowerCase()));
}

function countSharedTagOverlap(base: Set<string>, tags: string[] | null | undefined): number {
  if (base.size === 0) return 0;
  let count = 0;
  for (const tag of normalizeTagArray(tags)) {
    if (base.has(tag.toLowerCase())) count += 1;
  }
  return count;
}

function scoreDiscoverProfileAffinity(
  candidate: Pick<DiscoverProfile, "service" | "status" | "professional_tags" | "unit_history_tags">,
  source: DiscoverAffinitySource,
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  const sharedProfessionalTags = countSharedTagOverlap(
    toComparableTagSet(source.professional_tags),
    candidate.professional_tags,
  );
  const sharedUnitHistoryTags = countSharedTagOverlap(
    toComparableTagSet(source.unit_history_tags),
    candidate.unit_history_tags,
  );

  if (sharedProfessionalTags > 0) {
    score += Math.min(sharedProfessionalTags * 6, 18);
    reasons.push(`Shared professional background (${sharedProfessionalTags})`);
  }
  if (sharedUnitHistoryTags > 0) {
    score += Math.min(sharedUnitHistoryTags * 8, 24);
    reasons.push(`Shared unit history (${sharedUnitHistoryTags})`);
  }
  if (source.service && candidate.service && source.service === candidate.service) {
    score += 6;
    reasons.push(`Same service branch (${source.service})`);
  }
  if (source.status && candidate.status && source.status === candidate.status) {
    score += 2;
    reasons.push(`Similar status (${source.status})`);
  }

  return { score, reasons };
}

function buildDiscoverRelationshipMap(
  connections: { requester_user_id: string; target_user_id: string; status: string }[],
  viewerId: string,
): Map<string, KnowStatus> {
  const relationshipByUserId = new Map<string, KnowStatus>();
  for (const c of connections) {
    const otherId = c.requester_user_id === viewerId ? c.target_user_id : c.requester_user_id;
    if (c.status === "accepted") relationshipByUserId.set(otherId, "accepted");
    else if (c.status === "pending") {
      relationshipByUserId.set(
        otherId,
        c.requester_user_id === viewerId ? "pending_outgoing" : "pending_incoming",
      );
    } else if (c.status === "denied") {
      relationshipByUserId.set(otherId, "accepted");
    }
  }
  return relationshipByUserId;
}

export function patchDiscoverProfilesKnow(
  rows: DiscoverProfile[] | undefined,
  targetUserId: string,
  knowStatus: KnowStatus,
): DiscoverProfile[] | undefined {
  if (!rows) return rows;
  if (knowStatus === "accepted") {
    return rows.filter((profile) => profile.user_id !== targetUserId);
  }
  return rows.map((profile) =>
    profile.user_id === targetUserId ? { ...profile, knowStatus } : profile,
  );
}

export function optimisticDiscoverKnowStatus(current: KnowStatus): KnowStatus {
  return current === "pending_incoming" ? "accepted" : "pending_outgoing";
}

export async function fetchDiscoverProfiles(
  supabase: SupabaseClient,
  viewerId: string,
): Promise<DiscoverProfile[]> {
  const [{ data: profileRows, error: profileError }, { data: viewerProfile, error: viewerError }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select(
          "user_id, first_name, last_name, photo_url, service, status, professional_tags, unit_history_tags",
        )
        .eq("verification_status", "verified")
        .neq("user_id", viewerId)
        .neq("user_id", RUMINT_USER_ID)
        .not("first_name", "is", null)
        .not("privacy_discoverable", "is", false)
        .limit(DISCOVER_FETCH_LIMIT),
      supabase
        .from("profiles")
        .select("service, status, professional_tags, unit_history_tags")
        .eq("user_id", viewerId)
        .maybeSingle(),
    ]);

  if (profileError) throw profileError;
  if (viewerError) throw viewerError;
  if (!profileRows || profileRows.length === 0) return [];

  const affinitySource: DiscoverAffinitySource = {
    service: viewerProfile?.service ?? null,
    status: viewerProfile?.status ?? null,
    professional_tags: viewerProfile?.professional_tags ?? null,
    unit_history_tags: viewerProfile?.unit_history_tags ?? null,
  };

  const { data: connsV2, error: connsV2Error } = await supabase
    .from("profile_connections")
    .select("requester_user_id, target_user_id, status")
    .or(`requester_user_id.eq.${viewerId},target_user_id.eq.${viewerId}`);

  let relationshipByUserId = new Map<string, KnowStatus>();

  if (connsV2Error && isConnV2MissingColumnError(connsV2Error)) {
    const { data: connsLegacy } = await supabase
      .from("profile_connections")
      .select("requester_user_id, target_user_id, connection_type")
      .eq("requester_user_id", viewerId);

    for (const c of (connsLegacy ?? []) as { target_user_id: string }[]) {
      relationshipByUserId.set(c.target_user_id, "accepted");
    }
  } else if (connsV2Error) {
    throw connsV2Error;
  } else {
    relationshipByUserId = buildDiscoverRelationshipMap(
      (connsV2 ?? []) as { requester_user_id: string; target_user_id: string; status: string }[],
      viewerId,
    );
  }

  const basePool = profileRows
    .filter((p) => relationshipByUserId.get(p.user_id) !== "accepted")
    .map((p) => ({
      ...p,
      affinityScore: 0,
      affinityReasons: [] as string[],
      knowStatus: relationshipByUserId.get(p.user_id) ?? "none",
    })) as DiscoverProfile[];

  let pool = basePool
    .map((candidate) => {
      const scored = scoreDiscoverProfileAffinity(candidate, affinitySource);
      return { ...candidate, affinityScore: scored.score, affinityReasons: scored.reasons };
    })
    .sort((a, b) => b.affinityScore - a.affinityScore || a.user_id.localeCompare(b.user_id));

  const shuffleSource = pool.slice(0, Math.min(pool.length, 100));
  return shuffleArray(shuffleSource).slice(0, DISCOVER_POOL_MAX);
}

export async function runDiscoverKnowAction({
  queryClient,
  supabase,
  viewerId,
  targetUserId,
  currentKnowStatus,
}: {
  queryClient: QueryClient;
  supabase: SupabaseClient;
  viewerId: string;
  targetUserId: string;
  currentKnowStatus: KnowStatus;
}): Promise<{ state?: KnowStatus }> {
  const queryKey = queryKeys.discoverProfiles(viewerId);
  const previousRows = queryClient.getQueryData<DiscoverProfile[]>(queryKey);
  const optimisticStatus = optimisticDiscoverKnowStatus(currentKnowStatus);

  queryClient.setQueryData<DiscoverProfile[] | undefined>(queryKey, (rows) =>
    patchDiscoverProfilesKnow(rows, targetUserId, optimisticStatus),
  );

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error("Please sign in again to send a Know request.");
    }

    const result = await postConnectionAction("know", targetUserId, session.access_token);
    if (!result.ok) {
      throw new Error(result.error || "Failed to send Know request. Please try again.");
    }

    const nextStatus = (result.state ?? optimisticStatus) as KnowStatus;
    queryClient.setQueryData<DiscoverProfile[] | undefined>(queryKey, (rows) =>
      patchDiscoverProfilesKnow(rows, targetUserId, nextStatus),
    );

    return { state: nextStatus };
  } catch (error) {
    queryClient.setQueryData(queryKey, previousRows);
    throw error;
  } finally {
    void queryClient.invalidateQueries({ queryKey });
    void queryClient.invalidateQueries({ queryKey: queryKeys.userDirectory(viewerId) });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.profileConnections(viewerId, targetUserId),
    });
  }
}
