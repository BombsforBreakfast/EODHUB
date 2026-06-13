import type { QueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  attachKnowStatus,
  buildKnowStatusMap,
  postConnectionAction,
  RUMINT_USER_ID,
  type ConnectionAction,
  type KnowStatus,
  type UserDirectoryMember,
  type UserDirectoryProfileRow,
} from "../userDirectory";
import { queryKeys } from "../queryKeys";
import { fetchBlockedUserIds, filterBlockedRows } from "../userBlocks";

export const USER_DIRECTORY_STALE_MS = 5 * 60_000;

const PROFILE_COLUMNS =
  "user_id, first_name, last_name, display_name, photo_url, service, skill_badge";

function optimisticKnowStatus(action: ConnectionAction, current: KnowStatus): KnowStatus {
  if (action === "know") return current === "pending_incoming" ? "accepted" : "pending_outgoing";
  if (action === "confirm") return "accepted";
  if (action === "deny" || action === "cancel") return "none";
  return current;
}

function patchDirectoryMember(
  rows: UserDirectoryMember[] | undefined,
  targetUserId: string,
  knowStatus: KnowStatus,
): UserDirectoryMember[] | undefined {
  if (!rows) return rows;
  return rows.map((member) =>
    member.user_id === targetUserId ? { ...member, knowStatus } : member,
  );
}

export async function fetchUserDirectoryMembers(
  supabase: SupabaseClient,
  viewerId: string | null,
): Promise<UserDirectoryMember[]> {
  let profileQuery = supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("verification_status", "verified")
    .is("account_deleted_at", null)
    .neq("user_id", RUMINT_USER_ID)
    .not("first_name", "is", null)
    .order("last_name")
    .order("first_name")
    .limit(500);

  if (viewerId) {
    profileQuery = profileQuery.neq("user_id", viewerId);
  }

  const { data: profileRows, error: profileError } = await profileQuery;
  if (profileError) throw profileError;

  const blockedUserIds = await fetchBlockedUserIds(supabase, viewerId);
  const profiles = filterBlockedRows(
    (profileRows ?? []) as UserDirectoryProfileRow[],
    blockedUserIds,
    (profile) => profile.user_id,
  );
  if (!viewerId) return attachKnowStatus(profiles, new Map());

  const { data: connRows, error: connError } = await supabase
    .from("profile_connections")
    .select("requester_user_id, target_user_id, status")
    .or(`requester_user_id.eq.${viewerId},target_user_id.eq.${viewerId}`);

  if (connError) throw connError;

  const knowStatusByUserId = buildKnowStatusMap(
    (connRows ?? []) as { requester_user_id: string; target_user_id: string; status: string }[],
    viewerId,
  );
  return attachKnowStatus(profiles, knowStatusByUserId);
}

export async function runConnectionAction({
  queryClient,
  supabase,
  viewerId,
  targetUserId,
  action,
}: {
  queryClient: QueryClient;
  supabase: SupabaseClient;
  viewerId: string;
  targetUserId: string;
  action: ConnectionAction;
}): Promise<{ state?: KnowStatus }> {
  const queryKey = queryKeys.userDirectory(viewerId);
  const previousRows = queryClient.getQueryData<UserDirectoryMember[]>(queryKey);
  const currentStatus =
    previousRows?.find((member) => member.user_id === targetUserId)?.knowStatus ?? "none";
  const nextStatus = optimisticKnowStatus(action, currentStatus);

  queryClient.setQueryData<UserDirectoryMember[] | undefined>(
    queryKey,
    (rows) => patchDirectoryMember(rows, targetUserId, nextStatus),
  );

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error("Please sign in again to continue.");
    }

    const result = await postConnectionAction(action, targetUserId, session.access_token);
    if (!result.ok) {
      throw new Error(result.error || "Action failed. Please try again.");
    }

    if (result.state) {
      queryClient.setQueryData<UserDirectoryMember[] | undefined>(
        queryKey,
        (rows) => patchDirectoryMember(rows, targetUserId, result.state as KnowStatus),
      );
    }

    return { state: result.state };
  } catch (error) {
    queryClient.setQueryData(queryKey, previousRows);
    throw error;
  } finally {
    void queryClient.invalidateQueries({ queryKey });
    void queryClient.invalidateQueries({ queryKey: queryKeys.discoverProfiles(viewerId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.profileConnections(viewerId, targetUserId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.profileConnections(viewerId, viewerId) });
  }
}
