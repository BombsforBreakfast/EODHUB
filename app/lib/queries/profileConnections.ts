import type { QueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type KnowStatus } from "../userDirectory";
import { queryKeys } from "../queryKeys";

export const PROFILE_CONNECTIONS_STALE_MS = 5 * 60_000;

export type KnownPreviewUser = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  service?: string | null;
  worked_with: boolean;
  viewer_worked_with?: boolean;
};

export type ProfileConnectionRelation = {
  id: string;
  status: "pending" | "accepted" | "denied";
  knowStatus: KnowStatus;
  workedWith: boolean;
  viewerWorkedWith: boolean;
  requesterUserId?: string;
  targetUserId?: string;
};

export type ProfileConnectionsData = {
  knowCount: number;
  knownPreviewUsers: KnownPreviewUser[];
  connections: KnownPreviewUser[];
  relation: ProfileConnectionRelation | null;
};

export type ProfileConnectionView = {
  knowCount: number;
  knownPreviewUsers: KnownPreviewUser[];
  currentUserKnowStatus: KnowStatus;
  currentUserWorkedWith: boolean;
  activeConnectionId: string | null;
  isMutualConnection: boolean;
};

export type ProfileConnectionAction = "know" | "confirm" | "deny" | "cancel" | "worked_with";

type ConnectionActionResponse = {
  ok: boolean;
  state?: KnowStatus | "denied";
  connectionId?: string;
  workedWith?: boolean;
  error?: string;
};

export function deriveProfileConnectionView(
  data: ProfileConnectionsData | undefined,
  viewerId: string | null,
  targetUserId: string | null,
): ProfileConnectionView {
  const empty: ProfileConnectionView = {
    knowCount: 0,
    knownPreviewUsers: [],
    currentUserKnowStatus: "none",
    currentUserWorkedWith: false,
    activeConnectionId: null,
    isMutualConnection: false,
  };
  if (!data) return empty;

  const base = {
    knowCount: data.knowCount,
    knownPreviewUsers: data.knownPreviewUsers ?? [],
    currentUserKnowStatus: "none" as KnowStatus,
    currentUserWorkedWith: false,
    activeConnectionId: null as string | null,
    isMutualConnection: false,
  };

  if (!viewerId || !targetUserId || viewerId === targetUserId || !data.relation) {
    return base;
  }

  if (data.relation.status === "denied") {
    return base;
  }

  return {
    ...base,
    activeConnectionId: data.relation.id,
    currentUserWorkedWith: data.relation.viewerWorkedWith,
    currentUserKnowStatus: data.relation.knowStatus,
    isMutualConnection: data.relation.knowStatus === "accepted",
  };
}

async function fetchProfileConnectionsLegacy(
  supabase: SupabaseClient,
  targetUserId: string,
  viewerId: string | null,
): Promise<ProfileConnectionsData> {
  const { data: outgoing, error } = await supabase
    .from("profile_connections")
    .select("requester_user_id, target_user_id, connection_type")
    .eq("requester_user_id", targetUserId);

  if (error) throw error;

  const rows = (outgoing ?? []) as {
    requester_user_id: string;
    target_user_id: string;
    connection_type: "know" | "worked_with";
  }[];

  const knowRows = rows.filter((r) => r.connection_type === "know" || r.connection_type === "worked_with");
  let knownPreviewUsers: KnownPreviewUser[] = [];

  if (knowRows.length > 0) {
    const previewIds = knowRows.slice(0, 6).map((r) => r.target_user_id);
    const workedMap = new Map<string, boolean>();
    knowRows.forEach((r) => workedMap.set(r.target_user_id, r.connection_type === "worked_with"));
    const { data: previewProfiles } = await supabase
      .from("profiles")
      .select("user_id, first_name, last_name, photo_url")
      .in("user_id", previewIds);
    knownPreviewUsers = (
      (previewProfiles ?? []) as {
        user_id: string;
        first_name: string | null;
        last_name: string | null;
        photo_url: string | null;
      }[]
    ).map((u) => ({ ...u, worked_with: workedMap.get(u.user_id) ?? false }));
  }

  let relation: ProfileConnectionRelation | null = null;
  if (viewerId && viewerId !== targetUserId) {
    const { data: viewerConn } = await supabase
      .from("profile_connections")
      .select("connection_type")
      .eq("requester_user_id", viewerId)
      .eq("target_user_id", targetUserId);

    const viewerRows = (viewerConn ?? []) as { connection_type: "know" | "worked_with" }[];
    const myWorkedWith = viewerRows.some((r) => r.connection_type === "worked_with");
    const myKnows = viewerRows.some((r) => r.connection_type === "know");
    if (myWorkedWith || myKnows) {
      relation = {
        id: "",
        status: "accepted",
        knowStatus: "accepted",
        workedWith: myWorkedWith,
        viewerWorkedWith: myWorkedWith,
      };
    }
  }

  return {
    knowCount: knowRows.length,
    knownPreviewUsers,
    connections: knownPreviewUsers,
    relation,
  };
}

