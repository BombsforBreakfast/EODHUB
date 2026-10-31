import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { rentalListings, rentalOwners } from "./listings.server";
import { listingHasPaidAccess, propertySchema, type PropertyDraft } from "./provider";
import { analyticsDates, type AnalyticsProperty, type AnalyticsReport, type AnalyticsDay, type AnalyticsSubject } from "./analytics";
import { checkDb, RentalError } from "./portal.server";
import { rentalModerationHold } from "./moderation.server";

const advertiser: AnalyticsProperty = { id: "eod_home_buying", ownerId: "eod_home_buying", owner: "EOD Home Buying", address: "Rentals page · after property listings", state: "", city: "" };
type CatalogRow = { id: string; provider_id: string; published: PropertyDraft | null; draft: PropertyDraft; provider: { full_name: string; company: string } };

export async function analyticsCatalog(db: SupabaseClient, providerId?: string): Promise<AnalyticsProperty[]> {
  const items: AnalyticsProperty[] = providerId ? [] : rentalListings.map(p => ({ id: p.id, ownerId: p.ownerId, owner: rentalOwners.find(o => o.id === p.ownerId)?.name ?? "Property owner", address: p.address, state: p.state, city: p.city }));
  for (let offset = 0; ; offset += 1000) {
    let query = db.from("rental_properties").select("id,provider_id,published,draft,provider:rental_providers!inner(full_name,company)").order("id");
    if (providerId) query = query.eq("provider_id", providerId);
    const { data, error } = await query.range(offset, offset + 999); checkDb(error);
    for (const row of (data ?? []) as unknown as CatalogRow[]) {
      const p = row.published ?? row.draft;
      items.push({ id: row.id, ownerId: row.provider_id, owner: row.provider.company || row.provider.full_name, address: p.address || p.title || "Draft property", state: p.state || "", city: p.city || "" });
    }
    if ((data?.length ?? 0) < 1000) break;
    if (offset >= 9000) throw new RentalError("Narrow the owner selection to load this inventory.", 422);
  }
  return items;
}
export async function rentalAnalyticsReport(db: SupabaseClient, params: URLSearchParams, providerId?: string): Promise<AnalyticsReport> {
  let range: { start: string; end: string };
  try { range = analyticsDates(params.get("start"), params.get("end")); } catch (e) { throw new RentalError((e as Error).message); }
  const subject = z.enum(["property", "advertiser"]).parse(params.get("subject") ?? "property") as AnalyticsSubject;
  if (providerId && subject !== "property") throw new RentalError("Only your own property analytics are available.", 403);
  const properties = subject === "advertiser" ? [advertiser] : await analyticsCatalog(db, providerId);
  const owner = params.get("owner") || "", property = params.get("property") || "", state = params.get("state") || "";
  if ((providerId && owner && owner !== providerId) || (property && !properties.some(p => p.id === property))) throw new RentalError("Property analytics not found.", 404);
  const selected = properties.filter(p => (!owner || p.ownerId === owner) && (!property || p.id === property) && (!state || p.state === state));
  const rows: AnalyticsDay[] = [];
  // Explicit pagination avoids Supabase's default row cap silently losing daily data.
  for (let chunk = 0; chunk < selected.length; chunk += 100) for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from("rental_engagement_daily").select("subject_id,day,impressions,property_opens,contact_opens,email_copies,phone_clicks,application_clicks,ad_clicks").eq("subject_type", subject).in("subject_id", selected.slice(chunk, chunk + 100).map(p => p.id)).gte("day", range.start).lte("day", range.end).order("day").order("subject_id").range(offset, offset + 999);
    if (error?.code === "42P01" || error?.code === "PGRST205") throw new RentalError("Analytics is being set up. Please check back soon.", 503);
    checkDb(error); rows.push(...((data ?? []) as AnalyticsDay[]));
    if (rows.length > 200000) throw new RentalError("Choose a shorter date range or fewer properties for this report.", 422);
    if ((data?.length ?? 0) < 1000) break;
  }
  return { ...range, subject, generatedAt: new Date().toISOString(), properties, selected, owners: [...new Map(properties.map(p => [p.ownerId, { id: p.ownerId, name: p.owner }])).values()].sort((a, b) => a.name.localeCompare(b.name)), rows };
}

export async function engagementOwner(db: SupabaseClient, subject: AnalyticsSubject, id: string): Promise<string | null> {
  if (subject === "advertiser") return id === advertiser.id ? advertiser.ownerId : null;
  if (await rentalModerationHold(db,id)) return null;
  const legacy = rentalListings.find(p => p.id === id);
  if (legacy) return legacy.ownerId;
  if (!z.uuid().safeParse(id).success) return null;
  const { data: p, error } = await db.from("rental_properties").select("*,provider:rental_providers!inner(status)").eq("id", id).maybeSingle(); checkDb(error);
  return p && !p.hidden && p.provider.status === "approved" && listingHasPaidAccess(p) && propertySchema.safeParse(p.published).success ? p.provider_id : null;
}
