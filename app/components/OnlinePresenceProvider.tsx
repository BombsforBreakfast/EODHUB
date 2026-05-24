"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { supabase } from "../lib/lib/supabaseClient";

/**
 * App-wide online presence.
 *
 * Mounted in the root layout so a member broadcasts while in ANY part of the
 * app (feed, jobs, profile, businesses, etc.) — not just the home feed.
 * Without this, navigating off the feed unmounts the tracker and the strip
 * flickers / users disappear after a few seconds.
 */

const PRESENCE_CHANNEL = "eod_home_online";

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
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      setCurrentUserId(data.user?.id ?? null);
    }

    void loadUser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUserId(session?.user?.id ?? null);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!currentUserId) {
      setOnlineUserIds([]);
      return;
    }

    let cancelled = false;
    let cleanup: (() => void) | null = null;

    (async () => {
      // Honor privacy_show_online: still subscribe so the user can see who else
      // is online, but skip broadcasting our own presence.
      const { data: meRow } = await supabase
        .from("profiles")
        .select("privacy_show_online")
        .eq("user_id", currentUserId)
        .maybeSingle();
      if (cancelled) return;
      const broadcastSelf = meRow?.privacy_show_online !== false;

      const channel = supabase.channel(PRESENCE_CHANNEL, {
        config: { presence: { key: currentUserId } },
      });

      const applyState = () => {
        const ids = [...presenceUserIds(channel.presenceState())];
        ids.sort();
        setOnlineUserIds(ids);
      };

      channel
        .on("presence", { event: "sync" }, applyState)
        .on("presence", { event: "join" }, applyState)
        .on("presence", { event: "leave" }, applyState);

      // Subscribe handler also fires on reconnects (status flips back to
      // SUBSCRIBED after a websocket drop). Re-tracking here keeps the user
      // online through transient network blips and tab background/foreground.
      channel.subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return;
        if (!broadcastSelf) return;
        await channel.track({
          user_id: currentUserId,
          online_at: new Date().toISOString(),
        });
      });

      cleanup = () => {
        if (broadcastSelf) void channel.untrack();
        supabase.removeChannel(channel);
      };
    })();

    return () => {
      cancelled = true;
      if (cleanup) cleanup();
    };
  }, [currentUserId]);

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
