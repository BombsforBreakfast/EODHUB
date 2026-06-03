import type { SupabaseClient } from "@supabase/supabase-js";
import {
  authMetadataDisplayName,
  splitFullName,
} from "@/app/lib/profileCompleteness";

/**
 * Copy OAuth / mirrored display names into first_name + last_name when those
 * columns are still empty. Keeps admin approval gates aligned with what admins
 * see in the user list.
 */
export async function hydrateProfileNamesFromAuth(
  admin: SupabaseClient,
  userId: string,
  metadata: Record<string, unknown> | null | undefined,
): Promise<void> {
  const label = authMetadataDisplayName(metadata);
  if (!label) return;

  const { data: row } = await admin
    .from("profiles")
    .select("first_name, last_name, name, display_name")
    .eq("user_id", userId)
    .maybeSingle();

  if (!row) return;

  const hasFirst = !!row.first_name?.trim();
  const hasLast = !!row.last_name?.trim();
  if (hasFirst && hasLast) return;

  const source =
    label ||
    row.display_name?.trim() ||
    row.name?.trim() ||
    "";
  if (!source) return;

  const parsed = splitFullName(source);
  const updates: Record<string, string> = {};
  if (!hasFirst && parsed.first_name) updates.first_name = parsed.first_name;
  if (!hasLast && parsed.last_name) updates.last_name = parsed.last_name;
  if (Object.keys(updates).length === 0) return;

  await admin.from("profiles").update(updates).eq("user_id", userId);
}
