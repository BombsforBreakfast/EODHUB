import "server-only";
import { supportStripe } from "./hubSupport";
import { supportContributorDetails, type ContributorDetails, type ContributorReference } from "../hubSupportContributor";

type ContactStatus = "available" | "unavailable" | "different_mode";
const cache = new Map<string, { expires: number; details: ContributorDetails }>();
type ReportRow = ContributorReference & { refunded_cents: number; status: string; created_at: string; paid_at: string | null };

/** Called only after the exact owner-admin authorization check. Contact data
 * stays in Stripe, with a bounded five-minute in-memory cache for this report. */
export async function withSupportContributors(rows: ReportRow[]) {
  // Explicit response fields keep internal Checkout references out of report JSON.
  const items = rows.map(row => ({
    id: row.id, amount_cents: row.amount_cents, refunded_cents: row.refunded_cents,
    status: row.status, livemode: row.livemode, created_at: row.created_at, paid_at: row.paid_at,
    contributor_name: null as string | null, contributor_email: null as string | null,
    contributor_details_status: "unavailable" as ContactStatus,
  }));
  let config: ReturnType<typeof supportStripe>;
  try { config = supportStripe(); } catch { return items; }
  const deadline = Date.now() + 8_000;
  // Bound concurrency and total wait; a Stripe outage must not hide payment totals.
  for (let start = 0; start < rows.length && Date.now() < deadline; start += 5) {
    await Promise.all(rows.slice(start, start + 5).map(async (row, offset) => {
      const item = items[start + offset];
      if (row.livemode !== config.live) { item.contributor_details_status = "different_mode"; return; }
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
