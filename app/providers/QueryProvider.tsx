"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
