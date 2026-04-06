"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/lib/supabaseClient";
import { memberHasInteractionAccess } from "../lib/subscriptionAccess";

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

      const { data: profile } = await supabase
        .from("profiles")
        .select("account_type, subscription_status, is_admin")
        .eq("user_id", user.id)
        .maybeSingle();

      const ok = memberHasInteractionAccess({
        accountType: profile?.account_type,
        subscriptionStatus: profile?.subscription_status ?? null,
        authUserCreatedAtIso: user.created_at,
        isAdmin: profile?.is_admin,
      });

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
