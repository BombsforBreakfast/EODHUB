import { NextRequest, NextResponse } from "next/server";
import { validateEmailForRegistration } from "@/app/lib/email-validation";
import {
  collectIdentityProviders,
  createSupabaseServiceRoleClient,
  findAuthUsersByEmail,
} from "@/app/lib/auth/adminAuthLookup";
import { ensureProfileStubForUser } from "@/app/lib/auth/ensureProfileStub";
import { insertOnboardingEvent } from "@/app/lib/onboardingAnalyticsServer";
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
import { logFailedAuthAttempt } from "@/app/lib/server/logFailedAuthAttempt";
import {
  getActiveAuthAccessOverride,
  type ActiveAuthAccessOverride,
} from "@/app/lib/server/authAccessOverrides";

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

  // Admin overrides are only consulted lazily — when a block actually
  // triggers — so the common (no-override) signup path stays a single round
  // trip. `loadAccessOverride()` memoizes the lookup for the request.
  let accessOverrideCache: { value: ActiveAuthAccessOverride | null } | null = null;
  async function loadAccessOverride(): Promise<ActiveAuthAccessOverride | null> {
    if (!accessOverrideCache) {
      accessOverrideCache = {
        value: await getActiveAuthAccessOverride(emailRaw, ip),
      };
    }
    return accessOverrideCache.value;
  }

  // --- 2. Per-process burst limit ------------------------------------------
  // Cheap in-memory check to keep a single instance honest before we touch
  // any external services. Persisted velocity check below catches scripted
  // abuse that spreads across cold starts / regions.
  const burst = checkRateLimit(`signup:${ip}`, {
    limit: 3,
    windowMs: 10 * 60 * 1000,
  });
  const burstOverride =
    !isRateLimitExempt && !burst.allowed ? await loadAccessOverride() : null;
  if (!isRateLimitExempt && !burstOverride && !burst.allowed) {
    void logBlocked({
      ip,
      userAgent,
      email: emailRaw,
      domain: null,
      reason: "rate_limited_burst",
    });
    void logFailedAuthAttempt({
      emailAttempted: emailRaw,
      failureReason: "RATE_LIMITED",
      errorCode: "rate_limited_burst",
      sourceRoute: "/api/auth/signup",
      request: req,
    });
    return errorResponse("rate_limited", 429);
  }

  if (!password || password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    void logFailedAuthAttempt({
      emailAttempted: emailRaw,
      failureReason: "CLIENT_VALIDATION_FAILED",
      errorCode: "bad_password_length",
      sourceRoute: "/api/auth/signup",
      request: req,
    });
    // Don't leak which field — single generic message.
    return errorResponse("generic", 400);
  }

  // --- 3. Turnstile (temporarily disabled) ---------------------------------
  // Was blocking legitimate users (Facebook in-app browser, etc.). Velocity
  // limits + disposable-email checks below remain the active abuse defense.
  void turnstileToken; // tolerate clients still sending the field
  const noTurnstileToken = true;

  // --- 4. Email syntax + disposable + manual blocklist ---------------------
  let validated = validateEmailForRegistration(emailRaw);
  if (!validated.ok) {
    // Only consult the override on the failure path — the common path
    // (valid email) never touches the override table.
    const override = await loadAccessOverride();
    if (override?.scope === "full") {
      validated = { ok: true as const, email: emailRaw.trim().toLowerCase() };
    }
  }
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
    void logFailedAuthAttempt({
      emailAttempted: emailRaw,
      failureReason: "EMAIL_VALIDATION_FAILED",
      errorCode: reason,
      sourceRoute: "/api/auth/signup",
      request: req,
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
    void logFailedAuthAttempt({
      emailAttempted: normalizedEmail,
      failureReason: "RATE_LIMITED",
      errorCode: velocity.reason,
      sourceRoute: "/api/auth/signup",
      request: req,
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
    void logFailedAuthAttempt({
      emailAttempted: normalizedEmail,
      failureReason: "SERVER_ERROR",
      errorCode: "missing_service_role",
      sourceRoute: "/api/auth/signup",
      request: req,
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

    // For any createUser failure (not just mapped duplicates), look up whether
    // the email already exists. Supabase OAuth-conflict errors often slip past
    // mapSupabaseAuthError as "generic" — provider lookup catches those and
    // distinguishes email/password duplicates from OAuth-only accounts.
    const { users } = await findAuthUsersByEmail(client, normalizedEmail);
    const existingUser = users[0] ?? null;

    if (existingUser) {
      const providers = collectIdentityProviders(existingUser);
      const hasEmailIdentity = providers.includes("email");
      const oauthProviders = providers.filter((p) => p !== "email");

      await ensureProfileStubForUser(client, existingUser.id, normalizedEmail);

      if (!hasEmailIdentity && oauthProviders.length > 0) {
        // OAuth-only account — user should sign in with the existing provider
        // or use the consolidation flow (reset-password email) to add a password.
        void logBlocked({
          ip,
          userAgent,
          email: normalizedEmail,
          domain,
          reason: "oauth_account_exists",
        });
        void logFailedAuthAttempt({
          emailAttempted: normalizedEmail,
          failureReason: "OAUTH_ACCOUNT_EXISTS",
          errorCode: `oauth_${oauthProviders.join("_")}`,
          rawErrorMessage: createErr.message ?? null,
          sourceRoute: "/api/auth/signup",
          request: req,
          userExistsInAuth: true,
          userExistsInProfiles: true,
        });
        return NextResponse.json(
          {
            ok: false,
            code: "oauth_account_exists" as SignupErrorCode,
            message: userMessageForSignupCode("oauth_account_exists"),
            providers: oauthProviders,
          },
          { status: 400 },
        );
      }

      // Email/password identity already exists — point them at login.
      void logBlocked({
        ip,
        userAgent,
        email: normalizedEmail,
        domain,
        reason: "supabase_duplicate_account",
      });
      void logFailedAuthAttempt({
        emailAttempted: normalizedEmail,
        failureReason: "ACCOUNT_CREATION_FAILED",
        errorCode: "account_exists_login",
        rawErrorMessage: createErr.message ?? null,
        sourceRoute: "/api/auth/signup",
        request: req,
        userExistsInAuth: true,
        userExistsInProfiles: true,
      });
      return errorResponse("account_exists_login", 400);
    }

    // No existing user → genuine creation failure (rate limited upstream,
    // invalid input we didn't catch, server config drift, etc.).
    void logBlocked({
      ip,
      userAgent,
      email: normalizedEmail,
      domain,
      reason: `supabase_${mapped}` as SignupAttemptReason,
    });
    void logFailedAuthAttempt({
      emailAttempted: normalizedEmail,
      failureReason: "ACCOUNT_CREATION_FAILED",
      errorCode: `supabase_${mapped}`,
      rawErrorMessage: createErr.message ?? null,
      sourceRoute: "/api/auth/signup",
      request: req,
      userExistsInAuth: false,
      userExistsInProfiles: false,
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
      void logFailedAuthAttempt({
        emailAttempted: normalizedEmail,
        failureReason: "PROFILE_CREATION_FAILED",
        errorCode: "ensure_profile_stub_failed",
        rawErrorMessage: stub.error,
        sourceRoute: "/api/auth/signup",
        request: req,
        userExistsInAuth: true,
        userExistsInProfiles: false,
      });
    } else {
      void insertOnboardingEvent(client, newUserId, "signup_complete", "success", {
        provider: "email",
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
