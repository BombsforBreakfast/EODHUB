"use client";

import { useEffect } from "react";
import { supabase } from "../lib/lib/supabaseClient";
import { loadActiveProfile } from "../lib/auth/activeProfile";
import {
  ONBOARDING_GATE_PROFILE_SELECT,
  onboardingRedirectUrl,
  shouldRedirectToOnboarding,
  type OnboardingGateProfile,
} from "../lib/onboardingGate";

/**
 * Sends incomplete new signups back to /onboarding before they can use other pages.
 */
export function useOnboardingGate(route: string) {
  useEffect(() => {
    let cancelled = false;

    async function check() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { profile } = await loadActiveProfile<OnboardingGateProfile>(supabase, user, {
        route,
        select: ONBOARDING_GATE_PROFILE_SELECT,
      });
      if (cancelled) return;

      if (shouldRedirectToOnboarding(profile)) {
        window.location.replace(onboardingRedirectUrl(true));
      }
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, [route]);
}
