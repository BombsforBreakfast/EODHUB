import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getBsmSupabase, isBsmSupabaseConfigured } from "@bsm/lib/supabaseClient";
import { mergeLocalProgressToAccount } from "@bsm/lib/bsmStorage";

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isConfigured: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<string | null>;
  signUpWithEmail: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function authRedirectUrl(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isConfigured = isBsmSupabaseConfigured();

  useEffect(() => {
    const sb = getBsmSupabase();
    if (!sb) {
      setIsLoading(false);
      return;
    }

    let mounted = true;

    void sb.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setIsLoading(false);
    });

    const { data: subscription } = sb.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.user) {
        void mergeLocalProgressToAccount(nextSession.user.id);
      }
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signInWithOAuth = useCallback(async (provider: "google" | "apple") => {
    const sb = getBsmSupabase();
    if (!sb) return;
    const { error } = await sb.auth.signInWithOAuth({
      provider,
      options: { redirectTo: authRedirectUrl() },
    });
    if (error) throw error;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    await signInWithOAuth("google");
  }, [signInWithOAuth]);

  const signInWithApple = useCallback(async () => {
    await signInWithOAuth("apple");
  }, [signInWithOAuth]);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const sb = getBsmSupabase();
    if (!sb) return "Auth is not configured.";
    const { error } = await sb.auth.signInWithPassword({ email, password });
    return error?.message ?? null;
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    const sb = getBsmSupabase();
    if (!sb) return "Auth is not configured.";
    const { error } = await sb.auth.signUp({ email, password });
    return error?.message ?? null;
  }, []);

  const signOut = useCallback(async () => {
    const sb = getBsmSupabase();
    if (!sb) return;
    await sb.auth.signOut();
  }, []);

  const value = useMemo(
    () => ({
      user: session?.user ?? null,
      session,
      isLoading,
      isConfigured,
      signInWithGoogle,
      signInWithApple,
      signInWithEmail,
      signUpWithEmail,
      signOut,
    }),
    [
      session,
      isLoading,
      isConfigured,
      signInWithGoogle,
      signInWithApple,
      signInWithEmail,
      signUpWithEmail,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
