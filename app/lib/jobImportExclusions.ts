/** Owner-authorized title terms only. Never inspect descriptions or employers. */
export const JOB_TITLE_TERM_EXCLUSIONS = ["paramedic", "74D", "EMT", "firefighter", "police"] as const;
export function jobImportExclusionReason(title: string, _employerContext = ""): string | null {
  void _employerContext; // Retain the legacy signature without using employer text.
  if (/(^|[^a-z0-9])paramedics?([^a-z0-9]|$)/i.test(title)) return "Title contains paramedic";
  if (/(^|[^a-z0-9])74d([^a-z0-9]|$)/i.test(title)) return "Title contains 74D";
  if (/(^|[^a-z0-9])emts?([^a-z0-9]|$)/i.test(title)) return "Title contains EMT";
  if (/(^|[^a-z0-9])firefighters?([^a-z0-9]|$)/i.test(title)) return "Title contains firefighter";
  if (/(^|[^a-z0-9])police([^a-z0-9]|$)/i.test(title)) return "Title contains police";
  return null;
}
