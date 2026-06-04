"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/app/lib/lib/supabaseClient";
import { fetchViewerProfileCached } from "@/app/lib/queries/viewerProfile";
import { MemorialReadModal } from "./MemorialReadModal";
import type { Memorial } from "./memorialModalShared";
import { MEMORIAL_COLUMNS } from "./memorialModalShared";

type MemorialNavModalContextValue = {
  openMemorialById: (id: string) => void;
};

const MemorialNavModalContext = createContext<MemorialNavModalContextValue | null>(null);

export function useMemorialNavModal(): MemorialNavModalContextValue {
  const ctx = useContext(MemorialNavModalContext);
  if (!ctx) {
    return { openMemorialById: () => {} };
  }
  return ctx;
}

export function MemorialNavModalProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [memorial, setMemorial] = useState<Memorial | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [scrapbookActorUserId, setScrapbookActorUserId] = useState<string | null>(null);
  const [scrapbookActorIsAdmin, setScrapbookActorIsAdmin] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 720px)");
    const sync = () => setIsMobile(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function syncActorFromSession(session: Session | null) {
      const uid = session?.user?.id ?? null;
      if (cancelled) return;
      if (!uid) {
        setScrapbookActorUserId(null);
        setScrapbookActorIsAdmin(false);
        return;
      }
      setScrapbookActorUserId(uid);
      const user = session?.user;
      if (!user) {
        setScrapbookActorIsAdmin(false);
        return;
      }
      const profile = await fetchViewerProfileCached(queryClient, supabase, user);
      if (!cancelled) {
        setScrapbookActorIsAdmin(Boolean(profile?.is_admin));
      }
    }

    void supabase.auth.getSession().then(({ data: { session } }) => {
      void syncActorFromSession(session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") return;
      void syncActorFromSession(session);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [queryClient]);

  const openMemorialById = useCallback((id: string) => {
    if (!id?.trim()) return;
    void (async () => {
      const { data, error } = await supabase.from("memorials").select(MEMORIAL_COLUMNS).eq("id", id.trim()).maybeSingle();
      if (!error && data) {
        setMemorial(data as Memorial);
      }
    })();
  }, []);

  const value = useMemo(() => ({ openMemorialById }), [openMemorialById]);

  return (
    <MemorialNavModalContext.Provider value={value}>
      {children}
      {memorial ? (
        <MemorialReadModal
          memorial={memorial}
          onClose={() => setMemorial(null)}
          isMobile={isMobile}
          zIndex={1200}
          scrapbookActorUserId={scrapbookActorUserId}
          scrapbookActorIsAdmin={scrapbookActorIsAdmin}
        />
      ) : null}
    </MemorialNavModalContext.Provider>
  );
}
