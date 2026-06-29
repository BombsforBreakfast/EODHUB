import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_BSM_SUPABASE_URL?.trim() ?? "";
const anonKey = import.meta.env.VITE_BSM_SUPABASE_ANON_KEY?.trim() ?? "";

let client: SupabaseClient | null = null;

export function getBsmSupabase(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  if (!client) {
    client = createClient(url, anonKey);
  }
  return client;
}

export function isBsmSupabaseConfigured(): boolean {
  return Boolean(url && anonKey);
}

/** Hub game modules import this path via Vite alias. */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const instance = getBsmSupabase();
    if (!instance) {
      throw new Error("BSM Supabase is not configured. Set VITE_BSM_SUPABASE_URL and VITE_BSM_SUPABASE_ANON_KEY.");
    }
    const value = instance[prop as keyof SupabaseClient];
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

export async function getSupabaseSession() {
  const sb = getBsmSupabase();
  if (!sb) return { data: { session: null } };
  return sb.auth.getSession();
}
