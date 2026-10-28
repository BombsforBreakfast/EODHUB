import "server-only";

/** Keep email, Checkout and billing-portal returns in the same deployment. */
export function rentalPortalOrigin(env: NodeJS.ProcessEnv = process.env, developmentOrigin?: string) {
  if (env.VERCEL_ENV === "preview") {
    if (!env.VERCEL_URL || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.vercel\.app$/i.test(env.VERCEL_URL)) {
      throw new Error("The rental preview URL is not configured.");
    }
    return `https://${env.VERCEL_URL}`;
  }
  if (env.NODE_ENV !== "production" && developmentOrigin) return new URL(developmentOrigin).origin;
  return "https://eod-hub.com";
}
