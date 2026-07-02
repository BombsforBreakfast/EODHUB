/**
 * Send the monthly community update to verified members inactive for 7+ days.
 * Always includes FOUNDER_AUDIT_EMAIL for delivery verification.
 *
 * Usage:
 *   npx tsx scripts/send-inactive-member-update-email.ts           # dry run
 *   npx tsx scripts/send-inactive-member-update-email.ts --send   # send via Resend
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { Resend } from "resend";
import {
  buildMonthlyCommunityUpdateEmailHtml,
  MONTHLY_COMMUNITY_UPDATE_SUBJECT,
} from "../app/lib/email/monthlyCommunityUpdateEmail";
import { VERIFICATION } from "../app/lib/verificationStatus";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const INACTIVE_DAYS = 7;
const FOUNDER_AUDIT_EMAIL = "micheal.p.twigg@gmail.com";
const SEND_DELAY_MS = 150;

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

function sleep(ms: number) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function fetchVerifiedProfiles(
  admin: ReturnType<typeof createClient>,
): Promise<Array<{ user_id: string; email: string | null }>> {
  const rows: Array<{ user_id: string; email: string | null }> = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await admin
      .from("profiles")
      .select("user_id, email, account_deleted_at, must_complete_onboarding")
      .eq("verification_status", VERIFICATION.VERIFIED)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      if (row.account_deleted_at) continue;
      if (row.must_complete_onboarding) continue;
      rows.push({ user_id: row.user_id, email: row.email ?? null });
    }
    if ((data ?? []).length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function fetchLastSignInByUserId(
  admin: ReturnType<typeof createClient>,
  userIds: string[],
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  const chunkSize = 20;
  for (let i = 0; i < userIds.length; i += chunkSize) {
    const chunk = userIds.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (userId) => {
        const { data, error } = await admin.auth.admin.getUserById(userId);
        if (error || !data.user) return;
        map.set(userId, data.user.last_sign_in_at ?? null);
      }),
    );
    if ((i + chunkSize) % 100 === 0 || i + chunkSize >= userIds.length) {
      console.log(`Loaded sign-in data for ${Math.min(i + chunkSize, userIds.length)}/${userIds.length} users…`);
    }
  }
  return map;
}

function isInactive(lastSignInAt: string | null | undefined, cutoff: Date): boolean {
  if (!lastSignInAt) return true;
  return new Date(lastSignInAt).getTime() < cutoff.getTime();
}

function readEmailListFromFile(path: string): string[] {
  const text = readFileSync(path, "utf8");
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && line.toLowerCase() !== "email");
}

async function main() {
  loadEnvLocal();

  const send = process.argv.includes("--send");
  const onlyFileIdx = process.argv.indexOf("--only-file");
  const onlyFile = onlyFileIdx >= 0 ? process.argv[onlyFileIdx + 1] : null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "EOD HUB <noreply@resend.dev>";
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "https://eod-hub.com";

  if (!url || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  if (send && !resendKey) {
    console.error("Missing RESEND_API_KEY (required for --send)");
    process.exit(1);
  }

  const admin = createClient(url, serviceKey);
  const cutoff = new Date(Date.now() - INACTIVE_DAYS * 24 * 60 * 60 * 1000);
  const html = buildMonthlyCommunityUpdateEmailHtml(origin);

  let recipients: string[];

  if (onlyFile) {
    recipients = readEmailListFromFile(resolve(root, onlyFile)).map((email) => email.toLowerCase());
  } else {
    const verifiedProfiles = await fetchVerifiedProfiles(admin);
    const lastSignInByUserId = await fetchLastSignInByUserId(
      admin,
      verifiedProfiles.map((profile) => profile.user_id),
    );

    const recipientEmails = new Set<string>();

    for (const profile of verifiedProfiles) {
      const email = profile.email?.trim().toLowerCase();
      if (!email) continue;
      const lastSignIn = lastSignInByUserId.get(profile.user_id) ?? null;
      if (!isInactive(lastSignIn, cutoff)) continue;
      recipientEmails.add(email);
    }

    recipientEmails.add(FOUNDER_AUDIT_EMAIL.toLowerCase());
    recipients = [...recipientEmails].sort((a, b) => a.localeCompare(b));

    console.log(`Inactive cutoff: last sign-in before ${cutoff.toISOString()}`);
    console.log(`Verified members: ${verifiedProfiles.length}`);
  }

  recipients = [...new Set(recipients.map((email) => email.toLowerCase()))].sort((a, b) =>
    a.localeCompare(b),
  );

  // Always deliver the audit copy first when sending the full inactive cohort.
  if (send && !onlyFile) {
    recipients = [
      FOUNDER_AUDIT_EMAIL.toLowerCase(),
      ...recipients.filter((email) => email !== FOUNDER_AUDIT_EMAIL.toLowerCase()),
    ];
  }

  const outDir = resolve(root, "exports");
  mkdirSync(outDir, { recursive: true });
  const manifestPath = resolve(outDir, "inactive-member-update-recipients.csv");
  writeFileSync(manifestPath, ["email", ...recipients].join("\n"), "utf8");
  const failedPath = resolve(outDir, "inactive-member-update-failed.csv");
  const pendingPath = resolve(outDir, "inactive-member-update-pending.csv");

  console.log(`Recipients: ${recipients.length}`);
  console.log(`Founder audit included: yes (${FOUNDER_AUDIT_EMAIL})`);
  console.log(`Manifest: ${manifestPath}`);
  if (onlyFile) console.log(`Resume file: ${resolve(root, onlyFile)}`);
  console.log(send ? "Mode: SEND" : "Mode: dry run (pass --send to deliver)");

  if (!send) {
    console.log("Sample recipients:", recipients.slice(0, 10).join(", "));
    return;
  }

  const resend = new Resend(resendKey);
  let sent = 0;
  let failed = 0;
  const failedEmails: string[] = [];
  const sentEmails: string[] = [];

  for (const email of recipients) {
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: email,
      subject: MONTHLY_COMMUNITY_UPDATE_SUBJECT,
      html,
    });

    if (error) {
      failed += 1;
      failedEmails.push(email);
      console.error(`FAILED ${email}: ${error.message}`);
    } else {
      sent += 1;
      sentEmails.push(email);
      if (sent % 25 === 0 || email === FOUNDER_AUDIT_EMAIL.toLowerCase()) {
        console.log(`Sent ${sent}/${recipients.length} (latest: ${email}, id: ${data?.id ?? "?"})`);
      }
    }

    await sleep(SEND_DELAY_MS);
  }

  writeFileSync(failedPath, ["email", ...failedEmails].join("\n"), "utf8");
  writeFileSync(pendingPath, ["email", ...failedEmails].join("\n"), "utf8");

  console.log("");
  console.log(`Done. Sent: ${sent}, Failed: ${failed}, Total: ${recipients.length}`);
  if (failedEmails.length > 0) {
    console.log(`Failed/pending list: ${failedPath}`);
    console.log(`Re-run tomorrow with: npx tsx scripts/send-inactive-member-update-email.ts --send --only-file exports/inactive-member-update-pending.csv`);
  }
}

void main();
