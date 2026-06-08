"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Session, User } from "@supabase/supabase-js";
import {
  getSupabaseSession,
  invalidateAuthCache,
  setAuthCache,
  supabase,
} from "../lib/supabaseClient";
import { markAuthReady } from "./authReady";

export type AuthContextValue = {
  user: User | null;
  session: Session | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** Re-read session from Supabase (e.g. after explicit login). Prefer context for reads. */
  refreshAuth: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function applySession(
  session: Session | null,
  setState: (v: { user: User | null; session: Session | null; isLoading: boolean }) => void,
) {
  setAuthCache(session);
  setState({
    user: session?.user ?? null,
    session,
    isLoading: false,
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const initialLoadDone = useRef(false);
  const [{ user, session, isLoading }, setState] = useState<{
    user: User | null;
    session: Session | null;
    isLoading: boolean;
  }>({
    user: null,
    session: null,
    isLoading: true,
  });

  const refreshAuth = useCallback(async () => {
    invalidateAuthCache();
    const { data } = await getSupabaseSession({ force: true, source: "AuthProvider.refreshAuth" });
    applySession(data.session ?? null, setState);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      const { data, error } = await getSupabaseSession({ source: "AuthProvider.bootstrap" });
      if (!mounted) return;
      if (error) console.error("[auth] bootstrap error:", error);
      applySession(data.session ?? null, setState);
      if (!initialLoadDone.current) {
        initialLoadDone.current = true;
        markAuthReady();
      }
    }

    void bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;

      if (event === "SIGNED_OUT") {
        invalidateAuthCache();
        queryClient.clear();
        applySession(null, setState);
        return;
      }

      if (event === "TOKEN_REFRESHED") {
        setAuthCache(nextSession);
        setState({
          user: nextSession?.user ?? null,
          session: nextSession,
          isLoading: false,
        });
        return;
      }

      if (event === "INITIAL_SESSION") {
        return;
      }

      invalidateAuthCache();
      applySession(nextSession, setState);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      accessToken: session?.access_token ?? null,
      isLoading,
      isAuthenticated: !!user,
      refreshAuth,
    }),
    [user, session, isLoading, refreshAuth],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

/** Safe variant for components that may render outside AuthProvider (e.g. login). */
export function useAuthOptional(): AuthContextValue | null {
  return useContext(AuthContext);
}
