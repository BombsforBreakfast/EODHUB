"use client";

import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { getSupabaseUser, supabase } from "../lib/lib/supabaseClient";
import {
  onboardingRedirectUrl,
  resolvePreAccessRedirectPath,
  shouldRedirectToOnboarding,
} from "../lib/onboardingGate";
import {
  fetchViewerProfileCached,
  type ViewerProfile,
} from "../lib/queries/viewerProfile";
import { hasFullPlatformAccess } from "../lib/verificationAccess";

type AccessGateState = "checking" | "redirecting" | "ready";

export type ViewerGateContextValue = {
  userId: string;
  displayName: string;
};

const ViewerGateContext = createContext<ViewerGateContextValue | null>(null);

/** Viewer id + display name when rendered inside {@link RequireFullAccess}. */
export function useViewerGate(): ViewerGateContextValue | null {
  return useContext(ViewerGateContext);
}

function viewerDisplayName(profile: ViewerProfile): string {
  return (
    profile.display_name?.trim() ||
    `${profile.first_name || ""} ${profile.last_name || ""}`.trim() ||
    "You"
  );
}

type GateResolveResult =
  | { status: "redirecting" }
  | { status: "ready"; userId: string; profile: ViewerProfile };

async function resolveViewerGate(queryClient: QueryClient): Promise<GateResolveResult> {
  const {
    data: { user },
  } = await getSupabaseUser();

  if (!user) {
    window.location.replace("/login");
    return { status: "redirecting" };
  }

  const profile = await fetchViewerProfileCached(queryClient, supabase, user);

  if (!profile) {
    window.location.replace(onboardingRedirectUrl(false));
    return { status: "redirecting" };
  }

  if (shouldRedirectToOnboarding(profile)) {
    window.location.replace(onboardingRedirectUrl(true));
    return { status: "redirecting" };
  }

  if (!hasFullPlatformAccess(profile)) {
    window.location.replace(resolvePreAccessRedirectPath(profile));
    return { status: "redirecting" };
  }

  return { status: "ready", userId: user.id, profile };
}

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
      const result = await resolveViewerGate(queryClient);
      if (cancelled) return;
      setState(result.status === "ready" ? "ready" : "redirecting");
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
  const queryClient = useQueryClient();
  const [gate, setGate] = useState<AccessGateState>("checking");
  const [viewer, setViewer] = useState<ViewerGateContextValue | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const result = await resolveViewerGate(queryClient);
      if (cancelled) return;
      if (result.status === "ready") {
        setViewer({
          userId: result.userId,
          displayName: viewerDisplayName(result.profile),
        });
        setGate("ready");
      } else {
        setViewer(null);
        setGate("redirecting");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [route, queryClient]);

  if (gate !== "ready" || !viewer) return null;
  return createElement(ViewerGateContext.Provider, { value: viewer }, children);
}
