// Provider interface so the discovery lane can be swapped (GDELT today,
// NewsData.io / Brave / NewsAPI tomorrow) without touching the runner.

import type { NewsCandidate } from "../types";

export interface NewsProvider {
  /** Stable identifier used in logs and the raw_payload audit field. */
  readonly id: string;
  fetchCandidates(): Promise<NewsCandidate[]>;
}
