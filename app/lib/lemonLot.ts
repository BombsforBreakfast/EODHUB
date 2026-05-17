/** Lemon Lot (community classifieds) — shared constants and helpers. */

export const LEMON_LOT_CATEGORIES = [
  { id: "housing", label: "Housing" },
  { id: "rentals", label: "Rentals" },
  { id: "pcs", label: "PCS / moving" },
  { id: "vehicles", label: "Vehicles" },
  { id: "motorcycles", label: "Motorcycles" },
  { id: "services", label: "Services" },
  { id: "side_work", label: "Side work" },
  { id: "gear", label: "Gear" },
  { id: "furniture", label: "Furniture" },
  { id: "misc", label: "Misc" },
] as const;

export type LemonLotCategoryId = (typeof LEMON_LOT_CATEGORIES)[number]["id"];

export const LEMON_LOT_BADGE_OPTIONS = [
  "PCS Sale",
  "Local Pickup",
  "Service Offered",
  "Looking For",
  "Urgent",
  "Available Now",
] as const;

export type MarketplaceListingMode = "native" | "external";
export type MarketplaceListingStatus = "active" | "expired" | "removed";

export type MarketplaceListingRow = {
  id: string;
  user_id: string;
  listing_mode: MarketplaceListingMode;
  category: string;
  subcategory: string | null;
  title: string;
  description: string | null;
  manual_notes: string | null;
  price: string | null;
  location: string | null;
  mileage: number | null;
  external_url: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  og_site_name: string | null;
  /** User uploads (public URLs), max 10; shown before OG scrape image on cards. */
  gallery_images?: string[] | null;
  status: MarketplaceListingStatus;
  expires_at: string;
  created_at: string;
  updated_at: string;
  approved: boolean;
  featured: boolean;
  tags: string[] | null;
};

const LISTING_URL_PATH = "/lemon-lot?listing=";

export function lemonLotListingUrl(origin: string, listingId: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}${LISTING_URL_PATH}${listingId}`;
}

/** Match listing deep link in message text (absolute or site-relative). */
export function parseLemonLotListingId(content: string): string | null {
  if (!content.includes("/lemon-lot")) return null;
  const m = content.match(/\/lemon-lot\?(?:[^#\s]*&)*listing=([0-9a-fA-F-]{36})/i)
    ?? content.match(/\/lemon-lot\?listing=([0-9a-fA-F-]{36})(?:&|[#\s]|$)/i);
  return m?.[1] ?? null;
}

export function stripLemonLotListingUrl(content: string): string {
  return content
    .replace(/\n?https?:\/\/[^\s]+\/lemon-lot\?[^\s]*listing=[0-9a-fA-F-]{36}/gi, "")
    .replace(/\n?\/lemon-lot\?[^\s]*listing=[0-9a-fA-F-]{36}/gi, "")
    .trim();
}

export function displayListingTitle(row: Pick<MarketplaceListingRow, "title" | "og_title" | "listing_mode">): string {
  const t = row.title?.trim();
  if (t) return t;
  return row.og_title?.trim() || "Listing";
}

/** Normalized user gallery (max 10 public URLs). */
export function coerceGalleryImages(raw: string[] | null | undefined): string[] {
  return (raw ?? []).map((s) => s?.trim()).filter((s): s is string => Boolean(s)).slice(0, 10);
}

/** Images for the listing card: uploaded gallery first, else single OG image. */
export function listingCardImageUrls(row: Pick<MarketplaceListingRow, "gallery_images" | "og_image">): string[] {
  const g = coerceGalleryImages(row.gallery_images);
  if (g.length > 0) return g;
  const og = row.og_image?.trim();
  return og ? [og] : [];
}

/** Full-screen gallery: user photos then OG scrape (if not duplicate), for detail / lightbox. */
export function listingDetailImageUrls(row: Pick<MarketplaceListingRow, "gallery_images" | "og_image">): string[] {
  const g = coerceGalleryImages(row.gallery_images);
  const og = row.og_image?.trim();
  if (!og) return g;
  if (g.some((u) => u === og)) return g;
  return [...g, og];
}

export function displayListingImage(row: MarketplaceListingRow): string | null {
  const urls = listingCardImageUrls(row);
  return urls[0] ?? null;
}

export function displayListingDescription(row: MarketplaceListingRow): string | null {
  return row.description?.trim() || row.og_description?.trim() || null;
}

export function daysUntilExpiryUtc(expiresAt: string): number {
  const end = new Date(expiresAt).getTime();
  const diff = end - Date.now();
  return Math.floor(diff / 86400000);
}

export function isPubliclyLive(row: Pick<MarketplaceListingRow, "status" | "approved" | "expires_at">): boolean {
  if (row.status !== "active" || !row.approved) return false;
  return new Date(row.expires_at).getTime() > Date.now();
}

export function coerceListingTags(raw: string[] | null | undefined): string[] {
  const allowed = new Set(LEMON_LOT_BADGE_OPTIONS as unknown as string[]);
  return (raw ?? []).filter((t) => typeof t === "string" && allowed.has(t)).slice(0, 6);
}

export function parsePriceFilterNumber(raw: string): number | null {
  const n = Number.parseFloat(raw.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Strip HTML / collapse whitespace for full-text style matching on listing copy. */
export function lemonLotPlainSearchText(htmlOrPlain: string | null | undefined): string {
  if (htmlOrPlain == null) return "";
  return htmlOrPlain
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Flat string used for client-side keyword search (title, body HTML, tags, OG fields, location, price, etc.). */
export function listingSearchHaystack(row: MarketplaceListingRow): string {
  const chunks: string[] = [];
  const push = (s: string | null | undefined) => {
    const x = typeof s === "string" ? lemonLotPlainSearchText(s) : "";
    if (x) chunks.push(x);
  };
  push(row.title);
  push(displayListingTitle(row));
  push(row.description);
  push(row.manual_notes);
  push(row.og_title);
  push(row.og_description);
  push(row.og_site_name);
  const disp = displayListingDescription(row);
  if (disp) push(disp);
  push(row.location);
  push(row.price);
  push(row.subcategory);
  push(row.external_url);
  for (const tag of row.tags ?? []) {
    if (typeof tag === "string" && tag.trim()) push(tag);
  }
  return chunks.join(" ");
}

/** Space-separated tokens (AND): every token must appear somewhere in the listing haystack. */
export function listingMatchesLemonLotKeyword(keyword: string, row: MarketplaceListingRow): boolean {
  const q = keyword.trim().toLowerCase();
  if (!q) return true;
  const tokens = q.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) return true;
  const hay = listingSearchHaystack(row);
  return tokens.every((token) => hay.includes(token));
}
