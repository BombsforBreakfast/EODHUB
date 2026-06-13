import type { SupabaseClient } from "@supabase/supabase-js";

export type BlockedUserSummary = {
  id: string;
  blockedId: string;
  reason: string | null;
  createdAt: string;
  displayName: string;
  photoUrl: string | null;
};

export async function fetchBlockedUserIds(
  supabase: SupabaseClient,
  userId: string | null | undefined,
): Promise<Set<string>> {
  if (!userId) return new Set();
  const { data, error } = await supabase
    .from("user_blocks")
    .select("blocked_id")
    .eq("blocker_id", userId);

  if (error) {
    console.error("Failed to load blocked users:", error);
    return new Set();
  }

  return new Set((data ?? []).map((row: { blocked_id: string }) => row.blocked_id));
}

export function filterBlockedRows<T>(
  rows: T[],
  blockedUserIds: Set<string>,
  getUserId: (row: T) => string | null | undefined,
): T[] {
  if (blockedUserIds.size === 0) return rows;
  return rows.filter((row) => {
    const id = getUserId(row);
    return !id || !blockedUserIds.has(id);
  });
}

export async function blockUser(
  supabase: SupabaseClient,
  blockedId: string,
  reason?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return { ok: false, error: "Please sign in again." };

  const res = await fetch("/api/user-blocks", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ blockedId, reason }),
  });

  if (res.ok) return { ok: true };
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return { ok: false, error: body.error ?? "Could not hide/block this user." };
}

export async function unblockUser(
  supabase: SupabaseClient,
  blockedId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return { ok: false, error: "Please sign in again." };

  const res = await fetch(`/api/user-blocks?blockedId=${encodeURIComponent(blockedId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.ok) return { ok: true };
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return { ok: false, error: body.error ?? "Could not unblock this user." };
}
