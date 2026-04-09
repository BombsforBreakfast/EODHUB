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

function metaSlug(n: NotificationNavInput): string | null {
  const m = n.metadata;
  if (!m || typeof m !== "object") return null;
  const s = (m as { unit_slug?: unknown }).unit_slug;
  return typeof s === "string" && s.length > 0 ? s : null;
}

export function getNotificationHref(
  n: NotificationNavInput,
  ctx: { currentUserId: string | null; isAdmin: boolean },
): string {
  const m = (n.message ?? "").trim();
  const lower = m.toLowerCase();
  const slug = metaSlug(n);

  if (n.type === "unit_hot" || n.type === "unit_post_like" || n.type === "unit_post_comment") {
    if (slug) return `/units/${encodeURIComponent(slug)}`;
    return "/units";
  }

  if (lower.includes("message request")) return "/sidebar";

  if (lower.includes("requesting to join")) return "/units";

  if (ctx.isAdmin && (lower.includes("bug report") || lower.includes("flagged"))) {
    return "/admin";
  }

  if (n.type === "job_save" || lower.includes("saved your job")) {
    return "/?tab=jobs";
  }

  if (lower.includes("memorial")) {
    return "/";
  }

  if (n.type?.startsWith("connection_") || n.type === "worked_with") {
    if (n.post_owner_id) return `/profile/${n.post_owner_id}`;
    return ctx.currentUserId ? `/profile/${ctx.currentUserId}` : "/";
  }

  if (n.type?.startsWith("wall_") && n.post_owner_id) {
    return `/profile/${n.post_owner_id}`;
  }

  if (n.type === "mention_post" || n.type === "mention_comment") {
    if (n.post_owner_id) return `/profile/${n.post_owner_id}`;
    if (n.post_id) return `/?postId=${encodeURIComponent(n.post_id)}`;
  }

  if (n.post_id && n.type?.startsWith("feed_")) {
    return `/?postId=${encodeURIComponent(n.post_id)}`;
  }

  if (n.post_owner_id == null) {
    return "/";
  }

  const uid = ctx.currentUserId;
  if (uid && n.post_owner_id === uid) {
    return `/profile/${uid}`;
  }

  return `/profile/${n.post_owner_id}`;
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
