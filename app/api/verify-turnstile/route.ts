import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { token } = await req.json();

  if (!token) {
    return NextResponse.json({ success: false, error: "Missing token" }, { status: 400 });
  }

  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // Fail closed when misconfigured so bot protection is never silently bypassed.
    return NextResponse.json({ success: false, error: "Turnstile is not configured" }, { status: 503 });
  }

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret, response: token }),
  });

  const data = await res.json() as { success: boolean };
  if (!data.success) {
    return NextResponse.json({ success: false, error: "Verification failed" }, { status: 403 });
  }

  return NextResponse.json({ success: true });
}
