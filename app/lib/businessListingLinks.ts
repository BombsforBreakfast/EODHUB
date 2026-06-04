import type { SupabaseClient } from "@supabase/supabase-js";
import type { BusinessListingRow } from "../components/master/masterShared";
import type { BusinessOrgPageType } from "./businessOrgPages";

export type BusinessListingLinkTarget = {
  href: string;
  external: boolean;
  label: string;
};

export type BusinessSearchBadge = "Biz" | "Org";

export function businessListingSearchBadge(
  listing: Pick<BusinessListingRow, "listing_type" | "claimed_business_org_page_id">,
  pageTypeByPageId: Record<string, BusinessOrgPageType | null | undefined>,
): BusinessSearchBadge {
  const pageId = listing.claimed_business_org_page_id;
  if (pageId && pageTypeByPageId[pageId] === "organization") return "Org";
  if (listing.listing_type === "organization") return "Org";
  return "Biz";
}

export function resolveBusinessListingLinkTarget(
  listing: Pick<BusinessListingRow, "website_url" | "claimed_business_org_page_id">,
  linkedProfileByPageId: Record<string, string>,
): BusinessListingLinkTarget {
  const pageId = listing.claimed_business_org_page_id;
  if (pageId) {
    const profileUserId = linkedProfileByPageId[pageId];
    if (profileUserId) {
      return { href: `/profile/${profileUserId}`, external: false, label: "View Profile" };
    }
  }

  return { href: listing.website_url, external: true, label: "Visit Website" };
}

export async function loadBusinessListingProfileLinks(
  client: SupabaseClient,
  listings: Array<Pick<BusinessListingRow, "claimed_business_org_page_id">>,
): Promise<Record<string, string>> {
  const pageIds = [
    ...new Set(
      listings
        .map((row) => row.claimed_business_org_page_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];

  if (pageIds.length === 0) return {};

  const { data, error } = await client
    .from("business_organization_pages")
    .select("id, business_auth_user_id, owner_user_id")
    .in("id", pageIds);

  if (error) {
    console.error("Linked business profile load error:", error);
    return {};
  }

  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    const profileUserId =
      (row as { business_auth_user_id: string | null; owner_user_id: string }).business_auth_user_id ||
      (row as { owner_user_id: string }).owner_user_id;
    if (profileUserId) {
      map[(row as { id: string }).id] = profileUserId;
    }
  }

  return map;
}

export async function loadBusinessOrgPageTypesById(
  client: SupabaseClient,
  pageIds: string[],
): Promise<Record<string, BusinessOrgPageType | null>> {
  if (pageIds.length === 0) return {};

  const { data, error } = await client
    .from("business_organization_pages")
    .select("id, page_type")
    .in("id", pageIds);

  if (error) {
    console.error("Linked business page type load error:", error);
    return {};
  }

  const map: Record<string, BusinessOrgPageType | null> = {};
  for (const row of data ?? []) {
    const pageType = (row as { id: string; page_type: BusinessOrgPageType | null }).page_type;
    map[(row as { id: string }).id] = pageType ?? null;
  }
  return map;
}
