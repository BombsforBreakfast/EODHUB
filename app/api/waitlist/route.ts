import { NextRequest, NextResponse } from "next/server";
import { validateEmailForRegistration } from "@/app/lib/email-validation";
import { createSupabaseServiceRoleClient } from "@/app/lib/auth/adminAuthLookup";
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

export const dynamic = "force-dynamic";

const MAX_NAME = 80;
const MAX_SERVICE = 64;

function clampOptionalString(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function errorResponse(code: SignupErrorCode, status: number) {
  return NextResponse.json(
    { ok: false, code, message: userMessageForSignupCode(code) },
    { status },
  );
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const limited = checkRateLimit(`waitlist:${ip}`, { limit: 5, windowMs: 15 * 60 * 1000 });
  if (!limited.allowed) {
    return errorResponse("rate_limited", 429);
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return errorResponse("generic", 400);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return errorResponse("generic", 400);
  }

  const emailRaw = typeof body.email === "string" ? body.email : "";
  const validated = validateEmailForRegistration(emailRaw);
  if (!validated.ok) {
    const code = mapEmailValidationCode(validated.code);
    return errorResponse(code, 400);
  }

  const domain = validated.email.split("@")[1];
  if (domain) {
    logMxCheckTelemetry(domain);
  }

  const { client, error: envErr } = createSupabaseServiceRoleClient();
  if (envErr || !client) {
    return errorResponse("generic", 503);
  }

  const firstName = clampOptionalString(body.first_name, MAX_NAME);
  const lastName = clampOptionalString(body.last_name, MAX_NAME);
  const service = clampOptionalString(body.service, MAX_SERVICE);
  if (!firstName || !lastName || !service) {
    return errorResponse("generic", 400);
  }

  const row = {
    email: validated.email,
    first_name: firstName,
    last_name: lastName,
    service,
  };

  const { error } = await client.from("waitlist_signups").insert(row);
  if (error) {
    const dup = error.code === "23505" || /duplicate|unique/i.test(error.message ?? "");
    if (dup) {
      return NextResponse.json({ ok: true });
    }
    devAuthLog("waitlist", { step: "insert_failed" });
    return errorResponse("generic", 500);
  }

  devAuthLog("waitlist", { step: "ok", domain });
  return NextResponse.json({ ok: true });
}
