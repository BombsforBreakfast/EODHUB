import { createBrowserClient } from "@supabase/ssr";
import type { Session, User } from "@supabase/supabase-js";
import { trackAuthCall } from "../auth/authObservability";

// Fallbacks prevent the client from throwing during Next.js build-time prerendering
// when env vars aren't yet injected. At runtime in the browser the real values are used.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key";

const AUTH_LOCK_ACQUIRE_TIMEOUT_MS = 30_000;

// Use @supabase/ssr's createBrowserClient (not supabase-js's plain createClient) so
// auth state is written to cookies in addition to localStorage. The proxy.ts
// middleware reads cookies via createServerClient — using the plain client here
// would leave cookies empty and cause the middleware to redirect every signed-in
// request back to /login.
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);

// Some current Supabase versions type/document lockAcquireTimeout but do not
// always pass it through createClient initialization. Keep this defensive
// assignment until the SDK reliably forwards the option.
(supabase.auth as unknown as { lockAcquireTimeout?: number }).lockAcquireTimeout =
  AUTH_LOCK_ACQUIRE_TIMEOUT_MS;

let cachedSession: Session | null | undefined;
let cachedUser: User | null | undefined;
let sessionInFlight: ReturnType<typeof supabase.auth.getSession> | null = null;
let userInFlight: ReturnType<typeof supabase.auth.getUser> | null = null;

export function setAuthCache(session: Session | null) {
  cachedSession = session;
  cachedUser = session?.user ?? null;
}

export function invalidateAuthCache() {
  cachedSession = undefined;
  cachedUser = undefined;
  sessionInFlight = null;
  userInFlight = null;
}

type AuthFetchOptions = {
  force?: boolean;
  source?: string;
};

export function getSupabaseSession(options?: AuthFetchOptions) {
  const source = options?.source ?? "getSupabaseSession";

  if (!options?.force && cachedSession !== undefined) {
    return Promise.resolve({ data: { session: cachedSession }, error: null });
  }

  sessionInFlight ??= supabase.auth.getSession().then((result) => {
    trackAuthCall("getSession", source);
    if (!result.error) {
      cachedSession = result.data.session;
      cachedUser = result.data.session?.user ?? null;
    }
    return result;
  }).finally(() => {
    sessionInFlight = null;
  });

  return sessionInFlight;
}

export function getSupabaseUser(options?: AuthFetchOptions) {
  const source = options?.source ?? "getSupabaseUser";

  if (!options?.force && cachedUser !== undefined) {
    return Promise.resolve({ data: { user: cachedUser }, error: null });
  }

  userInFlight ??= supabase.auth.getUser().then((result) => {
    trackAuthCall("getUser", source);
    if (!result.error) {
      cachedUser = result.data.user;
    }
    return result;
  }).finally(() => {
    userInFlight = null;
  });

  return userInFlight;
}

/** Cached access token for API calls. Avoids repeated getSession() in action handlers. */
export async function getAccessToken(options?: AuthFetchOptions): Promise<string | null> {
  const { data } = await getSupabaseSession(options);
  return data.session?.access_token ?? null;
}
