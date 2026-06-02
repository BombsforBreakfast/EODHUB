const LINKEDIN_HOST_PATTERN = /^(?:www\.)?linkedin\.com$/i;
const LINKEDIN_IN_PATH_PATTERN = /^\/in\/([a-zA-Z0-9_-]+)\/?$/;

export function normalizeLinkedInUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, url: "" };

  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate.replace(/^\/+/, "")}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false, error: "Enter a valid LinkedIn profile URL." };
  }

  if (!LINKEDIN_HOST_PATTERN.test(parsed.hostname)) {
    return { ok: false, error: "LinkedIn URL must be a linkedin.com/in/ profile link." };
  }

  const match = parsed.pathname.match(LINKEDIN_IN_PATH_PATTERN);
  if (!match?.[1]) {
    return { ok: false, error: "Use a LinkedIn profile URL like linkedin.com/in/your-name." };
  }

  return { ok: true, url: `https://www.linkedin.com/in/${match[1]}` };
}
