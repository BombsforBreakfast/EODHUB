import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_HOT_THRESHOLD = 12;

/** Sum: likes + 2×comments — crosses threshold once → notify other unit members (excluding author + actor). */
export async function maybeNotifyUnitHotEngagement(
  admin: SupabaseClient,
  params: {
    postId: string;
    unitId: string;
    unitSlug: string;
    unitName: string;
    postAuthorId: string;
    actorUserId: string;
    threshold?: number;
  },
): Promise<void> {
  const threshold = params.threshold ?? DEFAULT_HOT_THRESHOLD;

  const { count: lc } = await admin
    .from("unit_post_likes")
    .select("*", { count: "exact", head: true })
    .eq("unit_post_id", params.postId);
  const { count: cc } = await admin
    .from("unit_post_comments")
    .select("*", { count: "exact", head: true })
    .eq("unit_post_id", params.postId);

  const engagement = (lc ?? 0) + (cc ?? 0) * 2;
  if (engagement < threshold) return;

  const { data: postRow } = await admin
    .from("unit_posts")
    .select("hot_notified_at")
    .eq("id", params.postId)
    .maybeSingle();

  if ((postRow as { hot_notified_at?: string | null } | null)?.hot_notified_at) return;

  await admin
    .from("unit_posts")
    .update({ hot_notified_at: new Date().toISOString() })
    .eq("id", params.postId);

  const { data: members } = await admin
    .from("unit_members")
    .select("user_id")
    .eq("unit_id", params.unitId)
    .eq("status", "approved");

  const recipients = ((members ?? []) as { user_id: string }[])
    .map((m) => m.user_id)
    .filter((uid) => uid !== params.postAuthorId && uid !== params.actorUserId);

  if (recipients.length === 0) return;

  const rows = recipients.map((user_id) => ({
    user_id,
    actor_id: params.actorUserId,
    actor_name: params.unitName,
    type: "unit_hot",
    message: `🔥 A post in ${params.unitName} is getting high engagement.`,
    post_owner_id: null,
    unit_id: params.unitId,
    unit_post_id: params.postId,
    metadata: { unit_slug: params.unitSlug, unit_post_id: params.postId },
  }));

  await admin.from("notifications").insert(rows);
}

export async function fetchActorName(admin: SupabaseClient, userId: string): Promise<string> {
  const { data } = await admin
    .from("profiles")
    .select("display_name, first_name, last_name")
    .eq("user_id", userId)
    .maybeSingle();
  const row = data as { display_name?: string | null; first_name?: string | null; last_name?: string | null } | null;
  if (!row) return "Someone";
  return (
    row.display_name?.trim() ||
    `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() ||
    "Someone"
  );
}
