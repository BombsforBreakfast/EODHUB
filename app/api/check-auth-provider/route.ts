import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServiceRoleClient, getProvidersForEmail } from "../../lib/auth/adminAuthLookup";
import { logSecurityAuditEvent } from "@/app/lib/securityAuditServer";

export async function POST(req: NextRequest) {
  const routePath = "/api/check-auth-provider";
  let email: unknown;
  try {
    const body = await req.json() as { email?: unknown };
    email = body.email;
  } catch {
    return NextResponse.json({ providers: [] as string[] });
  }
  if (!email || typeof email !== "string") {
    return NextResponse.json({ providers: [] as string[] });
  }

  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return NextResponse.json({ providers: [] as string[] });
  }

  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) {
    // Deliberately do not disclose provider info to unauthenticated callers.
    await logSecurityAuditEvent({
      route: routePath,
      action: "lookup_auth_providers",
      outcome: "deny",
      httpStatus: 200,
      metadata: { reason: "missing_bearer" },
    });
    return NextResponse.json({ providers: [] as string[] });
  }
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    await logSecurityAuditEvent({
      route: routePath,
      action: "lookup_auth_providers",
      outcome: "deny",
      httpStatus: 200,
      metadata: { reason: "invalid_session" },
    });
    return NextResponse.json({ providers: [] as string[] });
  }
  if ((user.email ?? "").toLowerCase() !== normalized) {
    // Only allow checking the caller's own email to prevent account enumeration.
    await logSecurityAuditEvent({
      actorUserId: user.id,
      route: routePath,
      action: "lookup_auth_providers",
      outcome: "deny",
      httpStatus: 200,
      metadata: { reason: "cross_email_lookup_blocked" },
    });
    return NextResponse.json({ providers: [] as string[] });
  }

  const { client, error } = createSupabaseServiceRoleClient();
  if (error === "missing_env") {
    return NextResponse.json({ providers: [] as string[], error: "unavailable" }, { status: 503 });
  }

  const { providers, listError } = await getProvidersForEmail(client!, normalized);
  if (listError) {
    await logSecurityAuditEvent({
      actorUserId: user.id,
      route: routePath,
      action: "lookup_auth_providers",
      outcome: "error",
      httpStatus: 503,
      metadata: { reason: "lookup_failed", message: listError },
    });
    return NextResponse.json({ providers: [] as string[], error: "lookup_failed" }, { status: 503 });
  }

  await logSecurityAuditEvent({
    actorUserId: user.id,
    route: routePath,
    action: "lookup_auth_providers",
    outcome: "allow",
    httpStatus: 200,
    metadata: { providerCount: providers.length },
  });

  return NextResponse.json({ providers });
}
