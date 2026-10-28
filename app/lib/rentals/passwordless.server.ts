import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isRentalIdentity, RENTAL_PORTAL } from "./provider";
import { rentalEmail } from "./notifications.server";

/** Only pre-provisioned rental identities receive a link. Never use public auto-signup. */
export async function sendRentalSignInLink(db: SupabaseClient, userId: string, email: string, send = rentalEmail) {
  const { data, error } = await db.auth.admin.getUserById(userId);
  if (error || !isRentalIdentity(data.user) || data.user?.email?.toLowerCase() !== email.toLowerCase()) return false;
  const key = createHash("sha256").update(email.toLowerCase()).digest("hex");
  const limit = await db.rpc("rental_consume_limit", { p_key: `rental-email:${key}`, p_limit: 5, p_seconds: 3600 });
  if (limit.error || !limit.data) return false;
  const origin = process.env.VERCEL_ENV==="preview" && process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://eod-hub.com";
  const link = await db.auth.admin.generateLink({type:"magiclink",email,options:{redirectTo:`${origin}${RENTAL_PORTAL}`}});
  if (link.error || !link.data.properties?.hashed_token || !isRentalIdentity(link.data.user) || link.data.user.id !== userId) return false;
  // A fragment stays out of request logs and referrers. A deliberate button click
  // verifies the single-use token, so email link scanners do not consume it.
  const url = `${origin}${RENTAL_PORTAL}#token_hash=${encodeURIComponent(link.data.properties.hashed_token)}`;
  return send(email,"Your secure sign-in link","Open the link below, then select Continue to property portal to sign in. No password is needed. This single-use link expires after the configured sign-in window. If you did not request it, you can ignore this email. New provider accounts still require admin approval.",url);
}
