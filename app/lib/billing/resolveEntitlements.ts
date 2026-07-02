import type { SupabaseClient } from "@supabase/supabase-js";
import { EODHUB_MEMBER_ENTITLEMENT } from "./entitlementKeys";
import {
  isPaidSubscriptionStatus,
  memberHasInteractionAccess,
  type MemberAccessInput,
} from "../subscriptionAccess";

export type ResolvedEntitlements = {
  eodhubMember: boolean;
  sources: {
    billingEntitlement: boolean;
    legacyProfileStatus: boolean;
    promotionalTrial: boolean;
  };
};

type EntitlementRow = {
  entitlement_key: string;
  status: string;
  expires_at: string | null;
};

/**
 * Authoritative entitlement resolver. Reads billing_entitlements first,
 * falls back to legacy profiles.subscription_status during migration.
 */
export async function resolveEntitlements(
  db: SupabaseClient,
  input: MemberAccessInput & { userId: string },
): Promise<ResolvedEntitlements> {
  const now = input.now ?? new Date();

  const { data: entitlementRows } = await db
    .from("billing_entitlements")
    .select("entitlement_key, status, expires_at")
    .eq("subject_type", "user")
    .eq("subject_id", input.userId)
    .eq("entitlement_key", EODHUB_MEMBER_ENTITLEMENT)
    .maybeSingle();

  const billingEntitlement = isActiveEntitlementRow(entitlementRows as EntitlementRow | null, now);

  const legacyProfileStatus = isPaidSubscriptionStatus(input.subscriptionStatus);

  const promotionalTrial =
    !billingEntitlement &&
    !legacyProfileStatus &&
    !input.isAdmin &&
    input.accountType !== "employer" &&
    memberHasInteractionAccess({
      accountType: input.accountType,
      subscriptionStatus: null,
      authUserCreatedAtIso: input.authUserCreatedAtIso,
      isAdmin: false,
      now,
    });

  const eodhubMember =
    input.isAdmin === true ||
    input.accountType === "employer" ||
    billingEntitlement ||
    legacyProfileStatus ||
    promotionalTrial;

  return {
    eodhubMember,
    sources: {
      billingEntitlement,
      legacyProfileStatus,
      promotionalTrial,
    },
  };
}

function isActiveEntitlementRow(row: EntitlementRow | null, now: Date): boolean {
  if (!row || row.status !== "active") return false;
  if (!row.expires_at) return true;
  const expiresAt = new Date(row.expires_at);
  return !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() > now.getTime();
}

export function hasEntitlement(resolved: ResolvedEntitlements, key: typeof EODHUB_MEMBER_ENTITLEMENT): boolean {
  if (key === EODHUB_MEMBER_ENTITLEMENT) return resolved.eodhubMember;
  return false;
}
