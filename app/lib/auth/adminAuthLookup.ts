import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

/** Max auth users to scan (paginated). Adjust if your project grows past this. */
const DEFAULT_MAX_PAGES = 50;
const DEFAULT_PER_PAGE = 1000;

export function createSupabaseServiceRoleClient():
  | { client: SupabaseClient; error: null }
  | { client: null; error: "missing_env" } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { client: null, error: "missing_env" };
  return { client: createClient(url, key), error: null };
}

export function collectIdentityProviders(user: User): string[] {
  const set = new Set<string>();
  for (const id of user.identities ?? []) {
    if (id.provider) set.add(id.provider);
  }
  return [...set];
}

/**
 * Returns every auth.users row whose email matches (case-insensitive).
 * Scans the user list with pagination — fine for modest user counts.
 *
 * Prefer Supabase automatic identity linking (same verified email → one user)
 * so this rarely returns more than one row.
 */
export async function findAuthUsersByEmail(
  admin: SupabaseClient,
  normalizedEmail: string,
  opts?: { maxPages?: number; perPage?: number }
): Promise<{ users: User[]; listError: string | null }> {
  const perPage = opts?.perPage ?? DEFAULT_PER_PAGE;
  const maxPages = opts?.maxPages ?? DEFAULT_MAX_PAGES;
  const matches: User[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      return { users: [], listError: error.message };
    }
    const batch = data.users;
    for (const u of batch) {
      if (u.email?.toLowerCase() === normalizedEmail) matches.push(u);
    }
    // One matching row is enough for provider checks; continuing would mean
    // paginating through the entire project (very slow) on every hint lookup.
    if (matches.length > 0) {
      return { users: matches, listError: null };
    }
    if (batch.length < perPage) break;
  }

  return { users: matches, listError: null };
}

/** Union of all identity providers across matching users (e.g. ["email", "google"]). */
export async function getProvidersForEmail(
  admin: SupabaseClient,
  normalizedEmail: string
): Promise<{ providers: string[]; listError: string | null }> {
  const { users, listError } = await findAuthUsersByEmail(admin, normalizedEmail);
  if (listError) return { providers: [], listError };
  const set = new Set<string>();
  for (const u of users) {
    for (const p of collectIdentityProviders(u)) set.add(p);
  }
  return { providers: [...set].sort(), listError: null };
}

