import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { RENTAL_COMMITMENT_VERSION, propertySchema, listingHasPaidAccess, type PropertyRow } from "@/app/lib/rentals/provider";
import { rentalProvider, rentalBody, rentalFailure, rentalJson, rentalLimit, RentalError, ensureSameOrigin, checkDb } from "@/app/lib/rentals/portal.server";
import { startRentalOrder, finishRentalOrder, rentalStripe, rentalBillingPortal, rentalBillingReady } from "@/app/lib/rentals/billing.server";
import { rentalAdminEmail } from "@/app/lib/rentals/notifications.server";
export const dynamic = "force-dynamic";
const uuid = z.uuid();

export async function GET(request: NextRequest) {
  try {
    const { db, provider } = await rentalProvider(request, false);
    const [properties, campaigns, metrics] = await Promise.all([
      db.from("rental_properties").select("*").eq("provider_id", provider.user_id).order("created_at", { ascending: false }).limit(1000),
      db.from("rental_campaigns").select("*").eq("provider_id", provider.user_id).order("created_at", { ascending: false }).limit(1000),
      db.from("rental_properties").select("id,rental_property_metrics(day,views,contacts)").eq("provider_id", provider.user_id).limit(1000),
    ]);
    checkDb(properties.error); checkDb(campaigns.error); checkDb(metrics.error);
    const paths = new Set<string>();
    for (const p of properties.data ?? []) for (const version of [p.draft, p.submitted, p.published]) for (const path of version?.photos ?? []) if (typeof path === "string" && path.startsWith(`${provider.user_id}/photos/`)) paths.add(path);
    for (const c of campaigns.data ?? []) for (const path of [c.flyer_path, c.report_path]) if (path?.startsWith(`${provider.user_id}/`)) paths.add(path);
    const signed = paths.size ? await db.storage.from("rental-assets").createSignedUrls([...paths], 3600) : { data: [], error: null };
    checkDb(signed.error);
    const urls = Object.fromEntries((signed.data ?? []).filter(p => p.path && p.signedUrl).map(p => [p.path, p.signedUrl]));
    return rentalJson({ billingReady:rentalBillingReady(), provider, properties: properties.data, campaigns: campaigns.data, metrics: metrics.data, urls });
  } catch (error) { return rentalFailure(error); }
}

