export const OWNER_ADMIN_USER_ID = "a28ddac8-dc3a-4ae1-83f5-b675e7b85871";
export const OWNER_ADMIN_EMAIL = "micheal.p.twigg@gmail.com";

type AdminViewer = { userId?: string | null; email?: string | null; isAdmin?: boolean | null };

/** The native Admin exception belongs to this account, not to all admins. */
export function isOwnerAdmin(viewer: AdminViewer): boolean {
  return viewer.isAdmin === true && viewer.userId === OWNER_ADMIN_USER_ID &&
    viewer.email?.trim().toLowerCase() === OWNER_ADMIN_EMAIL;
}

export function canShowAdminNavigation(viewer: AdminViewer & { native: boolean }): boolean {
  return viewer.isAdmin === true && (!viewer.native || isOwnerAdmin(viewer));
}
