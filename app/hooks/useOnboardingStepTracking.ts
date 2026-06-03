"use client";

import { useEffect } from "react";
import { trackOnboardingStep, type OnboardingFunnelStep } from "../lib/onboardingAnalytics";

/** Record a single onboarding funnel step once per mount. */
export function useOnboardingStepTracking(
  step: OnboardingFunnelStep,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return;
    trackOnboardingStep(step, "view");
  }, [step, enabled]);
}
