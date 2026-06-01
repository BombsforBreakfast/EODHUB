"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSupabaseUser, supabase } from "../lib/lib/supabaseClient";
import { onboardingRedirectUrl, shouldRedirectToOnboarding } from "../lib/onboardingGate";
import { fetchViewerProfileCached } from "../lib/queries/viewerProfile";

/**
 * Sends incomplete new signups back to /onboarding before they can use other pages.
 */
export function useOnboardingGate(route: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const {
        data: { user },
      } = await getSupabaseUser();
      if (!user || cancelled) return;

      const profile = await fetchViewerProfileCached(queryClient, supabase, user);
      if (cancelled) return;

      if (shouldRedirectToOnboarding(profile)) {
        window.location.replace(onboardingRedirectUrl(true));
      }
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, [route, queryClient]);
}
