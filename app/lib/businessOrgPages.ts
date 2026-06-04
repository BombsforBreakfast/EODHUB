import type { SupabaseClient } from "@supabase/supabase-js";

export type BusinessOrgPageStatus =
  | "pending"
  | "approved"
  | "denied"
  | "needs_revalidation"
  | "deactivated";

export type BusinessOrgSubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "paused"
  | "cancelled"
  | "unpaid"
  | string;

export type BusinessOrgPageType = "business" | "organization";

export type BusinessOrgPageRow = {
  id: string;
  owner_user_id: string;
  business_auth_user_id: string | null;
  business_name: string;
  description: string;
  business_email: string;
  linked_account_email: string;
  logo_url: string;
  website_url: string | null;
  location: string | null;
  address: string | null;
  phone: string | null;
  owner_info: string | null;
  page_type: BusinessOrgPageType | null;
  verification_status: BusinessOrgPageStatus;
  claimed_business_listing_id: string | null;
  is_active: boolean;
  subscription_status: BusinessOrgSubscriptionStatus | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_paused_at: string | null;
  billing_disabled_at: string | null;
  shopify_store_domain: string | null;
  shopify_admin_access_token: string | null;
  shopify_last_synced_at: string | null;
  admin_note: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
};

export type BusinessOrgPageInput = {
  business_name: string;
  description: string;
  business_email: string;
  linked_account_email: string;
  logo_url: string;
  website_url?: string | null;
  location?: string | null;
  address?: string | null;
  phone?: string | null;
  owner_info?: string | null;
  page_type?: BusinessOrgPageType;
};

export type BusinessOrgEmailValidation =
  | { ok: true; normalizedEmail: string; userId: string; authEmail: string }
  | { ok: false; code: "invalid_email" | "not_found" | "not_approved" | "lookup_failed"; message: string };

export const BUSINESS_ORG_PAGE_SELECT = [
  "id",
  "owner_user_id",
  "business_auth_user_id",
  "business_name",
  "description",
  "business_email",
  "linked_account_email",
  "logo_url",
  "website_url",
  "location",
  "address",
  "phone",
  "owner_info",
  "page_type",
  "verification_status",
  "claimed_business_listing_id",
  "is_active",
  "subscription_status",
  "stripe_customer_id",
  "stripe_subscription_id",
  "subscription_paused_at",
  "billing_disabled_at",
  "shopify_store_domain",
  "shopify_admin_access_token",
  "shopify_last_synced_at",
  "admin_note",
  "reviewed_at",
  "reviewed_by",
  "created_at",
  "updated_at",
].join(", ");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeBusinessOrgEmail(value: unknown): string | null {
  const email = normalizeText(value).toLowerCase();
  return EMAIL_RE.test(email) ? email : null;
}

function nullableText(value: unknown): string | null {
  const text = normalizeText(value);
  return text ? text : null;
}

export function parseBusinessOrgPageInput(body: unknown): { ok: true; input: BusinessOrgPageInput } | { ok: false; message: string } {
  const source = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const businessName = normalizeText(source.business_name);
  const description = normalizeText(source.description);
  const businessEmail = normalizeBusinessOrgEmail(source.business_email);
  const linkedEmail = normalizeBusinessOrgEmail(source.linked_account_email);
  const logoUrl = normalizeText(source.logo_url);
  const websiteUrl = nullableText(source.website_url);
  const rawPageType = normalizeText(source.page_type);
  const pageType =
    rawPageType === "business" || rawPageType === "organization"
      ? rawPageType
      : undefined;

  if (!businessName) return { ok: false, message: "Business name is required." };
  if (!description) return { ok: false, message: "Business description is required." };
  if (!businessEmail) return { ok: false, message: "A valid public business email is required." };
  if (!linkedEmail) return { ok: false, message: "A valid linked EOD-HUB account email is required." };
  if (!logoUrl) return { ok: false, message: "A business logo is required." };
  let normalizedWebsiteUrl = websiteUrl;
  if (normalizedWebsiteUrl && !/^https?:\/\//i.test(normalizedWebsiteUrl)) {
    normalizedWebsiteUrl = `https://${normalizedWebsiteUrl}`;
  }
  if (normalizedWebsiteUrl) {
    try {
      const url = new URL(normalizedWebsiteUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return { ok: false, message: "Website must be a valid http or https URL." };
      }
    } catch {
      return { ok: false, message: "Website must be a valid URL." };
    }
  }

  return {
    ok: true,
    input: {
      business_name: businessName,
      description,
      business_email: businessEmail,
      linked_account_email: linkedEmail,
      logo_url: logoUrl,
      website_url: normalizedWebsiteUrl,
      location: nullableText(source.location),
      address: nullableText(source.address),
      phone: nullableText(source.phone),
      owner_info: nullableText(source.owner_info),
      ...(pageType ? { page_type: pageType } : {}),
    },
  };
}

export function authEmailMatchesLinkedEmail(authEmail: string | null | undefined, linkedEmail: string | null | undefined): boolean {
  if (!authEmail || !linkedEmail) return false;
  return authEmail.trim().toLowerCase() === linkedEmail.trim().toLowerCase();
}

export async function validateBusinessOrgOwnerEmailByAuth(
  adminClient: SupabaseClient,
  email: string,
): Promise<BusinessOrgEmailValidation> {
  const normalizedEmail = normalizeBusinessOrgEmail(email);
  if (!normalizedEmail) {
    return { ok: false, code: "invalid_email", message: "Please enter a valid email address." };
  }

  const { data: profiles, error } = await adminClient
    .from("profiles")
    .select("user_id, verification_status, email_verified, admin_verified, email")
    .ilike("email", normalizedEmail)
    .limit(5);

  if (error) {
    return { ok: false, code: "lookup_failed", message: "Could not validate this email right now." };
  }

  for (const profile of profiles ?? []) {
    const row = profile as {
      user_id: string;
      verification_status: string | null;
      email_verified: boolean | null;
      admin_verified: boolean | null;
      email: string | null;
    };
    const { data: authData } = await adminClient.auth.admin.getUserById(row.user_id);
    const authEmail = authData?.user?.email?.trim().toLowerCase() ?? null;
    if (authEmail !== normalizedEmail) continue;

    if (row.verification_status !== "verified" || row.email_verified !== true || row.admin_verified !== true) {
      return {
        ok: false,
        code: "not_approved",
        message: "Email found, but that EOD-HUB user account is not fully approved yet.",
      };
    }

    return { ok: true, normalizedEmail, userId: row.user_id, authEmail };
  }

  return {
    ok: false,
    code: "not_found",
    message: "Email not found. Please check your email or first create a classic EOD-HUB user account.",
  };
}

export async function loadBusinessOrgPageForOwner(
  adminClient: SupabaseClient,
  pageId: string,
  ownerUserId: string,
): Promise<BusinessOrgPageRow | null> {
  const { data } = await adminClient
    .from("business_organization_pages")
    .select(BUSINESS_ORG_PAGE_SELECT)
    .eq("id", pageId)
    .or(`owner_user_id.eq.${ownerUserId},business_auth_user_id.eq.${ownerUserId}`)
    .maybeSingle();
  return (data as BusinessOrgPageRow | null) ?? null;
}

export function pageHasBillableAccess(page: Pick<BusinessOrgPageRow, "subscription_status" | "billing_disabled_at">): boolean {
  if (page.billing_disabled_at) return true;
  return page.subscription_status === "active" || page.subscription_status === "trialing";
}
