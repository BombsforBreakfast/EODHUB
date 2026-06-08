import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

export type RouteHandlerAuth = {
  user: User;
  accessToken: string;
  userClient: SupabaseClient;
};

/**
 * Authenticate an API route handler from the Authorization bearer token.
 * Returns null when the request is unauthenticated.
 */
export async function authenticateRouteHandler(
  request: Request,
): Promise<RouteHandlerAuth | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return null;

  const authHeader = request.headers.get("Authorization") ?? "";
  const accessToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  if (!accessToken) return null;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();

  if (error || !user) return null;

  return { user, accessToken, userClient };
}
