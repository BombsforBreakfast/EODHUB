import { createBrowserClient } from "@supabase/ssr";

// Fallbacks prevent the client from throwing during Next.js build-time prerendering
// when env vars aren't yet injected. At runtime in the browser the real values are used.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key";

// Use @supabase/ssr's createBrowserClient (not supabase-js's plain createClient) so
// auth state is written to cookies in addition to localStorage. The proxy.ts
// middleware reads cookies via createServerClient — using the plain client here
// would leave cookies empty and cause the middleware to redirect every signed-in
// request back to /login.
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);