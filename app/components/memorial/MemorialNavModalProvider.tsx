"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/app/lib/lib/supabaseClient";
import { useAuth } from "@/app/lib/auth/AuthProvider";
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
  const { user, isLoading } = useAuth();
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

    async function syncActor() {
      const uid = user?.id ?? null;
      if (cancelled) return;
      if (!uid || isLoading) {
        setScrapbookActorUserId(null);
        setScrapbookActorIsAdmin(false);
        return;
      }
      setScrapbookActorUserId(uid);
      if (!user) {
        setScrapbookActorIsAdmin(false);
        return;
      }
      const profile = await fetchViewerProfileCached(queryClient, supabase, user);
      if (!cancelled) {
        setScrapbookActorIsAdmin(Boolean(profile?.is_admin));
      }
    }

    void syncActor();
    return () => {
      cancelled = true;
    };
  }, [user, isLoading, queryClient]);

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