export async function POST(request: NextRequest) {
  try {
    ensureSameOrigin(request);
    const { db, provider } = await rentalProvider(request), body = await rentalBody(request);
    await rentalLimit(db, request, `rental-write:${provider.user_id}`, 120);
    if (body.action === "checkout") {
      const items = z.array(z.object({ id: uuid, plan: z.enum(["monthly", "annual"]), autoRenew: z.boolean(), campaign: z.boolean() })).min(1).max(50).parse(body.items);
      if (body.consent !== true) throw new RentalError("Authorize approval-based charges and your selected renewal choices.");
      const origin = process.env.NODE_ENV === "production" ? "https://eod-hub.com" : new URL(request.url).origin;
      return rentalJson({ url: await startRentalOrder(db, provider, items, origin) });
    }
    if (body.action === "confirm_checkout") {
      const session = await rentalStripe().checkout.sessions.retrieve(z.string().regex(/^cs_/).parse(body.sessionId), { expand: ["setup_intent"] });
      await finishRentalOrder(db, session, provider.user_id); return rentalJson({ ok: true });
    }
    if (body.action === "cancel_checkout") {
      const { data: orders, error } = await db.from("rental_orders").select("id,stripe_session_id").eq("provider_id", provider.user_id).eq("status", "setup_pending"); checkDb(error);
      for (const order of orders ?? []) {
        if (order.stripe_session_id) {
          const session = await rentalStripe().checkout.sessions.retrieve(order.stripe_session_id);
          if (session.status === "complete") { await finishRentalOrder(db, session, provider.user_id); continue; }
          if (session.status === "open") await rentalStripe().checkout.sessions.expire(session.id);
        }
        checkDb((await db.from("rental_properties").update({ setup_order_id: null }).eq("setup_order_id", order.id).eq("provider_id", provider.user_id)).error);
        checkDb((await db.from("rental_orders").update({ status: "canceled" }).eq("id", order.id).eq("status", "setup_pending")).error);
      }
      return rentalJson({ ok: true });
    }
    if (body.action === "billing_portal") {
      if (!provider.stripe_customer_id) throw new RentalError("There is no billing account yet.");
      const session = await rentalBillingPortal(provider.stripe_customer_id);
      return rentalJson({ url: session.url });
    }
    if (body.action === "save" && !body.id) {
      const draft = cleanDraft(body.draft, provider.user_id);
      const { data, error } = await db.from("rental_properties").insert({ provider_id: provider.user_id, draft }).select("id").single(); checkDb(error);
      return rentalJson({ ok: true, id: data?.id });
    }
    const id = uuid.parse(body.id);
    const { data: property, error } = await db.from("rental_properties").select("*").eq("id", id).eq("provider_id", provider.user_id).maybeSingle(); checkDb(error);
    if (!property) throw new RentalError("Property not found.", 404);
    const row = property as PropertyRow;
    if (body.action === "availability") {
      const status = z.enum(["available-now", "pending", "unavailable"]).parse(body.status);
      const date = body.date ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(body.date) : null;
      if (date && (!Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0,10) !== date)) throw new RentalError("Enter a valid availability date.");
      checkDb((await db.from("rental_properties").update({ status, available_date: date, updated_at: new Date().toISOString() }).eq("id", id).eq("provider_id", provider.user_id)).error);
    } else if (body.action === "hide") {
      checkDb((await db.from("rental_properties").update({ hidden: z.boolean().parse(body.hidden) }).eq("id", id).eq("provider_id", provider.user_id)).error);
    } else if (body.action === "cancel_renewal") {
      if (row.stripe_subscription_id) {
        const stripe = rentalStripe(), sub = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
        if (sub.metadata.rental_provider_id !== provider.user_id) throw new RentalError("Subscription does not belong to your account.", 403);
        if (sub.status !== "canceled") await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
      }
      checkDb((await db.from("rental_properties").update({ auto_renew: false }).eq("id", id).eq("provider_id", provider.user_id)).error);
    } else if (body.action === "save") {
      if (row.review_status === "pending" || property.setup_order_id || (row.review_status === "approved" && !row.published)) throw new RentalError("This version is being reviewed or activated. Availability can still be updated.", 409);
      const revision = z.number().int().positive().parse(body.revision), draft = cleanDraft(body.draft, provider.user_id);
      const result = await db.from("rental_properties").update({ draft, revision: revision + 1, review_status: "draft", updated_at: new Date().toISOString() }).eq("id", id).eq("provider_id", provider.user_id).eq("revision", revision).is("setup_order_id", null).neq("review_status", "pending").select("id");
      checkDb(result.error); if (result.data?.length !== 1) throw new RentalError("This property changed in another window. Refresh and retry.", 409);
    } else if (body.action === "submit_edit") {
      if (!row.published || !listingHasPaidAccess(row)) throw new RentalError("Add this property to your cart to start a new paid listing term.");
      if (row.review_status === "pending" || property.setup_order_id) throw new RentalError("This property is already being reviewed.", 409);
      const submitted = propertySchema.parse(row.draft);
      if (submitted.photos.some(p => !p.startsWith(`${provider.user_id}/photos/`))) throw new RentalError("Use your own uploaded photos.", 403);
      const result = await db.from("rental_properties").update({ submitted, submission_id: randomUUID(), review_status: "pending", review_note: null, commitment_at: new Date().toISOString(), commitment_version: RENTAL_COMMITMENT_VERSION }).eq("id", id).eq("provider_id", provider.user_id).eq("revision", row.revision).neq("review_status", "pending").select("id");
      checkDb(result.error); if (result.data?.length !== 1) throw new RentalError("The property changed. Refresh and retry.", 409);
      await rentalAdminEmail("Listing changes ready for review", "A rental provider submitted changes to an active listing. Review them in Admin → Rentals.");
    } else throw new RentalError("Unknown property action.");
    return rentalJson({ ok: true, id });
  } catch (error) { return rentalFailure(error); }
}

function cleanDraft(value: unknown, owner: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RentalError("Invalid property details.");
  const draft = Object.fromEntries(Object.entries(value).filter(([key]) => key in propertySchema.shape));
  if (draft.photos !== undefined && (!Array.isArray(draft.photos) || draft.photos.length > 100 || draft.photos.some((p: unknown) => typeof p !== "string" || !p.startsWith(`${owner}/photos/`) || !/^[0-9a-f-]{36}\/photos\/[0-9a-f-]{36}\.webp$/.test(p)))) throw new RentalError("Use photos uploaded by your account.");
  return draft;
}
