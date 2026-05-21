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
  const limited = checkRateLimit(`validate-email:${ip}`, { limit: 10, windowMs: 15 * 60 * 1000 });
  if (!limited.allowed) {
    return errorResponse("rate_limited", 429);
  }

  let body: { email?: unknown };
  try {
    body = await req.json();
  } catch {
    return errorResponse("generic", 400);
  }

  const emailRaw = typeof body.email === "string" ? body.email : "";
  const validated = validateEmailForRegistration(emailRaw);
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
    return errorResponse(code, 400);
  }

  const domain = validated.email.split("@")[1];
  if (domain) {
    logMxCheckTelemetry(domain);
  }

  devAuthLog("validate-email", { step: "ok", domain });

  return NextResponse.json({ ok: true, email: validated.email });
}
