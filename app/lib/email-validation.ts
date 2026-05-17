import { isDisposableEmailDomain } from "./disposable-email-domains";

export const EMAIL_MESSAGES = {
  invalid: "Please enter a valid email address.",
  fake: "Please use a real email address.",
} as const;

export type EmailValidationResult =
  | { ok: true; email: string }
  | { ok: false; code: "invalid" | "fake"; message: string };

const BLOCKED_DOMAINS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "test.com",
  "test",
  "invalid",
  "localhost",
]);

const BLOCKED_LOCAL_PATTERNS = new Set(["test", "fake", "spam", "noreply", "no-reply"]);

/** Obvious nonsense patterns (local@domain.tld all minimal). */
const NONSENSE_EMAILS = new Set([
  "a@b.c",
  "z@z.z",
  "y@y.y",
  "x@x.x",
  "test@test",
  "test@test.com",
  "a@a.com",
  "1@1.1",
]);

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function isValidLabel(label: string): boolean {
  if (!label || label.length > 63) return false;
  if (label.startsWith("-") || label.endsWith("-")) return false;
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label);
}

function isObviousNonsense(email: string, local: string, domain: string): boolean {
  if (NONSENSE_EMAILS.has(email)) return true;
  const labels = domain.split(".");
  if (labels.every((l) => l.length <= 1)) return true;
  if (local.length <= 1 && labels.every((l) => l.length <= 2)) return true;
  if (BLOCKED_LOCAL_PATTERNS.has(local) && labels[0] === "test") return true;
  return false;
}

export function validateEmailForRegistration(raw: string): EmailValidationResult {
  const email = normalizeEmail(raw);
  if (!email || email.length > 254) {
    return { ok: false, code: "invalid", message: EMAIL_MESSAGES.invalid };
  }
  if (email.includes("..") || /[\s<>()[\]\\,;:]/.test(email)) {
    return { ok: false, code: "invalid", message: EMAIL_MESSAGES.invalid };
  }

  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) {
    return { ok: false, code: "invalid", message: EMAIL_MESSAGES.invalid };
  }

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);

  if (!local || !domain || local.length > 64) {
    return { ok: false, code: "invalid", message: EMAIL_MESSAGES.invalid };
  }

  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local)) {
    return { ok: false, code: "invalid", message: EMAIL_MESSAGES.invalid };
  }

  if (isObviousNonsense(email, local, domain)) {
    return { ok: false, code: "fake", message: EMAIL_MESSAGES.fake };
  }

  if (BLOCKED_DOMAINS.has(domain)) {
    return { ok: false, code: "fake", message: EMAIL_MESSAGES.fake };
  }

  if (isDisposableEmailDomain(domain)) {
    return { ok: false, code: "fake", message: EMAIL_MESSAGES.fake };
  }

  const labels = domain.split(".");
  if (labels.length < 2) {
    return { ok: false, code: "invalid", message: EMAIL_MESSAGES.invalid };
  }

  const tld = labels[labels.length - 1];
  if (tld.length < 2 || tld.length > 63 || !/^[a-z]{2,63}$/i.test(tld)) {
    return { ok: false, code: "invalid", message: EMAIL_MESSAGES.invalid };
  }

  for (const label of labels) {
    if (!isValidLabel(label)) {
      return { ok: false, code: "invalid", message: EMAIL_MESSAGES.invalid };
    }
  }

  return { ok: true, email };
}
