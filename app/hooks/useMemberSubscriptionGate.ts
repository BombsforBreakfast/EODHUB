"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/lib/supabaseClient";
import { memberHasInteractionAccess } from "../lib/subscriptionAccess";
import { fetchViewerProfileCached } from "../lib/queries/viewerProfile";

export function useMemberSubscriptionGate() {
  const queryClient = useQueryClient();
  const [interactionAllowed, setInteractionAllowed] = useState(true);
  const [checking, setChecking] = useState(true);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const allowedRef = useRef(true);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setChecking(true);
      const { data: { user } } = await supabase.auth.getUser();
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") return;
      void run();
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [queryClient]);

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
