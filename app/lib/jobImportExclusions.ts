/** Hard role exclusions shared by every automated job intake. Match titles, not qualifications mentioned in an otherwise relevant role. */
export function jobImportExclusionReason(title: string): string | null {
  const normalized = title.normalize("NFKC").replace(/[\u2010-\u2015]/g, "-");
  if (/\bintern(?:s|ships?)?\b/i.test(normalized)) return "Intern role";
  if (/\bstudent(?:s|ships?)?\b/i.test(normalized)) return "Student role";
  if (/\bpost[\s-]*doctoral\b/i.test(normalized)) return "Postdoctoral role";
  if (/\bhuman[\s-]+resources?\b/i.test(normalized) || /\bhr\b/i.test(normalized)) return "Human resources role";
  if (/\bbudget(?:s|ing|ary|ed)?\b/i.test(normalized)) return "Budget role";
  if (/\bdecontamination[\s/-]+specialists?\b/i.test(normalized)) return "Decontamination specialist role";
  if (
    /\b(?:a?emt|nremt)s?\b/i.test(normalized) ||
    /\be[.\s]m[.\s]t\b/i.test(normalized) ||
    /\bemergency[\s/-]+medical[\s/-]+(?:technician|tech)s?\b/i.test(normalized) ||
    /\bpara[\s-]?medic(?:s|ine)?\b/i.test(normalized)
  ) return "EMT / Paramedic role";
  if (/\bpolice[\s/-]+officers?\b/i.test(normalized)) return "Police officer role";
  if (/\ball[\s-]*source\b/i.test(normalized) && /\banalysts?\b/i.test(normalized)) {
    return "All-source analyst role";
  }
  if (/\bfire[\s-]*fighters?\b/i.test(normalized)) return "Firefighter role";
  if (
    /\bnurs(?:es?|ing)\b/i.test(normalized) ||
    /\b(?:rn|lpn|lvn|aprn|crna)s?\b/i.test(normalized) ||
    /\br\.n\b/i.test(normalized)
  ) {
    return "Nurse role";
  }
  return null;
}

