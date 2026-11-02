import "server-only";
import { supportStripe } from "./hubSupport";
import { supportContributorDetails, type ContributorDetails, type ContributorReference } from "../hubSupportContributor";
import { validMonthlyItem, type SupportSubscription } from "../hubSupportMonthly";
import { supportDb } from "./hubSupport";

type ContactStatus = "available" | "unavailable" | "different_mode";
const cache = new Map<string, { expires: number; details: ContributorDetails }>();
type ReportRow = ContributorReference & { refunded_cents: number; status: string; created_at: string; paid_at: string | null; frequency?: string; support_subscription_id?: string | null; disputed_cents?: number };

export async function supportSubscriberDetails(row: SupportSubscription, config: ReturnType<typeof supportStripe>): Promise<ContributorDetails | null> {
  if (row.livemode !== config.live || !row.stripe_subscription_id || !row.stripe_customer_id) return null;
  const key = `${row.livemode}:${row.stripe_subscription_id}:${row.amount_cents}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.details;
  const subscription = await config.stripe.subscriptions.retrieve(row.stripe_subscription_id, {}, { timeout: 2500, maxNetworkRetries: 0 });
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  if (subscription.livemode !== row.livemode || customerId !== row.stripe_customer_id || !validMonthlyItem(subscription.items.data, row.stripe_product_id, row.amount_cents)) return null;
  const customer = await config.stripe.customers.retrieve(customerId, {}, { timeout: 2500, maxNetworkRetries: 0 });
  if (customer.deleted || customer.livemode !== row.livemode) return null;
  const details = { contributor_name: customer.name || null, contributor_email: customer.email || null };
  if (cache.size >= 500) { const oldest = cache.keys().next().value; if (oldest) cache.delete(oldest); }
  cache.set(key, { expires: Date.now() + 300000, details });
  return details;
}

/** Called only after the exact owner-admin authorization check. Contact data
 * stays in Stripe, with a bounded five-minute in-memory cache for this report. */
export async function withSupportContributors(rows: ReportRow[]) {
  // Explicit response fields keep internal Checkout references out of report JSON.
  const items = rows.map(row => ({
    id: row.id, amount_cents: row.amount_cents, refunded_cents: row.refunded_cents,
    status: row.status, livemode: row.livemode, created_at: row.created_at, paid_at: row.paid_at,
    frequency: row.frequency ?? "one_time", disputed_cents: row.disputed_cents ?? 0,
    contributor_name: null as string | null, contributor_email: null as string | null,
    contributor_details_status: "unavailable" as ContactStatus,
  }));
  let config: ReturnType<typeof supportStripe>;
  try { config = supportStripe(); } catch { return items; }
  const ids = [...new Set(rows.flatMap(row => row.support_subscription_id ? [row.support_subscription_id] : []))];
  const monthlyRows = ids.length ? await supportDb().from("hub_support_subscriptions").select("*").in("id", ids) : null;
  const subscriptions = new Map<string, SupportSubscription>((monthlyRows?.data ?? []).map(row => [row.id, row]));
  const deadline = Date.now() + 8_000;
  // Bound concurrency and total wait; a Stripe outage must not hide payment totals.
  for (let start = 0; start < rows.length && Date.now() < deadline; start += 5) {
    await Promise.all(rows.slice(start, start + 5).map(async (row, offset) => {
      const item = items[start + offset];
      if (row.livemode !== config.live) { item.contributor_details_status = "different_mode"; return; }
      if (row.frequency === "monthly") {
        try {
          const subscription = subscriptions.get(row.support_subscription_id ?? "");
          const details = subscription ? await supportSubscriberDetails(subscription, config) : null;
          if (details) Object.assign(item, details, { contributor_details_status: "available" });
        } catch { /* Contact information must not hide the ledger. */ }
        return;
      }
      if (!row.checkout_session_id) return;
      const cacheKey = `${row.livemode}:${row.amount_cents}:${row.id}:${row.checkout_session_id}`;
      const previous = cache.get(cacheKey);
      if (previous && previous.expires > Date.now()) {
        Object.assign(item, previous.details, { contributor_details_status: "available" });
        return;
      }
      cache.delete(cacheKey);
      const timeout = Math.min(3_000, deadline - Date.now());
      if (timeout <= 0) return;
      try {
        const session = await config.stripe.checkout.sessions.retrieve(row.checkout_session_id, {}, { timeout, maxNetworkRetries: 0 });
        const details = supportContributorDetails(row, session);
        if (!details) return;
        if (cache.size >= 500) { const oldest = cache.keys().next().value; if (oldest) cache.delete(oldest); }
        cache.set(cacheKey, { expires: Date.now() + 5 * 60_000, details });
        Object.assign(item, details, { contributor_details_status: "available" });
      } catch { /* Keep the ledger usable without exposing provider errors or contact data. */ }
    }));
  }
  return items;
}
