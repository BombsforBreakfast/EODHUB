import { createHash, randomBytes } from "crypto";
import { createClient } from "@supabase/supabase-js";

const TOKEN_BYTES = 32;
const EXPIRY_MS = 24 * 60 * 60 * 1000;

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service configuration");
  return createClient(url, key);
}

export function hashVerificationToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export async function createVerificationToken(userId: string): Promise<string> {
  const raw = randomBytes(TOKEN_BYTES).toString("base64url");
  const tokenHash = hashVerificationToken(raw);
  const expiresAt = new Date(Date.now() + EXPIRY_MS).toISOString();

  const admin = getAdminClient();
  const { error } = await admin.from("email_verification_tokens").insert({
    user_id: userId,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });

  if (error) throw new Error("Failed to create verification token: " + error.message);
  return raw;
}

export type ConsumeTokenResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "invalid" | "expired" | "used" };

export async function consumeVerificationToken(raw: string): Promise<ConsumeTokenResult> {
  const tokenHash = hashVerificationToken(raw.trim());
  const admin = getAdminClient();

  const { data: row, error } = await admin
    .from("email_verification_tokens")
    .select("id, user_id, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !row) return { ok: false, reason: "invalid" };
  if (row.used_at) return { ok: false, reason: "used" };
  if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, reason: "expired" };

  const { error: markError } = await admin
    .from("email_verification_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("used_at", null);

  if (markError) return { ok: false, reason: "invalid" };

  return { ok: true, userId: row.user_id };
}
