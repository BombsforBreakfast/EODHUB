import { DISPOSABLE_DOMAINS_GENERATED } from "./disposable-email-domains.generated";

/**
 * Manually maintained blocklist for abuse domains we've seen in logs that
 * are NOT (yet) in the upstream community list. Add domains here as a fast
 * patch; consider upstreaming via PR to
 * https://github.com/disposable-email-domains/disposable-email-domains
 */
const DISPOSABLE_DOMAINS_MANUAL: ReadonlySet<string> = Object.freeze(
  new Set<string>([
    // Seen attempting to bypass admin queue (2026-05).
    "monfee.com",
  ]),
);

function inAnyList(domain: string): boolean {
  return (
    DISPOSABLE_DOMAINS_GENERATED.has(domain) ||
    DISPOSABLE_DOMAINS_MANUAL.has(domain)
  );
}

/**
 * Returns true if `domain` (or its registrable parent) is a known disposable
 * / throwaway / abuse email domain.
 *
 * Empty domains are treated as disposable (defense in depth — should never
 * reach here from validated email input, but keeps the contract safe).
 */
export function isDisposableEmailDomain(domain: string): boolean {
  const d = domain.trim().toLowerCase();
  if (!d) return true;
  if (inAnyList(d)) return true;

  // Catch foo.bar.mailinator.com style subdomain bypass by progressively
  // stripping leading labels and checking each suffix against both lists.
  const parts = d.split(".");
  for (let i = 1; i < parts.length - 1; i++) {
    const suffix = parts.slice(i).join(".");
    if (inAnyList(suffix)) return true;
  }

  return false;
}
