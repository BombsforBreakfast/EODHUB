"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSupabaseUser, supabase } from "../lib/lib/supabaseClient";
import {
  onboardingRedirectUrl,
  resolvePreAccessRedirectPath,
  shouldRedirectToOnboarding,
} from "../lib/onboardingGate";
import { fetchViewerProfileCached } from "../lib/queries/viewerProfile";
import { hasFullPlatformAccess } from "../lib/verificationAccess";

type AccessGateState = "checking" | "redirecting" | "ready";

/**
 * Gate for any in-app page that requires a fully created + onboarded + verified
 * profile. Unauthenticated visitors are sent to /login; users mid-flow are sent
 * to the right next step (onboarding / verify-email / pending).
 *
 * Grandfathered profiles (created before SIGNUP_PROFILE_ENFORCEMENT_START) keep
 * their existing access — they pass `shouldRedirectToOnboarding` and the
 * verification gate the same way they did before this hook landed.
 */
export function useRequireFullAccess(route: string): AccessGateState {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AccessGateState>("checking");

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const {
        data: { user },
      } = await getSupabaseUser();
      if (cancelled) return;

      if (!user) {
        setState("redirecting");
        window.location.replace("/login");
        return;
      }

      const profile = await fetchViewerProfileCached(queryClient, supabase, user);
      if (cancelled) return;

      if (!profile) {
        setState("redirecting");
        window.location.replace(onboardingRedirectUrl(false));
        return;
      }

      if (shouldRedirectToOnboarding(profile)) {
        setState("redirecting");
        window.location.replace(onboardingRedirectUrl(true));
        return;
      }

      if (!hasFullPlatformAccess(profile)) {
        setState("redirecting");
        window.location.replace(resolvePreAccessRedirectPath(profile));
        return;
      }

      setState("ready");
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, [route, queryClient]);

  return state;
}

/** Renders children only after auth + verification gates pass (no content flash while checking). */
export function RequireFullAccess({
  route,
  children,
}: {
  route: string;
  children: ReactNode;
}) {
  const gate = useRequireFullAccess(route);
  if (gate !== "ready") return null;
  return children;
}
