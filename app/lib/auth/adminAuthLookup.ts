import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

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

async function loadUsersByIds(
  admin: SupabaseClient,
  ids: string[],
): Promise<User[]> {
  const seen = new Set<string>();
  const users: User[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const { data, error } = await admin.auth.admin.getUserById(id);
    if (error || !data?.user) continue;
    users.push(data.user);
  }
  return users;
}

/** profiles.email → getUserById (covers approved / mirrored accounts). */
async function findAuthUserIdsViaProfiles(
  admin: SupabaseClient,
  normalizedEmail: string,
): Promise<string[]> {
  const { data: rows, error } = await admin
    .from("profiles")
    .select("user_id")
    .ilike("email", normalizedEmail)
    .limit(20);

  if (error || !rows?.length) return [];
  return rows
    .map((row) => (typeof row.user_id === "string" ? row.user_id : null))
    .filter((id): id is string => !!id);
}

/**
 * Direct auth.users email lookup via security-definer RPC.
 * No pagination / soft caps — works at any user count.
 */
async function findAuthUserIdsViaRpc(
  admin: SupabaseClient,
  normalizedEmail: string,
): Promise<{ ids: string[]; rpcError: string | null }> {
  const { data, error } = await admin.rpc("find_auth_user_ids_by_email", {
    p_email: normalizedEmail,
  });
  if (error) {
    return { ids: [], rpcError: error.message };
  }
  const ids = ((data ?? []) as Array<{ user_id?: string } | string>)
    .map((row) => (typeof row === "string" ? row : row.user_id))
    .filter((id): id is string => typeof id === "string" && !!id);
  return { ids, rpcError: null };
}

/**
 * Returns auth.users rows whose email matches (case-insensitive).
 * Uses profiles + SQL on auth.users — never scans GoTrue listUsers pages.
 *
 * Prefer Supabase automatic identity linking (same verified email → one user)
 * so this rarely returns more than one row.
 */
export async function findAuthUsersByEmail(
  admin: SupabaseClient,
  normalizedEmail: string,
  opts?: { findAll?: boolean },
): Promise<{ users: User[]; listError: string | null }> {
  const findAll = opts?.findAll === true;
  const idSet = new Set<string>();

  for (const id of await findAuthUserIdsViaProfiles(admin, normalizedEmail)) {
    idSet.add(id);
  }

  const { ids: rpcIds, rpcError } = await findAuthUserIdsViaRpc(admin, normalizedEmail);
  for (const id of rpcIds) idSet.add(id);

  if (idSet.size === 0) {
    return { users: [], listError: rpcError };
  }

  const users = await loadUsersByIds(admin, [...idSet]);
  if (!findAll && users.length > 1) {
    return { users: [users[0]!], listError: null };
  }
  return { users, listError: null };
}

/** Union of all identity providers across matching users (e.g. ["email", "google"]). */
export async function getProvidersForEmail(
  admin: SupabaseClient,
  normalizedEmail: string,
): Promise<{ providers: string[]; listError: string | null }> {
  const { users, listError } = await findAuthUsersByEmail(admin, normalizedEmail, {
    findAll: true,
  });
  if (listError) return { providers: [], listError };
  const set = new Set<string>();
  for (const u of users) {
    for (const p of collectIdentityProviders(u)) set.add(p);
  }
  return { providers: [...set].sort(), listError: null };
}
