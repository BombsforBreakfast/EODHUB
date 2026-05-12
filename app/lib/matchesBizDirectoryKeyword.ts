import { coerceTagsFromDb } from "./bizListingTags";

export type BizDirectoryKeywordListing = {
  business_name: string | null;
  og_title: string | null;
  og_description: string | null;
  og_site_name: string | null;
  custom_blurb: string | null;
  website_url: string | null;
  tags?: unknown;
};

/**
 * Client-side filter for business/resource directory search boxes.
 * `listingTypeLabel` should match what callers put in haystack (e.g. normalizeBizListingTypeForListing).
 */
export function matchesBizDirectoryKeyword(
  listing: BizDirectoryKeywordListing,
  listingTypeLabel: string,
  keywordRaw: string,
): boolean {
  const needle = keywordRaw.trim().toLowerCase();
  if (!needle) return true;
  const terms = needle
    .split(",")
    .flatMap((part) => part.trim().split(/\s+/))
    .map((term) => term.trim())
    .filter(Boolean);
  const tagText = coerceTagsFromDb(listing.tags).join(" ");
  const haystack = [
    listing.business_name ?? "",
    listing.og_title ?? "",
    listing.og_description ?? "",
    listing.og_site_name ?? "",
    listing.custom_blurb ?? "",
    listing.website_url ?? "",
    listingTypeLabel,
    tagText,
  ]
    .join(" ")
    .toLowerCase();
  if (haystack.includes(needle)) return true;
  return terms.some((term) => haystack.includes(term));
}
