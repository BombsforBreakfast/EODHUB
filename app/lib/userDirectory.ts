import { isMarinesService } from "./serviceBranchVisual";

export const RUMINT_USER_ID = "ffffffff-ffff-4fff-afff-52554d494e54";

export const PROFILE_SERVICE_OPTIONS = [
  "Army",
  "Navy",
  "Marines",
  "Air Force",
  "Civil Service",
  "Federal",
  "Civilian Bomb Tech",
] as const;

export type ProfileServiceOption = (typeof PROFILE_SERVICE_OPTIONS)[number];

export type KnowStatus = "none" | "pending_outgoing" | "pending_incoming" | "accepted";

export type UserDirectoryMember = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  photo_url: string | null;
  service: string | null;
  skill_badge: string | null;
  knowStatus: KnowStatus;
};

export type UserDirectoryProfileRow = Omit<UserDirectoryMember, "knowStatus">;

type ConnectionRow = {
  requester_user_id: string;
  target_user_id: string;
  status: string;
};

export function memberDisplayName(profile: Pick<UserDirectoryProfileRow, "display_name" | "first_name" | "last_name">): string {
  const fromParts = `${profile.first_name || ""} ${profile.last_name || ""}`.trim();
  return profile.display_name?.trim() || fromParts || "Member";
}

export function memberInitial(profile: Pick<UserDirectoryProfileRow, "display_name" | "first_name" | "last_name">): string {
  const name = memberDisplayName(profile);
  return (name[0] || "M").toUpperCase();
}

export function memberMatchesKeyword(
  profile: Pick<UserDirectoryProfileRow, "first_name" | "last_name" | "display_name" | "service">,
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    profile.first_name,
    profile.last_name,
    profile.display_name,
    profile.service,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

export function memberMatchesService(
  profile: Pick<UserDirectoryProfileRow, "service">,
  serviceFilter: string,
): boolean {
  const selected = serviceFilter.trim();
  if (!selected) return true;
  const memberService = profile.service?.trim() ?? "";
  if (!memberService) return false;
  if (selected === "Marines") return isMarinesService(memberService);
  return memberService === selected;
}

export function memberMatchesFilters(
  profile: Pick<UserDirectoryProfileRow, "first_name" | "last_name" | "display_name" | "service">,
  keyword: string,
  serviceFilter: string,
): boolean {
  return memberMatchesKeyword(profile, keyword) && memberMatchesService(profile, serviceFilter);
}

export function buildKnowStatusMap(
  connections: ConnectionRow[],
  viewerId: string,
): Map<string, KnowStatus> {
  const map = new Map<string, KnowStatus>();
  for (const c of connections) {
    const otherId = c.requester_user_id === viewerId ? c.target_user_id : c.requester_user_id;
    if (c.status === "accepted") {
      map.set(otherId, "accepted");
    } else if (c.status === "pending") {
      map.set(
        otherId,
        c.requester_user_id === viewerId ? "pending_outgoing" : "pending_incoming",
      );
    } else if (c.status === "denied") {
      map.set(otherId, "none");
    }
  }
  return map;
}

export function compareMembersAlphabetically(
  a: Pick<UserDirectoryProfileRow, "display_name" | "first_name" | "last_name">,
  b: Pick<UserDirectoryProfileRow, "display_name" | "first_name" | "last_name">,
): number {
  return memberDisplayName(a).localeCompare(memberDisplayName(b), undefined, { sensitivity: "base" });
}

export function attachKnowStatus(
  profiles: UserDirectoryProfileRow[],
  knowStatusByUserId: Map<string, KnowStatus>,
): UserDirectoryMember[] {
  return profiles
    .map((p) => ({
      ...p,
      knowStatus: knowStatusByUserId.get(p.user_id) ?? "none",
    }))
    .sort(compareMembersAlphabetically);
}

export type ConnectionAction = "know" | "confirm" | "deny" | "cancel";

export async function postConnectionAction(
  action: ConnectionAction,
  targetUserId: string,
  accessToken: string,
): Promise<{ ok: boolean; state?: KnowStatus; error?: string }> {
  const res = await fetch("/api/profile-connections/action", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ action, targetUserId }),
  });
  const result = (await res.json().catch(() => null)) as
    | { ok?: boolean; state?: KnowStatus; error?: string }
    | null;
  if (!res.ok || result?.ok !== true) {
    return { ok: false, error: result?.error || "Request failed" };
  }
  return { ok: true, state: result.state };
}
