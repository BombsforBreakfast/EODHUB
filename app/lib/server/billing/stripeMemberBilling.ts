import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { EODHUB_MEMBER_ENTITLEMENT } from "../../billing/entitlementKeys";
import {
  normalizeStripeSubscriptionStatus,
  stripeStatusGrantsMemberAccess,
} from "../../billing/normalizeStatus";
import {
  recordBillingEvent,
  syncMemberEntitlementsFromSubscription,
  upsertBillingSubscription,
} from "./applyBilling";

type StripeSubscriptionPeriod = Stripe.Subscription & {
  current_period_start?: number | null;
  current_period_end?: number | null;
  trial_end?: number | null;
  canceled_at?: number | null;
};

function stripeUnixToDate(seconds: number | null | undefined): Date | null {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000);
}

export async function syncStripeMemberSubscription(
  db: SupabaseClient,
  event: Stripe.Event,
  sub: Stripe.Subscription,
  userId: string,
): Promise<void> {
  const { data: existingEvent } = await db
    .from("billing_events")
    .select("id")
    .eq("provider", "stripe")
    .eq("provider_event_id", event.id)
    .maybeSingle();

  if (existingEvent) return;

  const status = normalizeStripeSubscriptionStatus(sub.status);
  const periodSub = sub as StripeSubscriptionPeriod;
  const productId =
    sub.items.data[0]?.price?.id ??
    process.env.STRIPE_PRICE_ID ??
    "stripe_member_subscription";

  const { subscriptionId, error: subErr } = await upsertBillingSubscription(db, {
    subjectType: "user",
    subjectId: userId,
    provider: "stripe",
    providerCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null,
    providerSubscriptionId: sub.id,
    productId,
    status,
    entitlementKeys: [EODHUB_MEMBER_ENTITLEMENT],
    currentPeriodStart: stripeUnixToDate(periodSub.current_period_start),
    currentPeriodEnd: stripeUnixToDate(periodSub.current_period_end),
    trialEnd: stripeUnixToDate(periodSub.trial_end),
    canceledAt: stripeUnixToDate(periodSub.canceled_at),
    metadata: {
      stripe_event_id: event.id,
      stripe_event_type: event.type,
      stripe_status: sub.status,
    },
  });

  if (subErr) {
    console.error("[stripe webhook] billing_subscriptions upsert failed", subErr);
    await recordBillingEvent(db, {
      provider: "stripe",
      providerEventId: event.id,
      eventType: event.type,
      subjectType: "user",
      subjectId: userId,
      payload: event as unknown as Record<string, unknown>,
      processingResult: "failed",
      errorMessage: subErr,
    });
    return;
  }

  const grant = stripeStatusGrantsMemberAccess(status);
  const { error: entErr } = await syncMemberEntitlementsFromSubscription(db, {
    subjectId: userId,
    subscriptionId,
    status,
    entitlementKeys: [EODHUB_MEMBER_ENTITLEMENT],
    expiresAt: stripeUnixToDate(periodSub.current_period_end),
    revoke: !grant,
  });

  if (entErr) {
    console.error("[stripe webhook] billing_entitlements sync failed", entErr);
    await recordBillingEvent(db, {
      provider: "stripe",
      providerEventId: event.id,
      eventType: event.type,
      subjectType: "user",
      subjectId: userId,
      payload: event as unknown as Record<string, unknown>,
      processingResult: "failed",
      errorMessage: entErr,
    });
    return;
  }

  await recordBillingEvent(db, {
    provider: "stripe",
    providerEventId: event.id,
    eventType: event.type,
    subjectType: "user",
    subjectId: userId,
    payload: event as unknown as Record<string, unknown>,
    processingResult: "applied",
  });
}

export async function lookupUserIdByStripeCustomer(
  db: SupabaseClient,
  customerId: string,
): Promise<string | null> {
  const { data: profile } = await db
    .from("profiles")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  return profile?.user_id ?? null;
}
