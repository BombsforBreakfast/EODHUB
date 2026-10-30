/** Education requirements affect review order, never eligibility. Experience alone is not a degree. */
export function jobDegreePenalty(text: string): { points: number; reason?: string } {
  const normalized = text.normalize("NFKC").replace(/<[^>]*>/g, " ")
    .replace(/&(?:nbsp|amp|#160);/gi, " ").replace(/[\u2010-\u2015-]/g, " ")
    .replace(/\b([bm])\.\s*([sae])\./gi, "$1$2").replace(/\bph\.d\./gi, "phd");
  let points = 0;
  const subjects = new Set<string>();
  for (const clause of normalized.split(/[.!?;\n]+/)) {
    for (const subject of ["engineering", "chemistry", "biology"]) {
      const credential = "(?:degree|bachelor(?:s|['’]s)?|master(?:s|['’]s)?|doctorate|doctoral|phd|bs|ba|bsc|beng|ms|msc|meng)";
      const match = clause.match(new RegExp(`\\b${credential}\\b[^.!?;]{0,90}?\\b${subject}\\b|\\b${subject}\\s+(?:degree|diploma)\\b`, "i"));
      if (!match) continue;
      if (/\b(?:experience|knowledge|working|duties|responsibilities|any (?:field|discipline|subject))\b/i.test(match[0])) continue;
      const context = clause.slice(Math.max(0, (match.index ?? 0) - 90), (match.index ?? 0) + match[0].length + 100);
      if (/\b(?:not (?:required|necessary|mandatory)|no (?:\w+ ){0,5}degree (?:required|requirement)|degree (?:is )?optional|degree (?:is )?not (?:required|necessary|mandatory))\b/i.test(context)) continue;
      const preferred = /\b(?:prefer(?:red|ably)|desired|desirable|a plus|nice to have)\b/i.test(context);
      const experienceAlternative = /\b(?:in lieu|or equivalent (?:work )?experience|or (?:relevant|equivalent) (?:military |professional )?experience|experience (?:may|can|will) (?:be )?(?:substitut|replace))\b/i.test(context);
      points = Math.max(points, preferred || experienceAlternative ? 5 : 10);
      subjects.add(subject);
    }
  }
  return points ? { points, reason: `−${points}: ${[...subjects].join(" / ")} degree ${points === 5 ? "preferred or experience accepted" : "called for"}` } : { points: 0 };
}
