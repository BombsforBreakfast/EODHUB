"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/lib/supabaseClient";
import { memberHasInteractionAccess } from "../lib/subscriptionAccess";
import { loadActiveProfile } from "../lib/auth/activeProfile";

export function useMemberSubscriptionGate() {
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

      const { profile } = await loadActiveProfile<{
        user_id: string;
        email: string | null;
        display_name: string | null;
        first_name: string | null;
        last_name: string | null;
        photo_url: string | null;
        account_type: string | null;
        subscription_status: string | null;
        is_admin: boolean | null;
      }>(supabase, user, {
        route: "app/hooks/useMemberSubscriptionGate.ts:run",
        select: "user_id, email, display_name, first_name, last_name, photo_url, account_type, subscription_status, is_admin",
      });

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
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      void run();
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

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
