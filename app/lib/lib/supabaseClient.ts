import { createClient } from "@supabase/supabase-js";

// Fallbacks prevent the client from throwing during Next.js build-time prerendering
// when env vars aren't yet injected. At runtime in the browser the real values are used.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);