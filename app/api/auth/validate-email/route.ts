import { NextRequest, NextResponse } from "next/server";
import { validateEmailForRegistration } from "@/app/lib/email-validation";
import { logMxCheckTelemetry } from "@/app/lib/server/emailMxCheck";
import {
  devAuthLog,
  mapEmailValidationCode,
  userMessageForSignupCode,
  type SignupErrorCode,
} from "@/app/lib/auth/signupErrors";
import {
  checkRateLimit,
  getClientIp,
} from "@/app/lib/server/rateLimit";
import { logBlocked } from "@/app/lib/server/signupAttempts";
import { logFailedAuthAttempt } from "@/app/lib/server/logFailedAuthAttempt";
import {
  getActiveAuthAccessOverride,
  type ActiveAuthAccessOverride,
} from "@/app/lib/server/authAccessOverrides";

export const dynamic = "force-dynamic";

function errorResponse(code: SignupErrorCode, status: number) {
  return NextResponse.json(
    {
      ok: false,
      code,
      message: userMessageForSignupCode(code),
    },
    { status },
  );
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent");

  let body: { email?: unknown };
  try {
    body = await req.json();
  } catch {
    return errorResponse("generic", 400);
  }

  const emailRaw = typeof body.email === "string" ? body.email : "";

  // Lazy-load the override only when a block actually triggers — the
  // common path doesn't touch the auth_access_overrides table at all.
  let accessOverrideCache: { value: ActiveAuthAccessOverride | null } | null = null;
  async function loadAccessOverride(): Promise<ActiveAuthAccessOverride | null> {
    if (!accessOverrideCache) {
      accessOverrideCache = {
        value: await getActiveAuthAccessOverride(emailRaw, ip),
      };
    }
    return accessOverrideCache.value;
  }

  const limited = checkRateLimit(`validate-email:${ip}`, { limit: 10, windowMs: 15 * 60 * 1000 });
  if (!limited.allowed) {
    const override = await loadAccessOverride();
    if (!override) {
      void logFailedAuthAttempt({
        failureReason: "RATE_LIMITED",
        errorCode: "validate_email_rate_limited",
        sourceRoute: "/api/auth/validate-email",
        request: req,
      });
      return errorResponse("rate_limited", 429);
    }
  }

  let validated = validateEmailForRegistration(emailRaw);
  if (!validated.ok) {
    const override = await loadAccessOverride();
    if (override?.scope === "full") {
      validated = { ok: true as const, email: emailRaw.trim().toLowerCase() };
    }
  }
  if (!validated.ok) {
    const code = mapEmailValidationCode(validated.code);
    devAuthLog("validate-email", {
      step: "client_rules",
      code,
      domain: emailRaw.includes("@") ? emailRaw.split("@")[1]?.toLowerCase() : undefined,
    });
    void logBlocked({
      ip,
      userAgent,
      email: emailRaw,
      domain: emailRaw.includes("@") ? emailRaw.split("@")[1]?.toLowerCase() ?? null : null,
      reason: code === "disposable_domain" ? "disposable_domain" : "invalid_syntax",
    });
    void logFailedAuthAttempt({
      emailAttempted: emailRaw,
      failureReason: "EMAIL_VALIDATION_FAILED",
      errorCode: code,
      sourceRoute: "/api/auth/validate-email",
      request: req,
    });
    return errorResponse(code, 400);
  }

  const domain = validated.email.split("@")[1];
  if (domain) {
    logMxCheckTelemetry(domain);
  }

  devAuthLog("validate-email", { step: "ok", domain });

  return NextResponse.json({ ok: true, email: validated.email });
}
