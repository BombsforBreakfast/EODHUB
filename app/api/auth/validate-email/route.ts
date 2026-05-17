import { NextRequest, NextResponse } from "next/server";
import { validateEmailForRegistration } from "@/app/lib/email-validation";
import { domainHasMxRecords } from "@/app/lib/server/emailMxCheck";
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
} from "@/app/lib/server/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const limited = checkRateLimit(`validate-email:${ip}`, { limit: 10, windowMs: 15 * 60 * 1000 });
  if (!limited.allowed) {
    return NextResponse.json(rateLimitResponse(limited.retryAfterSec), { status: 429 });
  }

  let body: { email?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request." }, { status: 400 });
  }

  const emailRaw = typeof body.email === "string" ? body.email : "";
  const validated = validateEmailForRegistration(emailRaw);
  if (!validated.ok) {
    return NextResponse.json({ ok: false, message: validated.message }, { status: 400 });
  }

  const domain = validated.email.split("@")[1];
  if (domain && !(await domainHasMxRecords(domain))) {
    return NextResponse.json(
      { ok: false, message: "Please use a real email address." },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, email: validated.email });
}
