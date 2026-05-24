import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServiceRoleClient } from "@/app/lib/auth/adminAuthLookup";

export type AuthAccessOverrideScope = "rate_limit" | "full";

export type ActiveAuthAccessOverride = {
  scope: AuthAccessOverrideScope;
  id: string;
};

const DEFAULT_OVERRIDE_DAYS = 7;

function normalizeEmail(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim().toLowerCase();
  return t || null;
}

function clampIp(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t ? t.slice(0, 64) : null;
}

/**
 * Returns the most permissive active override for an email (and optionally IP).
 */
export async function getActiveAuthAccessOverride(
  email: string | null | undefined,
  ip?: string | null,
): Promise<ActiveAuthAccessOverride | null> {
  const normalizedEmail = normalizeEmail(email);
  const normalizedIp = clampIp(ip);
  if (!normalizedEmail && !normalizedIp) return null;

  const { client, error: envErr } = createSupabaseServiceRoleClient();
  if (envErr || !client) return null;

  const now = new Date().toISOString();
  const rows: Array<{ id: string; scope: string }> = [];

  if (normalizedEmail) {
    const { data, error } = await client
      .from("auth_access_overrides")
      .select("id, scope")
      .eq("normalized_email", normalizedEmail)
      .is("revoked_at", null)
      .gt("expires_at", now)
      .order("created_at", { ascending: false })
      .limit(5);
    if (!error && Array.isArray(data)) {
      rows.push(...data);
    }
  }

  if (normalizedIp) {
    const { data, error } = await client
      .from("auth_access_overrides")
      .select("id, scope")
      .eq("ip_address", normalizedIp)
      .is("revoked_at", null)
      .gt("expires_at", now)
      .order("created_at", { ascending: false })
      .limit(5);
    if (!error && Array.isArray(data)) {
      rows.push(...data);
    }
  }

  if (rows.length === 0) return null;

  const full = rows.find((r) => r.scope === "full");
  if (full) return { id: full.id, scope: "full" };
  return { id: rows[0]!.id, scope: "rate_limit" };
}

export async function hasFullAuthAccessOverride(
  email: string | null | undefined,
  ip?: string | null,
): Promise<boolean> {
  const active = await getActiveAuthAccessOverride(email, ip);
  return active?.scope === "full";
}

export async function hasAnyAuthAccessOverride(
  email: string | null | undefined,
  ip?: string | null,
): Promise<boolean> {
  return (await getActiveAuthAccessOverride(email, ip)) !== null;
}

export async function createAuthAccessOverride(
  adminClient: SupabaseClient,
  args: {
    normalizedEmail: string;
    ipAddress?: string | null;
    scope: AuthAccessOverrideScope;
    adminUserId: string;
    failedAuthReportId?: string | null;
    reason?: string | null;
    expiresInDays?: number;
  },
): Promise<{ id: string; expiresAt: string }> {
  const expiresInDays = args.expiresInDays ?? DEFAULT_OVERRIDE_DAYS;
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await adminClient
    .from("auth_access_overrides")
    .insert({
      normalized_email: args.normalizedEmail.trim().toLowerCase(),
      ip_address: clampIp(args.ipAddress),
      scope: args.scope,
      reason: args.reason?.trim() || null,
      created_by_admin_id: args.adminUserId,
      failed_auth_report_id: args.failedAuthReportId ?? null,
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create auth access override");
  }

  return { id: data.id as string, expiresAt };
}

export function normalizeEmailForOverride(value: string | null | undefined): string | null {
  return normalizeEmail(value);
}
