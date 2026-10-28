import { z } from "zod";

export const RENTAL_ROLE = "eod_rental";
export const RENTAL_PORTAL = "/promote/rentals/portal";
export const RENTAL_COMMITMENT_VERSION = "2026-10-27-v1";
export const providerCommitment = "If approved for EOD-HUB Rentals, I commit to providing EOD personnel and students with an honest, fair, and exceptional rental experience. I will represent my properties accurately, disclose pricing and fees clearly, keep availability current, communicate promptly and respectfully, and maintain safe, well-cared-for accommodations.";
export const militaryLeaseCommitment = "I agree to offer a nine-month lease option for this property. I will permit early termination without an early-termination penalty when military orders require the renter to relocate, including PCS to a follow-on assignment or reassignment after leaving EOD school, even if fewer than nine months have elapsed. I will honor applicable military tenant protections and notice and documentation requirements.";
export const photoCommitment = "I own this property or am authorized to advertise it. These photos belong to the property owner, and I have permission to use them in this listing and any promotion I purchase.";
export const rentalAmenities = ["Furnished", "Garage", "Pool", "Large backyard", "Pet friendly", "Roommates accepted", "Utilities included", "Washer/dryer", "Parking", "Accessible features"] as const;

const text = (max: number) => z.string().trim().max(max);
const required = (max: number) => text(max).min(1, "Complete the required fields.");
export const propertySchema = z.object({
  title: required(140), address: required(220), city: required(100), state: z.string().regex(/^[A-Z]{2}$/), zip: z.string().regex(/^\d{5}(-\d{4})?$/),
  installation: required(160), propertyType: z.enum(["House", "Condo", "Apartment", "Room", "Shared home", "Short-term rental"]),
  rent: z.number().positive().max(100000), rentPeriod: z.enum(["month", "week", "night"]), priceBasis: z.enum(["property", "room"]),
  bedrooms: z.number().int().min(0).max(1000), bathrooms: z.number().min(0.5).max(1000), minimumLeaseMonths: z.number().int().min(1).max(9),
  deposit: z.number().min(0).max(100000), fees: required(1500), utilities: required(1000), petDetails: required(1000),
  description: required(6000).min(40, "Add a description of at least 40 characters."),
  contactName: required(120), contactPhone: required(40).min(7), contactEmail: z.email().max(254), company: text(160),
  amenities: z.array(z.enum(rentalAmenities)).max(rentalAmenities.length),
  photos: z.array(z.string().regex(/^[0-9a-f-]{36}\/photos\/[0-9a-f-]{36}\.webp$/)).min(1, "Upload at least one owner-owned photo.").max(100),
  militaryLeaseAccepted: z.literal(true, { error: "Accept the military lease commitment." }),
  photoRightsAccepted: z.literal(true, { error: "Confirm ownership and photo permission." }),
});
export type PropertyInput = z.infer<typeof propertySchema>;
export type PropertyDraft = Partial<Omit<PropertyInput,"militaryLeaseAccepted"|"photoRightsAccepted">> & {militaryLeaseAccepted?:boolean;photoRightsAccepted?:boolean};
export type Provider = { user_id: string; full_name: string; phone: string; email: string; company: string; status: "pending" | "approved" | "rejected" | "suspended"; review_note: string | null; email_verified_at: string | null; created_at: string; stripe_customer_id?: string | null };
export type PropertyRow = { id: string; provider_id: string; draft: PropertyDraft; submitted: PropertyInput | null; published: PropertyInput | null; revision: number; submission_id: string | null; review_status: string; review_note: string | null; status: "available-now" | "pending" | "unavailable"; available_date: string | null; plan: "monthly" | "annual"; auto_renew: boolean; campaign_requested: boolean; stripe_subscription_id: string | null; payment_method_id: string | null; setup_order_id:string|null; payment_status: string; payment_url: string | null; paid_until: string | null; grace_until: string | null; hidden: boolean; created_at: string; updated_at: string };
export type CampaignRow = { id: string; property_id: string; provider_id: string; status: string; paid: boolean; flyer_path: string | null; facebook_url: string; instagram_url: string; story_notes: string; starts_at: string | null; ends_at: string | null; report: string; report_path: string | null; metrics: Record<string, number>; created_at: string };
export function listingHasPaidAccess(row: Pick<PropertyRow, "payment_status" | "paid_until" | "grace_until">, now = Date.now()) {
  return !!row.paid_until && (Date.parse(row.paid_until) > now || (row.payment_status === "past_due" && !!row.grace_until && Date.parse(row.grace_until) > now));
}
export function isRentalIdentity(user: { role?: string; app_metadata?: Record<string, unknown> } | null | undefined) {
  return user?.role === RENTAL_ROLE && user.app_metadata?.account_type === "rental_provider";
}
export function rentalApiAllowed(path: string, method: string) {
  return path === "/api/rentals/auth" || path === "/api/rentals/portal" || path.startsWith("/api/rentals/portal/") ||
    (path === "/api/rentals/service-rating" && method === "GET") || path === "/api/rentals/events" || (path === "/api/rentals/photo" && method === "GET");
}
/** Deny-only hint; it never authenticates a request or grants access. */
export function bearerClaimsRental(header: string | null) {
  if (!header?.startsWith("Bearer ")) return false;
  try { return JSON.parse(Buffer.from(header.slice(7).split(".")[1], "base64url").toString()).role === RENTAL_ROLE; } catch { return false; }
}
export function planAmount(plan: "monthly" | "annual") { return plan === "annual" ? 10000 : 1000; }
export const signupSchema = z.object({ fullName: required(120), phone: required(40).min(7), email: z.email().max(254), company: text(160).default(""), commitment: z.literal(true) });


export function rentalSignupAttributes(input: z.infer<typeof signupSchema>) {
  return {email:input.email,role:RENTAL_ROLE,app_metadata:{account_type:"rental_provider"},
    user_metadata:{full_name:input.fullName,phone:input.phone,company:input.company},email_confirm:false};
}
