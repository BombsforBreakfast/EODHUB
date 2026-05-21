/**
 * Localhost E2E smoke test for email verification pipeline.
 * Usage: node scripts/local-verify-email-test.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "crypto";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnvLocal() {
  const path = resolve(root, ".env.local");
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
}

function hashToken(raw) {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

function log(step, detail = {}) {
  console.log(`[local-test] ${step}`, JSON.stringify(detail));
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const baseUrl = "http://localhost:3000";

if (!url || !anonKey || !serviceKey) {
  console.error("Missing Supabase env vars in .env.local");
  process.exit(1);
}

const admin = createClient(url, serviceKey);
const anon = createClient(url, anonKey);

const testEmail = `e2e-verify-${Date.now()}@mailinator.com`;
const testPassword = `Test-${randomBytes(8).toString("hex")}!1Aa`;

async function cleanup(userId) {
  try {
    await admin.from("email_verification_tokens").delete().eq("user_id", userId);
    await admin.from("profiles").delete().eq("user_id", userId);
    await admin.auth.admin.deleteUser(userId);
  } catch {
    /* best effort */
  }
}

async function main() {
  let userId = null;
  const results = [];

  try {
    log("1_create_user", { email: testEmail });
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
    });
    assert(!createErr && created.user, `createUser failed: ${createErr?.message}`);
    userId = created.user.id;

    log("2_upsert_profile", { userId });
    const { error: profileErr } = await admin.from("profiles").upsert({
      user_id: userId,
      email: testEmail,
      first_name: "E2E",
      last_name: "Tester",
      service: "EOD",
      company_name: null,
      account_type: "member",
      email_verified: false,
      admin_verified: false,
      verification_status: "awaiting_email_verification",
    });
    assert(!profileErr, `profile upsert failed: ${profileErr?.message}`);

    const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    });
    assert(!signInErr && signIn.session, `signIn failed: ${signInErr?.message}`);
    const accessToken = signIn.session.access_token;

    log("3_send_verification_email_api");
    const sendRes = await fetch(`${baseUrl}/api/auth/send-verification-email`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    assert(sendRes.ok, `send API status ${sendRes.status}`);
    const sendBody = await sendRes.json();
    assert(sendBody.ok === true, "send API body missing ok:true");

    const { data: tokensAfterSend } = await admin
      .from("email_verification_tokens")
      .select("id")
      .eq("user_id", userId);
    assert(
      (tokensAfterSend?.length ?? 0) >= 1,
      "no verification token row after send",
    );
    results.push("send_verification_email");

    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { error: tokenInsertErr } = await admin.from("email_verification_tokens").insert({
      user_id: userId,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });
    assert(!tokenInsertErr, `token insert failed: ${tokenInsertErr?.message}`);

    log("4_verify_email_link");
    const verifyRes = await fetch(
      `${baseUrl}/api/auth/verify-email?token=${encodeURIComponent(rawToken)}`,
      { redirect: "manual" },
    );
    const location = verifyRes.headers.get("location") ?? "";
    assert(
      verifyRes.status >= 300 && verifyRes.status < 400,
      `verify redirect expected, got ${verifyRes.status}`,
    );
    assert(
      location.includes("/email-verified"),
      `expected /email-verified redirect, got ${location}`,
    );
    results.push("verify_link_redirect");

    const { data: profileAfter } = await admin
      .from("profiles")
      .select("email_verified, verification_status, email_verified_at")
      .eq("user_id", userId)
      .single();
    assert(profileAfter?.email_verified === true, "email_verified not true");
    assert(
      profileAfter?.verification_status === "awaiting_admin_review",
      `status is ${profileAfter?.verification_status}`,
    );
    assert(!!profileAfter?.email_verified_at, "email_verified_at missing");
    results.push("profile_state_after_verify");

    log("5_token_reuse_blocked");
    const reuseRes = await fetch(
      `${baseUrl}/api/auth/verify-email?token=${encodeURIComponent(rawToken)}`,
      { redirect: "manual" },
    );
    const reuseLoc = reuseRes.headers.get("location") ?? "";
    assert(
      reuseLoc.includes("/verify-email") && reuseLoc.includes("error=invalid"),
      `reuse should fail, location=${reuseLoc}`,
    );
    results.push("token_single_use");

    log("6_pages_reachable");
    for (const path of ["/verify-email", "/email-verified", "/pending"]) {
      const pageRes = await fetch(`${baseUrl}${path}`);
      assert(pageRes.ok, `${path} returned ${pageRes.status}`);
    }
    results.push("holding_pages_200");

    log("PASS", { results, userId, testEmail });
    console.log("\n✓ Localhost verification test passed:");
    results.forEach((r) => console.log(`  - ${r}`));
    console.log(`\nTest account (delete manually if cleanup failed): ${testEmail}`);
  } catch (err) {
    console.error("\n✗ Localhost verification test failed:", err.message);
    process.exitCode = 1;
  } finally {
    if (userId) {
      await cleanup(userId);
      log("cleanup", { userId, ok: true });
    }
  }
}

main();
