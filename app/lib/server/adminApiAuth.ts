import type { User } from "@supabase/supabase-js";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

export type AdminApiAuthResult =
  | { ok: true; user: User; admin: SupabaseClient }
  | { ok: false; status: 401 | 403 | 503; error: string };

export async function authenticateAdminApiRequest(
  request: NextRequest,
): Promise<AdminApiAuthResult> {
  const authHeader = request.headers.get("Authorization") ?? request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return { ok: false, status: 503, error: "Server misconfiguration" };
  }

  const token = authHeader.slice(7);
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const { data: profile } = await userClient
    .from("profiles")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile?.is_admin) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  return {
    ok: true,
    user,
    admin: createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
}

