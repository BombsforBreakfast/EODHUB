import type { SupabaseClient } from "@supabase/supabase-js";
import { EODHUB_MEMBER_ENTITLEMENT } from "../../billing/entitlementKeys";
import {
  type BillingSubscriptionStatus,
  subscriptionStatusGrantsEntitlement,
} from "../../billing/normalizeStatus";

export type UpsertBillingSubscriptionInput = {
  subjectType: "user" | "business_org_page";
  subjectId: string;
  provider: "stripe" | "apple" | "google";
  providerCustomerId?: string | null;
  providerSubscriptionId: string;
  productId: string;
  status: BillingSubscriptionStatus;
  entitlementKeys?: string[];
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  trialEnd?: Date | null;
  canceledAt?: Date | null;
  metadata?: Record<string, unknown>;
};

export async function upsertBillingSubscription(
  db: SupabaseClient,
  input: UpsertBillingSubscriptionInput,
): Promise<{ subscriptionId: string | null; error: string | null }> {
  const nowIso = new Date().toISOString();
  const row = {
    subject_type: input.subjectType,
    subject_id: input.subjectId,
    provider: input.provider,
    provider_customer_id: input.providerCustomerId ?? null,
    provider_subscription_id: input.providerSubscriptionId,
    product_id: input.productId,
    status: input.status,
    entitlement_keys: input.entitlementKeys ?? [EODHUB_MEMBER_ENTITLEMENT],
    current_period_start: input.currentPeriodStart?.toISOString() ?? null,
    current_period_end: input.currentPeriodEnd?.toISOString() ?? null,
    trial_end: input.trialEnd?.toISOString() ?? null,
    canceled_at: input.canceledAt?.toISOString() ?? null,
    last_verified_at: nowIso,
    metadata: input.metadata ?? {},
    updated_at: nowIso,
  };

  const { data, error } = await db
    .from("billing_subscriptions")
    .upsert(row, { onConflict: "provider,provider_subscription_id" })
    .select("id")
    .maybeSingle();

  if (error) return { subscriptionId: null, error: error.message };
  return { subscriptionId: data?.id ?? null, error: null };
}

export async function upsertBillingEntitlement(
  db: SupabaseClient,
  input: {
    subjectType: "user" | "business_org_page";
    subjectId: string;
    entitlementKey: string;
    status: "active" | "expired";
    expiresAt?: Date | null;
    sourceSubscriptionId?: string | null;
  },
): Promise<{ error: string | null }> {
  const { error } = await db.from("billing_entitlements").upsert(
    {
      subject_type: input.subjectType,
      subject_id: input.subjectId,
      entitlement_key: input.entitlementKey,
      status: input.status,
      expires_at: input.expiresAt?.toISOString() ?? null,
      source_subscription_id: input.sourceSubscriptionId ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "subject_type,subject_id,entitlement_key" },
  );

  return { error: error?.message ?? null };
}

export async function syncMemberEntitlementsFromSubscription(
  db: SupabaseClient,
  input: {
    subjectId: string;
    subscriptionId: string | null;
    status: BillingSubscriptionStatus;
    entitlementKeys: string[];
    expiresAt?: Date | null;
    revoke?: boolean;
  },
): Promise<{ error: string | null }> {
  const grant = !input.revoke && subscriptionStatusGrantsEntitlement(input.status);
  for (const key of input.entitlementKeys) {
    const { error } = await upsertBillingEntitlement(db, {
      subjectType: "user",
      subjectId: input.subjectId,
      entitlementKey: key,
      status: grant ? "active" : "expired",
      expiresAt: grant ? input.expiresAt : new Date(),
      sourceSubscriptionId: input.subscriptionId,
    });
    if (error) return { error };
  }
  return { error: null };
}

export async function recordBillingEvent(
  db: SupabaseClient,
  input: {
    provider: "stripe" | "revenuecat";
    providerEventId: string;
    eventType: string;
    subjectType?: "user" | "business_org_page" | null;
    subjectId?: string | null;
    payload: Record<string, unknown>;
    processingResult: "applied" | "skipped" | "failed";
    errorMessage?: string | null;
  },
): Promise<{ inserted: boolean; error: string | null }> {
  const { error } = await db.from("billing_events").insert({
    provider: input.provider,
    provider_event_id: input.providerEventId,
    event_type: input.eventType,
    subject_type: input.subjectType ?? null,
    subject_id: input.subjectId ?? null,
    payload: input.payload,
    processing_result: input.processingResult,
    error_message: input.errorMessage ?? null,
  });

  if (error) {
    if (error.code === "23505") return { inserted: false, error: null };
    return { inserted: false, error: error.message };
  }
  return { inserted: true, error: null };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function msToDate(ms: number | null | undefined): Date | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  return new Date(ms);
}
