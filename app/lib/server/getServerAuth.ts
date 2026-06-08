import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Session, User } from "@supabase/supabase-js";

export type ServerAuthResult = {
  user: User | null;
  session: Session | null;
};

async function readServerAuth(): Promise<ServerAuthResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return { user: null, session: null };
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        // Server Components cannot mutate cookies; session refresh happens in proxy/route handlers.
      },
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { user: null, session: null };
  }

  return { user, session: null };
}

/**
 * One auth read per React server request. Use in Server Components / layouts
 * instead of calling supabase.auth.getUser() in multiple places in the same render.
 */
export const getServerAuth = cache(readServerAuth);

/** @deprecated Prefer getServerAuth — same deduped read, clearer name. */
export const getServerAuthUser = getServerAuth;
