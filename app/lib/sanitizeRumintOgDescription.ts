/**
 * Open Graph descriptions from some military news sites include the full global nav
 * as plain text. Strip at known boilerplate starts and cap length.
 */
const JUNK_START_PATTERNS: RegExp[] = [
  /\bProfile\s+Profile\b/,
  /\bSubscriptions\s+Log out\b/,
  /\bNews\s+Home\s+Army\b/,
  /\bMilitary Life\s+Home\b/,
  /\bVeteran Jobs\s+Home\b/,
  /\bBenefits\s+Benefits\s+Home\b/,
  /\bMilitary Pay\s+and\s+Money\b/,
  /\bOpinion\s+Opinion\s+Home\b/,
];

const MAX_LEN = 280;

export function sanitizeRumintOgDescription(desc: string | null | undefined): string | null {
  if (!desc?.trim()) return null;
  let s = desc.trim();
  for (const re of JUNK_START_PATTERNS) {
    const m = s.match(re);
    if (m && m.index != null && m.index > 40) {
      s = s.slice(0, m.index).trim();
      break;
    }
  }
  if (s.length > MAX_LEN) {
    const cut = s.slice(0, MAX_LEN);
    const lastSpace = cut.lastIndexOf(" ");
    s = (lastSpace > 50 ? cut.slice(0, lastSpace) : cut) + "…";
  }
  return s || null;
}
