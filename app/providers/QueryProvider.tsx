"use client";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { supabase } from "../lib/lib/supabaseClient";

/**
 * Root React Query provider. Mounted high in the tree (inside ThemeProvider,
 * above route layouts) so the cache survives MasterShell remounts when the user
 * crosses route groups (e.g. / -> /jobs -> /businesses).
 *
 * Defaults favor stale-while-revalidate: cached data renders immediately and a
 * quiet background refetch only re-renders consumers when the data actually
 * changed (React Query structural sharing).
 */
export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 10 * 60_000,
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
            retry: 1,
          },
        },
      }),
  );

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      // Drop all cached per-user data when the session ends or switches accounts
      // so a new user never sees the previous user's cached profile/feed/etc.
      if (event === "SIGNED_OUT") {
        queryClient.clear();
      }
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [queryClient]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
