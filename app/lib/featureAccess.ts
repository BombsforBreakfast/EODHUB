import { memberHasInteractionAccess, type MemberAccessInput } from "./subscriptionAccess";

export type FeatureAccess = {
  hasFullAccess: boolean;
  canViewFullJobs: boolean;
  canUseJobFilters: boolean;
  canViewFullBusinessDirectory: boolean;
  canUseDMs: boolean;
  canUseRabbitHole: boolean;
};

/** Full product access: active subscription, trial, beta window, admin, or employer account. */
export function getFeatureAccess(input: MemberAccessInput): FeatureAccess {
  const hasFullAccess = memberHasInteractionAccess(input);
  return {
    hasFullAccess,
    canViewFullJobs: hasFullAccess,
    canUseJobFilters: hasFullAccess,
    canViewFullBusinessDirectory: hasFullAccess,
    canUseDMs: hasFullAccess,
    canUseRabbitHole: hasFullAccess,
  };
}
