"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/app/lib/lib/supabaseClient";
import { queryKeys } from "@/app/lib/queryKeys";
import { VIEWER_PROFILE_SELECT, type ViewerProfile } from "@/app/lib/queries/viewerProfile";
import { useViewerGate } from "@/app/hooks/useRequireFullAccess";
import {
  loadArcadeWallet,
  spendArcadeChallengeCoin,
  type ArcadeWallet,
} from "./arcadeWalletStorage";

export function useArcadeSession() {
  const viewer = useViewerGate();
  const userId = viewer?.userId ?? null;
  const [wallet, setWallet] = useState<ArcadeWallet | null>(null);
  const [walletLoading, setWalletLoading] = useState(true);
  const [coinError, setCoinError] = useState<string | null>(null);

  const profileQuery = useQuery({
    queryKey: queryKeys.viewerProfile(userId),
    enabled: !!userId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ViewerProfile | null> => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select(VIEWER_PROFILE_SELECT)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ViewerProfile | null;
    },
  });

  const refreshWallet = useCallback(async (bypassCache = false) => {
    if (!userId) {
      setWallet(null);
      setWalletLoading(false);
      return null;
    }
    setWalletLoading(true);
    const next = await loadArcadeWallet(userId, { bypassCache });
    setWallet(next);
    setWalletLoading(false);
    return next;
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      void refreshWallet();
    });
    return () => {
      cancelled = true;
    };
  }, [refreshWallet]);

  const profile = useMemo(() => {
    const row = profileQuery.data;
    if (!row) return null;
    const displayName =
      row.display_name?.trim() ||
      `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() ||
      "Player";
    return {
      displayName,
      photoUrl: row.photo_url ?? null,
      service: row.service ?? null,
      isEmployer: row.is_employer ?? null,
    };
  }, [profileQuery.data]);

  const payToPlay = useCallback(
    async (gameId: "rainbow_cowboy" | "render_safe", levelId: string) => {
      setCoinError(null);
      if (!userId) return true;

      const result = await spendArcadeChallengeCoin(userId, gameId, levelId);
      if (result.wallet) setWallet(result.wallet);
      if (!result.ok) {
        setCoinError(result.error);
        return false;
      }
      return true;
    },
    [userId],
  );

  return {
    userId,
    profile,
    wallet,
    walletLoading,
    coinError,
    setCoinError,
    refreshWallet,
    payToPlay,
  };
}
