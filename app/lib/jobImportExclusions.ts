/** Intake is positive-only; job titles and employers are never blacklisted. */
export function jobImportExclusionReason(_title: string, _employerContext = ""): string | null { return null; }
