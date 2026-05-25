import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/app/lib/server/rateLimit";
import { devAuthLog } from "@/app/lib/auth/signupErrors";
import {
  authAccountExistsForEmail,
  normalizeLoginEmail,
} from "@/app/lib/server/loginEmailGuidance";

export const dynamic = "force-dynamic";

/**
 * After a failed password login with "invalid credentials", the client calls
 * this route to learn whether the email has no auth account yet.
 *
 * Rate-limited and returns only `suggestCreateAccount` — no waitlist/profile
 * details. Wrong-password cases (auth user exists) always get false.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const limited = checkRateLimit(`login-guidance:${ip}`, {
    limit: 20,
    windowMs: 15 * 60 * 1000,
  });
  if (!limited.allowed) {
    return NextResponse.json({ suggestCreateAccount: false });
  }

  let body: { email?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ suggestCreateAccount: false });
  }

  const normalizedEmail =
    typeof body.email === "string" ? normalizeLoginEmail(body.email) : null;
  if (!normalizedEmail) {
    return NextResponse.json({ suggestCreateAccount: false });
  }

  const emailLimited = checkRateLimit(`login-guidance:email:${normalizedEmail}`, {
    limit: 8,
    windowMs: 15 * 60 * 1000,
  });
  if (!emailLimited.allowed) {
    return NextResponse.json({ suggestCreateAccount: false });
  }

  const exists = await authAccountExistsForEmail(normalizedEmail);
  const suggestCreateAccount = exists === false;

  devAuthLog("login-guidance", {
    step: suggestCreateAccount ? "suggest_create_account" : "no_suggestion",
    exists,
  });

  return NextResponse.json({ suggestCreateAccount });
}
