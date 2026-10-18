import { z } from "zod";

export const PROMOTION_REVIEW_EMAIL = "micheal.p.twigg@gmail.com";
export const PROMOTION_IMAGE_LIMIT = 3 * 1024 * 1024;
export const PROMOTION_MAX_IMAGES = 5;
export const PROMOTION_PACKAGES = ["Basic", "Featured", "Premium"] as const;
export const PROMOTION_TYPES = ["Business or service", "Job or recruiting", "Housing or rental", "Training or event", "Product", "Other"] as const;
export const PROMOTION_STATUSES = ["new", "reviewing", "contacted", "complete", "declined"] as const;

export const promotionInput = z.object({
  id: z.uuid(),
  package: z.enum(PROMOTION_PACKAGES),
  name: z.string().trim().min(2, "Please enter your name.").max(120),
  email: z.email().trim().max(254),
  phone: z.string().trim().min(7, "Please enter a phone number.").max(40),
  business: z.string().trim().max(160).default(""),
  promotionType: z.enum(PROMOTION_TYPES),
  description: z.string().trim().min(20, "Please give us a little more detail (at least 20 characters).").max(12000),
  destination: z.string().trim().max(2000).refine(v => !v || /^https?:\/\//i.test(v), "Use a full http:// or https:// link.").default(""),
  timing: z.string().trim().max(500).default(""),
  consent: z.literal(true, { error: "Please confirm you have permission to share these materials." }),
  website: z.string().max(0).optional(),
});

export type PromotionAttachment = { path: string; name: string; size: number };
export type PromotionRequest = {
  id: string; package: string; name: string; email: string; phone: string;
  business: string; promotion_type: string; description: string;
  destination: string; timing: string; status: string; admin_notes: string;
  attachments: PromotionAttachment[]; created_at: string; submitted_at: string;
};
