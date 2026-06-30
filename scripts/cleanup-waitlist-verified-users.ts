/**
 * Remove waitlist_signups rows that match verified platform members (by email or name).
 *
 * Usage:
 *   npx tsx scripts/cleanup-waitlist-verified-users.ts           # dry run
 *   npx tsx scripts/cleanup-waitlist-verified-users.ts --execute # delete matches
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { VERIFICATION } from "../app/lib/verificationStatus";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnvLocal() {
  const path = resolve(root, ".env.local");
  try {
    const text = readFileSync(path, "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    console.warn("No .env.local found — using existing process.env");
  }
}

function normalizeName(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.,']/g, "")
    .replace(/\b(jr|sr|ii|iii|iv)\b\.?$/i, "")
    .trim();
}

function profileNameVariants(row: {
  display_name: string | null;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
}): string[] {
  const variants = new Set<string>();
  for (const raw of [row.display_name, row.name, [row.first_name, row.last_name].filter(Boolean).join(" ")]) {
    const n = normalizeName(raw);
    if (n) variants.add(n);
  }
  const first = normalizeName(row.first_name);
  const last = normalizeName(row.last_name);
  if (first && last) variants.add(`${first} ${last}`);
  return [...variants];
}

function waitlistDisplayName(row: {
  first_name: string | null;
  last_name: string | null;
}): string {
  return [row.first_name, row.last_name]
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean)
    .join(" ");
}

type WaitlistRow = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
};

type ProfileRow = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  verification_status: string | null;
};

async function main() {
  loadEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const execute = process.argv.includes("--execute");

  if (!url || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const admin = createClient(url, serviceKey);

  const { data: profiles, error: profilesError } = await admin
    .from("profiles")
    .select("user_id, email, display_name, name, first_name, last_name, verification_status")
    .eq("verification_status", VERIFICATION.VERIFIED);

  if (profilesError) {
    console.error("Failed to load verified profiles:", profilesError.message);
    process.exit(1);
  }

  const verifiedProfiles = (profiles ?? []) as ProfileRow[];
  const verifiedEmails = new Set<string>();
  const verifiedNames = new Map<string, ProfileRow[]>();

  for (const profile of verifiedProfiles) {
    const email = profile.email?.trim().toLowerCase();
    if (email) verifiedEmails.add(email);
    for (const variant of profileNameVariants(profile)) {
      const list = verifiedNames.get(variant) ?? [];
      list.push(profile);
      verifiedNames.set(variant, list);
    }
  }

  const { data: waitlist, error: waitlistError } = await admin
    .from("waitlist_signups")
    .select("id, email, first_name, last_name")
    .order("created_at", { ascending: true });

  if (waitlistError) {
    console.error("Failed to load waitlist:", waitlistError.message);
    process.exit(1);
  }

  const waitlistRows = (waitlist ?? []) as WaitlistRow[];
  const toDelete: Array<{
    row: WaitlistRow;
    reason: string;
    matchedProfile: ProfileRow;
  }> = [];

  for (const row of waitlistRows) {
    const email = row.email.trim().toLowerCase();
    const display = waitlistDisplayName(row);
    const normalizedDisplay = normalizeName(display);

    if (email && verifiedEmails.has(email)) {
      const matchedProfile =
        verifiedProfiles.find((p) => p.email?.trim().toLowerCase() === email) ?? verifiedProfiles[0];
      toDelete.push({ row, reason: "email", matchedProfile });
      continue;
    }

    if (normalizedDisplay) {
      const matches = verifiedNames.get(normalizedDisplay);
      if (matches?.length) {
        toDelete.push({ row, reason: "name", matchedProfile: matches[0] });
      }
    }
  }

  console.log(`Verified profiles: ${verifiedProfiles.length}`);
  console.log(`Waitlist rows: ${waitlistRows.length}`);
  console.log(`Matches to remove: ${toDelete.length}`);
  console.log(execute ? "Mode: EXECUTE (will delete)" : "Mode: dry run (pass --execute to delete)");
  console.log("");

  if (toDelete.length === 0) {
    console.log("No waitlist entries matched verified users.");
    return;
  }

  for (const { row, reason, matchedProfile } of toDelete) {
    const waitName = waitlistDisplayName(row) || "—";
    const profileName =
      matchedProfile.display_name?.trim() ||
      matchedProfile.name?.trim() ||
      [matchedProfile.first_name, matchedProfile.last_name].filter(Boolean).join(" ").trim() ||
      matchedProfile.user_id;
    console.log(
      `- ${waitName} <${row.email}>  →  verified: ${profileName} (${reason})`,
    );
  }

  if (!execute) return;

  let deleted = 0;
  for (const { row } of toDelete) {
    const { error } = await admin.from("waitlist_signups").delete().eq("id", row.id);
    if (error) {
      console.error(`Failed to delete ${row.email}:`, error.message);
    } else {
      deleted += 1;
    }
  }

  console.log("");
  console.log(`Deleted ${deleted} waitlist row(s).`);
}

void main();
