/** Hard role exclusions shared by every automated job intake. Match titles, not qualifications mentioned in an otherwise relevant role. */
export function jobImportExclusionReason(title: string): string | null {
  const normalized = title.normalize("NFKC").replace(/[\u2010-\u2015]/g, "-");
  if (/\bintern(?:s|ships?)?\b/i.test(normalized)) return "Intern role";
  if (
    /\b(?:a?emt|nremt)s?\b/i.test(normalized) ||
    /\be[.\s]m[.\s]t\b/i.test(normalized) ||
    /\bemergency[\s/-]+medical[\s/-]+(?:technician|tech)s?\b/i.test(normalized) ||
    /\bpara[\s-]?medic(?:s|ine)?\b/i.test(normalized)
  ) return "EMT / Paramedic role";
  return null;
}

