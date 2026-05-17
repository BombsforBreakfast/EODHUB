/** Server-only: never import from client components. */

export function getFounderUserId(): string {
  return (process.env.FOUNDER_USER_ID ?? "").trim();
}

export function isFounderUserId(userId: string | null | undefined): boolean {
  if (!userId) return false;
  const founderId = getFounderUserId();
  if (!founderId) return false;
  return userId === founderId;
}
