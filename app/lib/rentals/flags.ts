import { z } from "zod";
export const flagReasons = { inaccurate: "Incorrect listing details", suspicious: "Suspected scam or misleading offer", condition: "Property condition or safety concern", contact: "Problem contacting the provider", other: "Other concern" } as const;
export const flagSchema = z.object({
  id: z.uuid(), listingId: z.string().min(1).max(100),
  reason: z.enum(["inaccurate","suspicious","condition","contact","other"]),
  details: z.string().trim().min(15,"Please add a little detail so we can review your concern.").max(2000,"Use up to 2,000 characters."),
  email: z.union([z.literal(""),z.email().max(254)]).default(""), website: z.string().max(200).optional(),
});
export type ListingFlag = { id: string; listing_id: string; owner_id: string; address: string; city: string; state: string; reason: keyof typeof flagReasons; details: string; contact_email: string; status: "open"|"reviewing"|"resolved"|"dismissed"; review_note: string; revision: number; created_at: string };
export type Moderation = { permanent?: boolean; listing_id: string; hidden: boolean; reason: string; revision: number };
