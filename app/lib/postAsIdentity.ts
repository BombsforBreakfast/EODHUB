/** Accounts allowed to choose a feed post author identity (self vs EOD HUB admin). */
export const POST_AS_SELECTOR_EMAILS = ["micheal.p.twigg@gmail.com"] as const;

export const POST_AS_ADMIN_EMAIL = "hello@eod-hub.com";

export type PostAsMode = "self" | "admin";

export const POST_AS_STORAGE_KEY = "eodhub:post-as-mode";
export const LISTING_SHARE_POST_AS_STORAGE_KEY = "eodhub:listing-share-post-as-mode";

/** Listing shares (jobs, resources, businesses) default to the EOD HUB admin identity. */
export const LISTING_SHARE_DEFAULT_POST_AS_MODE: PostAsMode = "admin";

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

export function loadStoredListingSharePostAsMode(): PostAsMode {
  if (typeof window === "undefined") return LISTING_SHARE_DEFAULT_POST_AS_MODE;
  const stored = window.localStorage.getItem(LISTING_SHARE_POST_AS_STORAGE_KEY);
  if (stored === "admin" || stored === "self") return stored;
  return LISTING_SHARE_DEFAULT_POST_AS_MODE;
}

export function storePostAsMode(mode: PostAsMode): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(POST_AS_STORAGE_KEY, mode);
}

export function storeListingSharePostAsMode(mode: PostAsMode): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LISTING_SHARE_POST_AS_STORAGE_KEY, mode);
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
