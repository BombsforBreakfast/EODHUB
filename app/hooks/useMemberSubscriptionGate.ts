"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/lib/supabaseClient";
import { useAuth } from "../lib/auth/AuthProvider";
import { memberHasInteractionAccess } from "../lib/subscriptionAccess";
import { fetchViewerProfileCached } from "../lib/queries/viewerProfile";

export function useMemberSubscriptionGate() {
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading } = useAuth();
  const [interactionAllowed, setInteractionAllowed] = useState(true);
  const [checking, setChecking] = useState(true);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const allowedRef = useRef(true);

  useEffect(() => {
    if (authLoading) return;

    let cancelled = false;

    async function run() {
      setChecking(true);
      if (!user || cancelled) {
        if (!cancelled) {
          allowedRef.current = true;
          setInteractionAllowed(true);
          setChecking(false);
        }
        return;
      }

      const profile = await fetchViewerProfileCached(queryClient, supabase, user);

      const ok = profile
        ? memberHasInteractionAccess({
            accountType: profile.account_type,
            subscriptionStatus: profile.subscription_status ?? null,
            authUserCreatedAtIso: user.created_at,
            isAdmin: profile.is_admin,
          })
        : false;

      if (!cancelled) {
        allowedRef.current = ok;
        setInteractionAllowed(ok);
        setChecking(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [authLoading, queryClient, user]);

  const blockIfNeeded = useCallback(() => {
    if (allowedRef.current) return false;
    setPaywallOpen(true);
    return true;
  }, []);

  return {
    interactionAllowed,
    checking,
    paywallOpen,
    setPaywallOpen,
    blockIfNeeded,
  };
}
