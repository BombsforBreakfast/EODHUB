import { promises as dns } from "dns";
import { devAuthLog } from "@/app/lib/auth/signupErrors";

const MX_TIMEOUT_MS = 4000;

const MAJOR_PROVIDER_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
]);

export type MxTelemetryResult = {
  domain: string;
  reason: "allowlisted" | "mx_ok" | "no_mx" | "timeout" | "dns_error";
  deliverable: boolean | null;
};

/**
 * MX/DNS probe for telemetry only — must NOT block signup.
 * Resend verification + admin approval are the trust layers.
 */
export async function probeDomainMxTelemetry(domain: string): Promise<MxTelemetryResult> {
  const normalized = domain.trim().toLowerCase();
  if (MAJOR_PROVIDER_DOMAINS.has(normalized)) {
    return { domain: normalized, reason: "allowlisted", deliverable: true };
  }

  try {
    const records = await Promise.race([
      dns.resolveMx(normalized),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("mx_timeout")), MX_TIMEOUT_MS);
      }),
    ]);
    const ok = Array.isArray(records) && records.length > 0;
    return {
      domain: normalized,
      reason: ok ? "mx_ok" : "no_mx",
      deliverable: ok,
    };
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (err instanceof Error && err.message === "mx_timeout") {
      return { domain: normalized, reason: "timeout", deliverable: null };
    }
    if (code === "ENOTFOUND" || code === "ENODATA") {
      return { domain: normalized, reason: "no_mx", deliverable: false };
    }
    return { domain: normalized, reason: "dns_error", deliverable: null };
  }
}

/** Fire-and-forget MX telemetry (never blocks registration). */
export function logMxCheckTelemetry(domain: string): void {
  void probeDomainMxTelemetry(domain).then((result) => {
    devAuthLog("mx-telemetry", result as unknown as Record<string, unknown>);
  });
}

/**
 * @deprecated Do not use for gating signup. Kept for any legacy callers during migration.
 */
export async function domainHasMxRecords(domain: string): Promise<boolean> {
  const result = await probeDomainMxTelemetry(domain);
  return result.deliverable !== false;
}
