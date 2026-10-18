import type Stripe from "stripe";
import { HUB_SUPPORT_PURPOSE } from "./hubSupport";

export type ContributorReference = { id: string; amount_cents: number; livemode: boolean; checkout_session_id: string | null };
export type ContributorDetails = { contributor_name: string | null; contributor_email: string | null };
export type ContributorSession = Pick<Stripe.Checkout.Session, "id" | "metadata" | "mode" | "currency" | "amount_total" | "livemode" | "payment_status"> & {
  customer_email?: string | null;
  customer_details?: { individual_name?: string | null; name?: string | null; email?: string | null } | null;
  collected_information?: { individual_name?: string | null } | null;
};

/** Never attach contact details from another payment, purpose, or environment. */
export function supportContributorDetails(row: ContributorReference, session: ContributorSession): ContributorDetails | null {
  if (session.id !== row.checkout_session_id || session.metadata?.purpose !== HUB_SUPPORT_PURPOSE ||
      session.metadata?.contribution_id !== row.id || session.livemode !== row.livemode ||
      session.amount_total !== row.amount_cents || session.currency !== "usd" ||
      session.mode !== "payment" || session.payment_status !== "paid") return null;
  const clean = (value: string | null | undefined, max: number) => value?.trim().slice(0, max) || null;
  return {
    contributor_name: clean(session.collected_information?.individual_name, 200) || clean(session.customer_details?.individual_name, 200) || clean(session.customer_details?.name, 200),
    contributor_email: clean(session.customer_details?.email, 320) || clean(session.customer_email, 320),
  };
}
