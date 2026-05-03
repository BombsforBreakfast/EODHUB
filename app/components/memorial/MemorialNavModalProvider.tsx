"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/app/lib/lib/supabaseClient";
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

    async function syncActorFromSession() {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id ?? null;
      if (cancelled) return;
      if (!uid) {
        setScrapbookActorUserId(null);
        setScrapbookActorIsAdmin(false);
        return;
      }
      setScrapbookActorUserId(uid);
      const { data: pr } = await supabase.from("profiles").select("is_admin").eq("user_id", uid).maybeSingle();
      if (!cancelled) {
        setScrapbookActorIsAdmin(Boolean((pr as { is_admin?: boolean | null } | null)?.is_admin));
      }
    }

    void syncActorFromSession();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      void syncActorFromSession();
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

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