export async function fetchProfileConnections(
  supabase: SupabaseClient,
  targetUserId: string,
  viewerId: string | null,
): Promise<ProfileConnectionsData> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return fetchProfileConnectionsLegacy(supabase, targetUserId, viewerId);
  }

  const res = await fetch(
    `/api/profile-connections?targetUserId=${encodeURIComponent(targetUserId)}`,
    { headers: { Authorization: `Bearer ${session.access_token}` } },
  );
  if (!res.ok) {
    const message = await res.text().catch(() => res.statusText);
    throw new Error(message || "Failed to load profile connections");
  }

  const data = (await res.json()) as ProfileConnectionsData & {
    connections?: KnownPreviewUser[];
  };

  return {
    knowCount: data.knowCount,
    knownPreviewUsers: data.knownPreviewUsers ?? [],
    connections: data.connections ?? data.knownPreviewUsers ?? [],
    relation: data.relation ?? null,
  };
}

export async function postProfileConnectionAction(
  action: ProfileConnectionAction,
  targetUserId: string,
  accessToken: string,
  workedWith?: boolean,
): Promise<ConnectionActionResponse> {
  const res = await fetch("/api/profile-connections/action", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ action, targetUserId, workedWith }),
  });
  const result = (await res.json().catch(() => null)) as ConnectionActionResponse | null;
  if (!res.ok || !result) {
    return { ok: false, error: result?.error || "Connection action failed" };
  }
  return result;
}

function invalidateConnectionCaches(
  queryClient: QueryClient,
  viewerId: string,
  targetUserId: string,
): void {
  void queryClient.invalidateQueries({
    queryKey: queryKeys.profileConnections(viewerId, targetUserId),
  });
  void queryClient.invalidateQueries({ queryKey: queryKeys.userDirectory(viewerId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.discoverProfiles(viewerId) });
  void queryClient.invalidateQueries({
    queryKey: queryKeys.profileConnections(viewerId, viewerId),
  });
}

export async function runProfileConnectionAction({
  queryClient,
  supabase,
  viewerId,
  targetUserId,
  action,
  workedWith,
}: {
  queryClient: QueryClient;
  supabase: SupabaseClient;
  viewerId: string;
  targetUserId: string;
  action: ProfileConnectionAction;
  workedWith?: boolean;
}): Promise<ConnectionActionResponse> {
  const queryKey = queryKeys.profileConnections(viewerId, targetUserId);
  const previousData = queryClient.getQueryData<ProfileConnectionsData>(queryKey);

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return { ok: false, error: "Please sign in again." };
    }

    const result = await postProfileConnectionAction(
      action,
      targetUserId,
      session.access_token,
      workedWith,
    );
    if (!result.ok) return result;

    invalidateConnectionCaches(queryClient, viewerId, targetUserId);
    return result;
  } catch (error) {
    if (previousData) queryClient.setQueryData(queryKey, previousData);
    throw error;
  }
}
