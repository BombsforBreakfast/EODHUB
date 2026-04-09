/**
 * Resolves in-app navigation for a notification row.
 * Prefer structured fields (type, metadata, post_id, unit_*) over message text.
 */
export type NotificationNavInput = {
  message: string;
  post_owner_id: string | null;
  type?: string | null;
  post_id?: string | null;
  unit_id?: string | null;
  unit_post_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

/** Supabase/PostgREST sometimes returns jsonb as a parsed object; edge cases may stringify. */
function normalizeMetadata(
  metadata: NotificationNavInput["metadata"],
): Record<string, unknown> | null {
  if (metadata == null) return null;
  if (typeof metadata === "object" && !Array.isArray(metadata)) {
    return metadata as Record<string, unknown>;
  }
  if (typeof metadata === "string") {
    try {
      const p = JSON.parse(metadata) as unknown;
      if (p && typeof p === "object" && !Array.isArray(p)) return p as Record<string, unknown>;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function metaSlug(n: NotificationNavInput): string | null {
  const m = n.metadata;
  if (!m || typeof m !== "object") return null;
  const s = (m as { unit_slug?: unknown }).unit_slug;
  return typeof s === "string" && s.length > 0 ? s : null;
}

function isFeedMention(n: NotificationNavInput): boolean {
  const m = n.metadata;
  if (!m || typeof m !== "object") return false;
  return (m as { feed?: unknown }).feed === true;
}

function isWallMention(n: NotificationNavInput): boolean {
  const m = n.metadata;
  if (!m || typeof m !== "object") return false;
  return (m as { wall?: unknown }).wall === true;
}

function metaCommentId(n: NotificationNavInput): string | null {
  const m = n.metadata;
  if (!m || typeof m !== "object") return null;
  const c = (m as { comment_id?: unknown }).comment_id;
  return typeof c === "string" && c.length > 0 ? c : null;
}

/** Home feed URL with optional deep link to a comment (soft-highlight on landing). */
export function feedDeepLink(postId: string, commentId?: string | null): string {
  const q = new URLSearchParams();
  q.set("postId", postId);
  if (commentId) q.set("commentId", commentId);
  return `/?${q.toString()}`;
}

/** Unit wall: `unit_posts.id` + optional `unit_post_comments.id` for highlight. */
export function unitFeedDeepLink(
  unitSlug: string,
  unitPostId: string,
  commentId?: string | null,
): string {
  const q = new URLSearchParams();
  q.set("unitPostId", unitPostId);
  if (commentId) q.set("commentId", commentId);
  return `/units/${encodeURIComponent(unitSlug)}?${q.toString()}`;
}

export function getNotificationHref(
  n: NotificationNavInput,
  ctx: { currentUserId: string | null; isAdmin: boolean },
): string {
  const parsedMeta = normalizeMetadata(n.metadata);
  const nNorm: NotificationNavInput = { ...n, metadata: parsedMeta };
  const m = (nNorm.message ?? "").trim();
  const lower = m.toLowerCase();
  const slug = metaSlug(nNorm);

  if (nNorm.type === "unit_join_request" && slug) {
    return `/units/${encodeURIComponent(slug)}/admin`;
  }
  if (nNorm.type === "unit_join_approval" && slug) {
    return `/units/${encodeURIComponent(slug)}`;
  }
  if (nNorm.type === "unit_invite" && slug) {
    return `/units/${encodeURIComponent(slug)}`;
  }
  if (nNorm.type === "user_verified") {
    return ctx.currentUserId ? `/profile/${ctx.currentUserId}` : "/";
  }

  if (nNorm.type === "unit_hot" || nNorm.type === "unit_post_like" || nNorm.type === "unit_post_comment") {
    const upId = nNorm.unit_post_id;
    if (slug && upId) {
      const cid =
        nNorm.type === "unit_post_comment" ? metaCommentId(nNorm) : null;
      return unitFeedDeepLink(slug, upId, cid);
    }
    if (slug) return `/units/${encodeURIComponent(slug)}`;
    return "/units";
  }

  if (lower.includes("message request")) return "/sidebar";

  if (lower.includes("requesting to join")) {
    if (slug) return `/units/${encodeURIComponent(slug)}/admin`;
    return "/units";
  }

  if (ctx.isAdmin && (lower.includes("bug report") || lower.includes("flagged"))) {
    return "/admin";
  }

  if (nNorm.type === "job_save" || lower.includes("saved your job")) {
    return "/?tab=jobs";
  }

  if (lower.includes("memorial")) {
    return "/";
  }

  if (nNorm.type?.startsWith("connection_") || nNorm.type === "worked_with") {
    if (nNorm.post_owner_id) return `/profile/${nNorm.post_owner_id}`;
    return ctx.currentUserId ? `/profile/${ctx.currentUserId}` : "/";
  }

  if (nNorm.type?.startsWith("wall_") && nNorm.post_owner_id) {
    return `/profile/${nNorm.post_owner_id}`;
  }

  if (
    (nNorm.type === "mention_post" || nNorm.type === "mention_comment") &&
    isFeedMention(nNorm) &&
    nNorm.post_id
  ) {
    const cid = nNorm.type === "mention_comment" ? metaCommentId(nNorm) : null;
    return feedDeepLink(nNorm.post_id, cid);
  }

  if (
    (nNorm.type === "mention_post" || nNorm.type === "mention_comment") &&
    isWallMention(nNorm) &&
    nNorm.post_owner_id
  ) {
    return `/profile/${nNorm.post_owner_id}`;
  }

  if (nNorm.type === "mention_post" || nNorm.type === "mention_comment") {
    if (nNorm.post_id) {
      return feedDeepLink(
        nNorm.post_id,
        nNorm.type === "mention_comment" ? metaCommentId(nNorm) : null,
      );
    }
    if (nNorm.post_owner_id) return `/profile/${nNorm.post_owner_id}`;
  }

  if (nNorm.post_id && nNorm.type?.startsWith("feed_")) {
    return feedDeepLink(nNorm.post_id);
  }

  if (nNorm.post_owner_id == null) {
    return "/";
  }

  const uid = ctx.currentUserId;
  if (uid && nNorm.post_owner_id === uid) {
    return `/profile/${uid}`;
  }

  return `/profile/${nNorm.post_owner_id}`;
}

export function getNotificationIcon(n: NotificationNavInput): string {
  const lower = (n.message ?? "").toLowerCase();
  const t = n.type ?? "";
  if (t.startsWith("unit_")) return "🪖";
  if (t === "job_save" || (lower.includes("job") && lower.includes("saved"))) return "💼";
  if (lower.includes("message") || t === "connection_request") return "💬";
  if (lower.includes("verified") || lower.includes("vouch")) return "✅";
  if (lower.includes("bug report")) return "🐛";
  if (lower.includes("flag")) return "🚩";
  if (lower.includes("join")) return "🪖";
  if (lower.includes("memorial")) return "🕊️";
  if (lower.includes("mention") || t.startsWith("mention")) return "@";
  if (t.startsWith("connection_") || t === "worked_with") return "🤝";
  if (n.post_owner_id) return "👤";
  return "🔔";
}
