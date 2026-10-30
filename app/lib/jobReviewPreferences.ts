export type JobTypeExclusion = { id: string; phrase: string };
export type JobReviewFeedback = { job_id: string; title: string; company_name: string | null; location: string | null; decision: "approved" | "not_relevant" };
export type LearnedJobSignal = { phrase: string; approved: number; rejected: number };
export type JobReviewPreferences = { exclusions: JobTypeExclusion[]; signals: LearnedJobSignal[] };
export function normalizeJobPhrase(text: string): string {
  return text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
export function matchesJobPhrase(title: string, phrase: string): boolean {
  const term = normalizeJobPhrase(phrase);
  return !!term && ` ${normalizeJobPhrase(title)} `.includes(` ${term} `);
}
export function excludedJobType(title: string, rules: JobTypeExclusion[]): JobTypeExclusion | undefined {
  return rules.find(rule => matchesJobPhrase(title, rule.phrase));
}
// Title phrases only: do not learn preferences from employer boilerplate or generic single words.
export function learnedJobSignals(feedback: JobReviewFeedback[]): LearnedJobSignal[] {
  const totals = new Map<string, LearnedJobSignal>();
  const seen = new Set<string>();
  const generic = new Set(["senior", "junior", "lead", "principal", "assistant", "associate", "level", "remote", "full", "time", "part", "the", "of", "and", "in", "for", "with"]);
  for (const row of feedback) {
    const identity = JSON.stringify([normalizeJobPhrase(row.title), normalizeJobPhrase(row.company_name ?? ""), normalizeJobPhrase(row.location ?? "")]);
    if (seen.has(identity)) continue;
    seen.add(identity);
    const words = normalizeJobPhrase(row.title).split(" ");
    const phrases = new Set<string>();
    for (let i = 0; i < words.length - 1; i++) {
      if ([words[i], words[i + 1]].some(word => word.length < 2 || /\d/.test(word) || generic.has(word))) continue;
      phrases.add(words.slice(i, i + 2).join(" "));
    }
    for (const phrase of phrases) {
      const signal = totals.get(phrase) ?? { phrase, approved: 0, rejected: 0 };
      if (row.decision === "approved") signal.approved++; else signal.rejected++;
      totals.set(phrase, signal);
    }
  }
  return [...totals.values()].filter(signal => Math.abs(signal.approved - signal.rejected) >= 3);
}
export function learnedJobAdjustment(title: string, signals: LearnedJobSignal[]): { points: number; reason?: string } {
  const matched = signals.filter(signal => matchesJobPhrase(title, signal.phrase));
  // Use the strongest signal in each direction, rather than multiplying overlapping phrases.
  const positive = Math.max(0, ...matched.map(s => s.approved - s.rejected));
  const negative = Math.max(0, ...matched.map(s => s.rejected - s.approved));
  const points = Math.max(-10, Math.min(10, (positive - negative) * 2));
  return points ? { points, reason: `${points > 0 ? "+" : ""}${points}: similar titles ${points > 0 ? "approved" : "marked not relevant"} repeatedly` } : { points: 0 };
}
