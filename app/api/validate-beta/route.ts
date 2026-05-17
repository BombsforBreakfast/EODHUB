import { createHash, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { normalizeEmail } from "@/app/lib/email-validation";
import {
  getBetaAccessCode,
  isBetaAccessGranted,
  jsonWithBetaAccessCookie,
} from "@/app/lib/server/betaAccess";
import {
  BETA_ACCESS_DENIED_MESSAGE,
  isEmailEligibleForBetaAccess,
} from "@/app/lib/server/betaEligibility";
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
} from "@/app/lib/server/rateLimit";

export const dynamic = "force-dynamic";

const EMAIL_FORMAT =
  /^[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9])?@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

function secretMatches(submitted: string, expected: string): boolean {
  const hashA = createHash("sha256").update(submitted, "utf8").digest();
  const hashB = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(hashA, hashB);
}

function isPlausibleEmail(normalized: string): boolean {
  return normalized.length >= 5 && normalized.length <= 254 && EMAIL_FORMAT.test(normalized);
}

export async function GET(req: NextRequest) {
  return NextResponse.json({ granted: isBetaAccessGranted(req) });
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const limited = checkRateLimit(`validate-beta:${ip}`, { limit: 10, windowMs: 15 * 60 * 1000 });
  if (!limited.allowed) {
    return NextResponse.json(
      { success: false, message: rateLimitResponse(limited.retryAfterSec).message },
      { status: 429 },
    );
  }

  let body: { email?: unknown; code?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid request." }, { status: 400 });
  }

  const emailRaw = typeof body.email === "string" ? body.email : "";
  const normalizedEmail = normalizeEmail(emailRaw);
  const submittedCode = typeof body.code === "string" ? body.code.trim() : "";

  if (!normalizedEmail) {
    return NextResponse.json(
      { success: false, message: "Please enter your email address." },
      { status: 400 },
    );
  }

  if (!isPlausibleEmail(normalizedEmail)) {
    return NextResponse.json(
      { success: false, message: "Please enter a valid email address." },
      { status: 400 },
    );
  }

  if (!submittedCode) {
    return NextResponse.json(
      { success: false, message: "Please enter an access code." },
      { status: 400 },
    );
  }

  const { eligible, error: eligibilityError } = await isEmailEligibleForBetaAccess(normalizedEmail);
  if (eligibilityError === "missing_env") {
    return NextResponse.json({ success: false }, { status: 503 });
  }
  if (eligibilityError === "db_error") {
    return NextResponse.json(
      { success: false, message: "Something went wrong. Please try again in a moment." },
      { status: 503 },
    );
  }

  const expected = getBetaAccessCode();
  if (!expected) {
    return NextResponse.json({ success: false }, { status: 503 });
  }

  const codeOk = secretMatches(submittedCode, expected);
  if (eligible && codeOk) {
    return jsonWithBetaAccessCookie({ success: true });
  }

  return NextResponse.json(
    { success: false, message: BETA_ACCESS_DENIED_MESSAGE },
    { status: 401 },
  );
}
