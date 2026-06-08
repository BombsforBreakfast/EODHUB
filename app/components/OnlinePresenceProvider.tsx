"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/lib/supabaseClient";
import { useAuth } from "../lib/auth/AuthProvider";
import { hasFullPlatformAccess } from "../lib/verificationAccess";
import { fetchViewerProfileCached } from "../lib/queries/viewerProfile";

/**
 * App-wide online presence.
 *
 * Mounted in the root layout so verified members broadcast while in ANY part of
 * the app (feed, jobs, profile, businesses, rabbithole, etc.) — not just the
 * home feed. Heartbeats and tab visibility keep presence fresh across websocket
 * reconnects without re-tracking on every client navigation.
 */

const PRESENCE_CHANNEL = "eod_home_online";
const PRESENCE_HEARTBEAT_MS = 30_000;

type OnlinePresenceContextValue = {
  onlineUserIds: string[];
};

const OnlinePresenceContext = createContext<OnlinePresenceContextValue>({
  onlineUserIds: [],
});

function presenceUserIds(state: Record<string, unknown[]>): Set<string> {
  const ids = new Set<string>();
  for (const [presenceKey, arr] of Object.entries(state)) {
    if (presenceKey) ids.add(presenceKey);
    for (const raw of arr) {
      const p = raw as { user_id?: string };
      if (p.user_id) ids.add(p.user_id);
    }
  }
  return ids;
}

export function OnlinePresenceProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { user, isLoading } = useAuth();
  const currentUserId = user?.id ?? null;
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const trackPresenceRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!currentUserId) {
      setOnlineUserIds([]);
      trackPresenceRef.current = null;
      return;
    }

    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let broadcastSelf = false;

    async function trackSelf() {
      if (cancelled || !broadcastSelf || !channel) return;
      await channel.track({
        user_id: currentUserId,
        online_at: new Date().toISOString(),
      });
    }

    trackPresenceRef.current = trackSelf;

    (async () => {
      if (!user || user.id !== currentUserId) return;

      const profile = await fetchViewerProfileCached(queryClient, supabase, user);
      if (cancelled) return;

      broadcastSelf =
        !!profile && hasFullPlatformAccess(profile) && profile.privacy_show_online !== false;

      channel = supabase.channel(PRESENCE_CHANNEL, {
        config: { presence: { key: currentUserId } },
      });

      const applyState = () => {
        if (!channel || cancelled) return;
        const ids = [...presenceUserIds(channel.presenceState())];
        ids.sort();
        setOnlineUserIds(ids);
      };

      channel
        .on("presence", { event: "sync" }, applyState)
        .on("presence", { event: "join" }, applyState)
        .on("presence", { event: "leave" }, applyState);

      channel.subscribe(async (status) => {
        if (cancelled || status !== "SUBSCRIBED") return;
        await trackSelf();
      });

      heartbeat = setInterval(() => {
        if (document.visibilityState === "visible") void trackSelf();
      }, PRESENCE_HEARTBEAT_MS);
    })();

    const onVisibility = () => {
      if (document.visibilityState === "visible") void trackSelf();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      trackPresenceRef.current = null;
      document.removeEventListener("visibilitychange", onVisibility);
      if (heartbeat) clearInterval(heartbeat);
      if (channel) {
        if (broadcastSelf) void channel.untrack();
        supabase.removeChannel(channel);
      }
    };
  }, [currentUserId, isLoading, queryClient, user]);

  const value = useMemo(() => ({ onlineUserIds }), [onlineUserIds]);

  return (
    <OnlinePresenceContext.Provider value={value}>
      {children}
    </OnlinePresenceContext.Provider>
  );
}

/** Returns the list of user_ids currently online across the app. */
export function useOnlinePresence(): OnlinePresenceContextValue {
  return useContext(OnlinePresenceContext);
}
