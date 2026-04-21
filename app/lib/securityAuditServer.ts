import { createClient } from "@supabase/supabase-js";

type SecurityAuditOutcome = "allow" | "deny" | "error";

type SecurityAuditEvent = {
  actorUserId?: string | null;
  route: string;
  action: string;
  outcome: SecurityAuditOutcome;
  httpStatus?: number | null;
  metadata?: Record<string, unknown>;
};

/**
 * Best-effort server-side security audit logging.
 *
 * This helper intentionally never throws so critical user flows never fail
 * due to audit table issues.
 */
export async function logSecurityAuditEvent(event: SecurityAuditEvent): Promise<void> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceRole) return;

    const adminClient = createClient(url, serviceRole);
    await adminClient.from("security_audit_events").insert({
      actor_user_id: event.actorUserId ?? null,
      route: event.route,
      action: event.action,
      outcome: event.outcome,
      http_status: event.httpStatus ?? null,
      metadata: event.metadata ?? {},
    });
  } catch {
    // Best effort only; never break request handling.
  }
}

