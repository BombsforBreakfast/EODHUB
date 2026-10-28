import "server-only";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { authenticateAdminApiRequest } from "@/app/lib/server/adminApiAuth";
import { isOwnerAdmin } from "@/app/lib/ownerAdminAccess";
import { isRentalIdentity, type Provider } from "./provider";
import { ZodError } from "zod";
import { createHash } from "node:crypto";
import { rentalAdminEmail } from "./notifications.server";

export class RentalError extends Error { constructor(message: string, public status = 400) { super(message); } }
export const rentalJson = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export function rentalDatabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new RentalError("The property portal is temporarily unavailable.", 503);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function rentalProvider(request: NextRequest, approved = true): Promise<{ db: SupabaseClient; user: User; provider: Provider }> {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) throw new RentalError("Sign in to your property portal.", 401);
  const db = rentalDatabase();
  const { data, error } = await db.auth.getUser(token);
  if (error || !isRentalIdentity(data.user)) throw new RentalError("A separate EOD-HUB Rentals account is required.", 403);
  const user = data.user!;
  const { data: provider, error: lookupError } = await db.from("rental_providers").select("user_id,full_name,phone,email,company,status,review_note,email_verified_at,created_at,stripe_customer_id").eq("user_id", user.id).maybeSingle();
  if (lookupError) throw new RentalError("Could not load your provider account.", 503);
  if (!provider || !user.email_confirmed_at) throw new RentalError("Confirm your rental account email first.", 403);
  if (!provider.email_verified_at) {
    const confirmed = await db.from("rental_providers").update({email_verified_at:user.email_confirmed_at}).eq("user_id",user.id).is("email_verified_at",null).select("user_id");
    checkDb(confirmed.error);
    provider.email_verified_at = user.email_confirmed_at;
    if (confirmed.data?.length) await rentalAdminEmail("Provider ready for review", "A new EOD-HUB Rentals provider has confirmed their email. Review the application in Admin → Rentals.");
  }
  if (approved && provider.status !== "approved") throw new RentalError("Your rental account must be approved before you can manage properties.", 403);
  return { db, user, provider: provider as Provider };
}
export async function rentalAdministrator(request: NextRequest) {
  const access = await authenticateAdminApiRequest(request);
  if (!access.ok) throw new RentalError(access.error, access.status);
  if (!isOwnerAdmin({ userId: access.user.id, email: access.user.email, isAdmin: true })) throw new RentalError("Only the Hub owner can manage rentals.", 403);
  return { db: access.admin, user: access.user };
}
export async function rentalBody(request: Request, max = 150000) {
  const raw = await request.text();
  if (raw.length > max) throw new RentalError("Request is too large.", 413);
  try { return JSON.parse(raw); } catch { throw new RentalError("Invalid request."); }
}
export function rentalFailure(error: unknown) {
  if (error instanceof RentalError) return rentalJson({ error: error.message }, error.status);
  if (error instanceof ZodError) return rentalJson({ error: error.issues[0]?.message ?? "Check the property details." }, 400);
  console.error("[rentals]", error instanceof Error ? error.message : "Request failed");
  return rentalJson({ error: "Could not complete that action. Please retry." }, 503);
}
export function ensureSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new RentalError("Invalid request origin.", 403);
}
export function checkDb(error: { message: string;code?:string } | null) {
  if(error?.code === "23505" && error.message.includes("rental_properties_one_address_per_provider")) throw new RentalError("This address is already in your account. Edit the existing property to manage all roommate openings.",409);
  if (error) throw new RentalError("Could not save your changes. Please retry.", 503);
}
export async function rentalLimit(db: SupabaseClient, request: Request, scope: string, limit = 20, seconds = 600) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const key = `${scope}:${createHash("sha256").update(ip).digest("hex")}`;
  const { data, error } = await db.rpc("rental_consume_limit", { p_key: key, p_limit: limit, p_seconds: seconds });
  if (error) throw new RentalError("The property portal is temporarily unavailable.", 503);
  if (!data) throw new RentalError("Too many attempts. Please try again later.", 429);
}
