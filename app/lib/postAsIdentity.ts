/** Accounts allowed to choose a feed post author identity (self vs EOD HUB admin). */
export const POST_AS_SELECTOR_EMAILS = ["micheal.p.twigg@gmail.com"] as const;

export const POST_AS_ADMIN_EMAIL = "hello@eod-hub.com";

export type PostAsMode = "self" | "admin";

export const POST_AS_STORAGE_KEY = "eodhub:post-as-mode";

export type PostAsAdminProfile = {
  userId: string;
  displayName: string;
  photoUrl: string | null;
};

export function canUsePostAsSelector(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return POST_AS_SELECTOR_EMAILS.some((allowed) => allowed.toLowerCase() === normalized);
}

export function loadStoredPostAsMode(): PostAsMode {
  if (typeof window === "undefined") return "self";
  return window.localStorage.getItem(POST_AS_STORAGE_KEY) === "admin" ? "admin" : "self";
}

export function storePostAsMode(mode: PostAsMode): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(POST_AS_STORAGE_KEY, mode);
}

export function resolvePostAuthorUserId(post: {
  user_id: string;
  post_as_user_id?: string | null;
}): string {
  return post.post_as_user_id ?? post.user_id;
}

export function resolvePostAsUserIdForSubmit(
  mode: PostAsMode,
  adminUserId: string | null,
): string | null {
  if (mode !== "admin" || !adminUserId) return null;
  return adminUserId;
}

export function adminPostDisplayName(profile: {
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}): string {
  return (
    profile.display_name?.trim() ||
    `${profile.first_name || ""} ${profile.last_name || ""}`.trim() ||
    "EOD HUB Admin"
  );
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Parse optional post_as_user_id from a share/create POST body. */
export function parsePostAsUserIdFromBody(body: unknown): string | null | "invalid" {
  if (body === null || typeof body !== "object") return null;
  const raw = (body as { post_as_user_id?: unknown }).post_as_user_id;
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string" || !UUID_RE.test(raw.trim())) return "invalid";
  return raw.trim();
}

export function validatePostAsUserIdForShare(params: {
  callerEmail: string | null;
  callerUserId: string;
  requestedPostAsUserId: string | null;
  adminUserId: string | null;
}): { ok: true; postAsUserId: string | null } | { ok: false; error: string; status: number } {
  const { callerEmail, callerUserId, requestedPostAsUserId, adminUserId } = params;
  if (!requestedPostAsUserId) return { ok: true, postAsUserId: null };

  if (!canUsePostAsSelector(callerEmail)) {
    return { ok: false, error: "Post-as identity is not allowed for this account.", status: 403 };
  }

  const allowed = new Set([callerUserId, adminUserId].filter(Boolean));
  if (!allowed.has(requestedPostAsUserId)) {
    return { ok: false, error: "Invalid post-as identity.", status: 403 };
  }

  return { ok: true, postAsUserId: requestedPostAsUserId };
}
