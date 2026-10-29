/** Shared title exclusions, plus employer-specific exclusions using structured source context. Descriptions alone do not exclude a relevant role. */
export function jobImportExclusionReason(title: string, employerContext = ""): string | null {
  const normalized = title.normalize("NFKC").replace(/[\u2010-\u2015]/g, "-");
  const sourceContext = `${normalized}\n${employerContext.normalize("NFKC").replace(/[\u2010-\u2015]/g, "-")}`;
  if (/\b(?:air[\s-]+force|usaf)\b/i.test(sourceContext) && /\ba[\s/-]*10\b/i.test(sourceContext)) {
    return "Air Force A10 listing";
  }
  if (/\bintern(?:s|ships?)?\b/i.test(normalized)) return "Intern role";
  if (/\bstudent(?:s|ships?)?\b/i.test(normalized)) return "Student role";
  if (/\bpost[\s-]*doctoral\b/i.test(normalized)) return "Postdoctoral role";
  // An hourly pay rate in the title is not a human resources role.
  const withoutHourlyRates = normalized.replace(/\b\d[\d.,]*\s*(?:\/|per)\s*hrs?\b/gi, "");
  if (/\bhuman[\s-]+resources?\b/i.test(normalized) || /\bhr\b/i.test(withoutHourlyRates)) return "Human resources role";
  if (/\bbudget(?:s|ing|ary|ed)?\b/i.test(normalized)) return "Budget role";
  if (/\bdecontamination[\s/-]+specialists?\b/i.test(normalized)) return "Decontamination specialist role";
  if (/\bm[.\s-]*d[.\s-]*d[.\s-]*u\b/i.test(normalized)) return "MDDU role";
  if (/\bj[\s/-]*3[\s/-]*9\b/i.test(normalized)) return "J39 role";
  if (
    /\b(?:i\.?t\.?|information[\s-]+technology)(?:\s*\(\s*i\.?t\.?\s*\))?[\s/-]+(?:(?:customer|technical|support|cybersecurity|security|network|systems?|operations|services?)[\s/-]+)*specialists?\b/i.test(normalized)
  ) return "IT specialist role";
  if (
    /\b(?:a?emt|nremt)s?\b/i.test(normalized) ||
    /\be[.\s]m[.\s]t\b/i.test(normalized) ||
    /\bemergency[\s/-]+medical[\s/-]+(?:technician|tech)s?\b/i.test(normalized) ||
    /\bpara[\s-]?medic(?:s|ine)?\b/i.test(normalized)
  ) return "EMT / Paramedic role";
  if (
    /\be[.\s]*m[.\s]*s\b/i.test(normalized) ||
    /\bemergency[\s/-]+medical[\s/-]+(?:services?|svcs)\b/i.test(normalized)
  ) return "EMS role";
  if (/\bpolice[\s/-]+officers?\b/i.test(normalized)) return "Police officer role";
  if (/\b(?:under[\s-]*)?sheriffs?\b/i.test(normalized)) return "Sheriff role";
  if (/\banalysts?\b/i.test(normalized)) return "Analyst role";
  if (/\bscientists?\b/i.test(normalized)) return "Scientist role";
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

