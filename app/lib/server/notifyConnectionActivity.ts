import type { SupabaseClient } from "@supabase/supabase-js";
import { createNotification } from "../notificationsServer";

export type ConnectionActivityKind = "posted" | "job_share";

type ConnectionEdge = {
  requester_user_id: string;
  target_user_id: string;
  worked_with: boolean | null;
};

function hourBucket(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 13); // YYYY-MM-DDTHH UTC
}

function otherUserId(edge: ConnectionEdge, actorUserId: string): string | null {
  if (edge.requester_user_id === actorUserId) return edge.target_user_id;
  if (edge.target_user_id === actorUserId) return edge.requester_user_id;
  return null;
}

function activityCopy(
  kind: ConnectionActivityKind,
  actorName: string,
  workedWith: boolean,
): { title: string; message: string } {
  const tie = workedWith ? "someone you worked with" : "someone you know";
  if (kind === "job_share") {
    return {
      title: actorName,
      message: `${actorName} (${tie}) shared a job`,
    };
  }
  return {
    title: actorName,
    message: `${actorName} (${tie}) posted in the feed`,
  };
}

/**
 * Fan out to accepted Know connections when a member posts or shares a job.
 * - Uses profile_connections status=accepted only
 * - "worked with" copy only when connection.worked_with is true
 * - Max one notify per actor→recipient→kind per UTC hour (dedupe_key)
 * - Honors know_activity_notifications preference (default on)
 */
export async function notifyConnectionActivity(
  admin: SupabaseClient,
  params: {
    actorUserId: string;
    actorName: string;
    kind: ConnectionActivityKind;
    postId: string;
  },
): Promise<{ notified: number }> {
  const { actorUserId, actorName, kind, postId } = params;
  if (!actorUserId || !postId) return { notified: 0 };

  const { data: edges, error } = await admin
    .from("profile_connections")
    .select("requester_user_id, target_user_id, worked_with")
    .eq("status", "accepted")
    .or(`requester_user_id.eq.${actorUserId},target_user_id.eq.${actorUserId}`);

  if (error) {
    console.error("[notifyConnectionActivity] load connections failed", error.message);
    return { notified: 0 };
  }

  const recipients: Array<{ userId: string; workedWith: boolean }> = [];
  const seen = new Set<string>();
  for (const edge of (edges ?? []) as ConnectionEdge[]) {
    const other = otherUserId(edge, actorUserId);
    if (!other || other === actorUserId || seen.has(other)) continue;
    seen.add(other);
    recipients.push({ userId: other, workedWith: edge.worked_with === true });
  }

  if (recipients.length === 0) return { notified: 0 };

  const recipientIds = recipients.map((r) => r.userId);
  const { data: prefRows, error: prefErr } = await admin
    .from("notification_preferences")
    .select("user_id, know_activity_notifications")
    .in("user_id", recipientIds);

  // If migration not applied yet, fail open (default on) rather than skipping fan-out.
  if (prefErr) {
    console.warn(
      "[notifyConnectionActivity] pref load failed; defaulting to notify-on",
      prefErr.message,
    );
  }

  const optedOut = new Set(
    ((prefRows ?? []) as Array<{ user_id: string; know_activity_notifications: boolean | null }>)
      .filter((row) => row.know_activity_notifications === false)
      .map((row) => row.user_id),
  );

  const bucket = hourBucket();
  const type = kind === "job_share" ? "connection_job_share" : "connection_posted";
  const link = `/?postId=${encodeURIComponent(postId)}`;

  let notified = 0;
  // Chunk to avoid stampeding createNotification/push.
  const chunkSize = 25;
  for (let i = 0; i < recipients.length; i += chunkSize) {
    const chunk = recipients.slice(i, i + chunkSize).filter((r) => !optedOut.has(r.userId));
    await Promise.all(
      chunk.map(async (recipient) => {
        const copy = activityCopy(kind, actorName, recipient.workedWith);
        try {
          await createNotification(admin, {
            recipientUserId: recipient.userId,
            actorUserId,
            actorName,
            postOwnerId: actorUserId,
            type,
            category: "social",
            entityType: "post",
            entityId: postId,
            postId,
            title: copy.title,
            body: copy.message,
            message: copy.message,
            link,
            groupKey: `connection_activity:${actorUserId}:${kind}:${bucket}`,
            dedupeKey: `connection_activity:${kind}:${actorUserId}:${recipient.userId}:${bucket}`,
            metadata: {
              feed: true,
              post_id: postId,
              kind,
              worked_with: recipient.workedWith,
            },
          });
          notified += 1;
        } catch (err) {
          console.error("[notifyConnectionActivity] create failed", err);
        }
      }),
    );
  }

  return { notified };
}
