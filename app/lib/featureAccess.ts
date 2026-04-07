export type AccessTier = "basic" | "senior" | "master";

export type FeatureAccess = {
  tier: AccessTier;
  isBetaDefaultTier: boolean;
  canViewFullJobs: boolean;
  canUseJobFilters: boolean;
  canViewFullBusinessDirectory: boolean;
  canUseDMs: boolean;
  canUseRabbitHole: boolean;
};

/**
 * Beta phase behavior: if no tier is set, default effective access to Senior.
 * TODO: tighten this once billing/tier assignment is fully live.
 */
export function getEffectiveTier(rawTier: string | null | undefined): {
  tier: AccessTier;
  isBetaDefaultTier: boolean;
} {
  if (rawTier === "basic" || rawTier === "senior" || rawTier === "master") {
    return { tier: rawTier, isBetaDefaultTier: false };
  }
  return { tier: "senior", isBetaDefaultTier: true };
}

export function getFeatureAccess(rawTier: string | null | undefined): FeatureAccess {
  const effective = getEffectiveTier(rawTier);
  const isSeniorPlus = effective.tier === "senior" || effective.tier === "master";

  return {
    tier: effective.tier,
    isBetaDefaultTier: effective.isBetaDefaultTier,
    canViewFullJobs: isSeniorPlus,
    canUseJobFilters: isSeniorPlus,
    canViewFullBusinessDirectory: isSeniorPlus,
    canUseDMs: isSeniorPlus,
    canUseRabbitHole: isSeniorPlus,
  };
}
