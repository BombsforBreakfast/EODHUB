import type { SupabaseClient } from "@supabase/supabase-js";
import { entitlementKeysFromRevenueCat } from "../../billing/entitlementKeys";
import {
  revenueCatEventRevokesEntitlement,
  revenueCatEventToSubscriptionStatus,
} from "../../billing/normalizeStatus";
import {
  isUuid,
  msToDate,
  recordBillingEvent,
  syncMemberEntitlementsFromSubscription,
  upsertBillingSubscription,
} from "./applyBilling";

export type RevenueCatWebhookEvent = {
  id?: string;
  type?: string;
  app_user_id?: string;
  product_id?: string;
  entitlement_ids?: string[] | null;
  period_type?: string | null;
  purchased_at_ms?: number | null;
  expiration_at_ms?: number | null;
  store?: string | null;
  transaction_id?: string | null;
  original_transaction_id?: string | null;
  cancel_reason?: string | null;
  environment?: string | null;
};

export type RevenueCatWebhookBody = {
  api_version?: string;
  event?: RevenueCatWebhookEvent;
};

const SKIP_EVENT_TYPES = new Set(["SUBSCRIBER_ALIAS", "TEST"]);

function storeToProvider(store: string | null | undefined): "apple" | "google" | null {
  if (store === "APP_STORE") return "apple";
  if (store === "PLAY_STORE") return "google";
  return null;
}

function verifyRevenueCatAuth(authHeader: string | null): boolean {
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET?.trim();
  if (!secret) return false;
  if (!authHeader) return false;
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  return bearer === secret;
}

export function isRevenueCatConfigured(): boolean {
  return Boolean(process.env.REVENUECAT_WEBHOOK_SECRET?.trim());
}

export async function handleRevenueCatWebhook(
  db: SupabaseClient,
  body: RevenueCatWebhookBody,
  authHeader: string | null,
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!verifyRevenueCatAuth(authHeader)) {
    return { status: 401, body: { error: "Unauthorized" } };
  }

  const event = body.event;
  if (!event?.id || !event.type) {
    return { status: 400, body: { error: "Missing event" } };
  }

  if (SKIP_EVENT_TYPES.has(event.type)) {
    await recordBillingEvent(db, {
      provider: "revenuecat",
      providerEventId: event.id,
      eventType: event.type,
      payload: body as Record<string, unknown>,
      processingResult: "skipped",
    });
    return { status: 200, body: { received: true, skipped: true } };
  }

  const { data: existingEvent } = await db
    .from("billing_events")
    .select("id")
    .eq("provider", "revenuecat")
    .eq("provider_event_id", event.id)
    .maybeSingle();

  if (existingEvent) {
    return { status: 200, body: { received: true, duplicate: true } };
  }

  if (!isUuid(event.app_user_id)) {
    await recordBillingEvent(db, {
      provider: "revenuecat",
      providerEventId: event.id,
      eventType: event.type,
      payload: body as Record<string, unknown>,
      processingResult: "skipped",
      errorMessage: "app_user_id is not a Supabase UUID",
    });
    return { status: 200, body: { received: true, ignored: true, reason: "invalid app_user_id" } };
  }

  const provider = storeToProvider(event.store);
  if (!provider) {
    await recordBillingEvent(db, {
      provider: "revenuecat",
      providerEventId: event.id,
      eventType: event.type,
      subjectType: "user",
      subjectId: event.app_user_id,
      payload: body as Record<string, unknown>,
      processingResult: "skipped",
      errorMessage: `Unsupported store: ${event.store ?? "unknown"}`,
    });
    return { status: 200, body: { received: true, skipped: true, reason: "unsupported store" } };
  }

  const productId = event.product_id?.trim() || "unknown";
  const providerSubscriptionId =
    event.original_transaction_id?.trim() ||
    event.transaction_id?.trim() ||
    `${event.type}:${event.id}`;

  const status = revenueCatEventToSubscriptionStatus(event.type, event.period_type);
  const entitlementKeys = entitlementKeysFromRevenueCat(event.entitlement_ids);
  const periodStart = msToDate(event.purchased_at_ms);
  const periodEnd = msToDate(event.expiration_at_ms);
  const revoke = revenueCatEventRevokesEntitlement(event.type);

  const { subscriptionId, error: subErr } = await upsertBillingSubscription(db, {
    subjectType: "user",
    subjectId: event.app_user_id,
    provider,
    providerCustomerId: event.app_user_id,
    providerSubscriptionId,
    productId,
    status,
    entitlementKeys,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    canceledAt: event.type === "CANCELLATION" ? new Date() : null,
    metadata: {
      revenuecat_event_id: event.id,
      revenuecat_event_type: event.type,
      store: event.store,
      environment: event.environment,
      cancel_reason: event.cancel_reason,
    },
  });

  if (subErr) {
    console.error("[revenuecat webhook] subscription upsert failed", subErr);
    return { status: 500, body: { error: subErr } };
  }

  const { error: entErr } = await syncMemberEntitlementsFromSubscription(db, {
    subjectId: event.app_user_id,
    subscriptionId,
    status,
    entitlementKeys,
    expiresAt: periodEnd,
    revoke,
  });

  if (entErr) {
    console.error("[revenuecat webhook] entitlement sync failed", entErr);
    await recordBillingEvent(db, {
      provider: "revenuecat",
      providerEventId: event.id,
      eventType: event.type,
      subjectType: "user",
      subjectId: event.app_user_id,
      payload: body as Record<string, unknown>,
      processingResult: "failed",
      errorMessage: entErr,
    });
    return { status: 500, body: { error: entErr } };
  }

  await recordBillingEvent(db, {
    provider: "revenuecat",
    providerEventId: event.id,
    eventType: event.type,
    subjectType: "user",
    subjectId: event.app_user_id,
    payload: body as Record<string, unknown>,
    processingResult: "applied",
  });

  return { status: 200, body: { received: true, applied: true } };
}
