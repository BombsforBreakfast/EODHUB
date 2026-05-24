import { NextRequest, NextResponse } from "next/server";
import { validateEmailForRegistration } from "@/app/lib/email-validation";
import {
  createSupabaseServiceRoleClient,
  findAuthUsersByEmail,
} from "@/app/lib/auth/adminAuthLookup";
import { ensureProfileStubForUser } from "@/app/lib/auth/ensureProfileStub";
import { logMxCheckTelemetry } from "@/app/lib/server/emailMxCheck";
import {
  logAllowed,
  logBlocked,
  checkSignupVelocity,
  isSignupRateLimitExemptEmail,
  type SignupAttemptReason,
} from "@/app/lib/server/signupAttempts";
import {
  checkRateLimit,
  getClientIp,
} from "@/app/lib/server/rateLimit";
import {
  devAuthLog,
  mapEmailValidationCode,
  mapSupabaseAuthError,
  userMessageForSignupCode,
  type SignupErrorCode,
} from "@/app/lib/auth/signupErrors";

export const dynamic = "force-dynamic";

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

function errorResponse(code: SignupErrorCode, status: number) {
  return NextResponse.json(
    { ok: false, code, message: userMessageForSignupCode(code) },
    { status },
  );
}

function reasonFromValidationCode(code: "invalid" | "fake"): SignupAttemptReason {
  return code === "fake" ? "disposable_domain" : "invalid_syntax";
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent");

  // --- 1. Parse body --------------------------------------------------------
  let body: { email?: unknown; password?: unknown; turnstileToken?: unknown };
  try {
    body = await req.json();
  } catch {
    return errorResponse("generic", 400);
  }

  const emailRaw = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";
  const turnstileToken =
    typeof body.turnstileToken === "string" ? body.turnstileToken : "";
  const isRateLimitExempt = isSignupRateLimitExemptEmail(emailRaw);

  // --- 2. Per-process burst limit ------------------------------------------
  // Cheap in-memory check to keep a single instance honest before we touch
  // any external services. Persisted velocity check below catches scripted
  // abuse that spreads across cold starts / regions.
  const burst = checkRateLimit(`signup:${ip}`, {
    limit: 3,
    windowMs: 10 * 60 * 1000,
  });
  if (!isRateLimitExempt && !burst.allowed) {
    void logBlocked({
      ip,
      userAgent,
      email: emailRaw,
      domain: null,
      reason: "rate_limited_burst",
    });
    return errorResponse("rate_limited", 429);
  }

  if (!password || password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    // Don't leak which field — single generic message.
    return errorResponse("generic", 400);
  }

  // --- 3. Turnstile (temporarily disabled) ---------------------------------
  // Was blocking legitimate users (Facebook in-app browser, etc.). Velocity
  // limits + disposable-email checks below remain the active abuse defense.
  void turnstileToken; // tolerate clients still sending the field
  const noTurnstileToken = true;

  // --- 4. Email syntax + disposable + manual blocklist ---------------------
  const validated = validateEmailForRegistration(emailRaw);
  if (!validated.ok) {
    const reason = reasonFromValidationCode(validated.code);
    const domainGuess = emailRaw.includes("@")
      ? emailRaw.split("@")[1]?.toLowerCase() ?? null
      : null;
    devAuthLog("signup-route", { step: "email_rejected", code: reason, domain: domainGuess });
    void logBlocked({
      ip,
      userAgent,
      email: emailRaw,
      domain: domainGuess,
      reason,
    });
    return errorResponse(mapEmailValidationCode(validated.code), 400);
  }
  const normalizedEmail = validated.email;
  const domain = normalizedEmail.split("@")[1] ?? null;

  // --- 5. Persisted velocity check (IP + email over rolling windows) -------
  const velocity = await checkSignupVelocity({
    ip,
    email: normalizedEmail,
    noTurnstileToken,
  });
  if (!velocity.ok) {
    void logBlocked({
      ip,
      userAgent,
      email: normalizedEmail,
      domain,
      reason: velocity.reason,
    });
    return errorResponse("rate_limited", 429);
  }

  // --- 6. Create auth user via service role --------------------------------
  const { client, error: envErr } = createSupabaseServiceRoleClient();
  if (envErr || !client) {
    console.error("signup: missing service role env");
    void logBlocked({
      ip,
      userAgent,
      email: normalizedEmail,
      domain,
      reason: "config_error",
    });
    return errorResponse("generic", 503);
  }

  // email_confirm: true matches the project's auto-confirm setting so the
  // client can immediately signInWithPassword. The product-level email
  // verification (Resend) still runs after onboarding via
  // /api/auth/send-verification-email — that is the trust layer that gates
  // platform access.
  const { data, error: createErr } = await client.auth.admin.createUser({
    email: normalizedEmail,
    password,
    email_confirm: true,
  });

  if (createErr) {
    const mapped = mapSupabaseAuthError(createErr.message ?? "");
    devAuthLog("signup-route", {
      step: "admin_create_failed",
      code: mapped,
    });

    if (mapped === "duplicate_account") {
      const { users } = await findAuthUsersByEmail(client, normalizedEmail);
      const existingUserId = users[0]?.id;
      if (existingUserId) {
        await ensureProfileStubForUser(client, existingUserId, normalizedEmail);
        void logBlocked({
          ip,
          userAgent,
          email: normalizedEmail,
          domain,
          reason: "supabase_duplicate_account",
        });
        return errorResponse("account_exists_login", 400);
      }
    }

    void logBlocked({
      ip,
      userAgent,
      email: normalizedEmail,
      domain,
      reason: `supabase_${mapped}` as SignupAttemptReason,
    });
    // 400 for duplicate / invalid; 429 for upstream rate limit.
    const status = mapped === "rate_limited" ? 429 : 400;
    return errorResponse(mapped, status);
  }

  const newUserId = data.user?.id ?? null;
  if (newUserId) {
    const stub = await ensureProfileStubForUser(client, newUserId, normalizedEmail);
    if (!stub.ok) {
      devAuthLog("signup-route", {
        step: "profile_stub_failed",
        userId: newUserId,
        error: stub.error,
      });
    }
  }

  // --- 7. Allowed: log + telemetry, return success -------------------------
  void logAllowed({
    ip,
    userAgent,
    email: normalizedEmail,
    domain,
    supabaseUserId: data.user?.id ?? null,
  });
  if (domain) logMxCheckTelemetry(domain);

  devAuthLog("signup-route", {
    step: "ok",
    domain,
    userId: data.user?.id ?? null,
  });

  return NextResponse.json({ ok: true, email: normalizedEmail });
}
