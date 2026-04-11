/**
 * Kangaroo Court — feed MVP (types + copy).
 * DB: at most one *active* court per feed post (partial unique index on feed_post_id where status = active)
 * plus `open_kangaroo_court_on_feed_post` guard; multiple closed rows per post are allowed — UI picks latest.
 */

export const JUDGE_DISPLAY_NAME = "Judge N. E. W.";
export const JUDGE_SUBTITLE = "Newton E. Wentworth, Honorable";

/**
 * `close_expired_kangaroo_courts` embeds the judge header in `verdict.body`; the feed shows one
 * header (avatar + JUDGE_*). Strip the duplicated leading lines when rendering.
 */
export function stripVerdictBodyLeadingDuplicate(body: string): string {
  const lines = body.split(/\r?\n/);
  let i = 0;
  if (lines[i]?.trim() === "Judge N. E. W.") i += 1;
  const sub = lines[i]?.trim() ?? "";
  if (/^Newton E\. Wentworth,\s*(Presiding|Honorable)$/i.test(sub)) i += 1;
  while (i < lines.length && (lines[i] === "" || lines[i]?.trim() === "")) i += 1;
  const rest = lines.slice(i).join("\n").trim();
  return rest.length > 0 ? rest : body;
}

export const KC_CONFIRM_TITLE = "Take this to Kangaroo Court?";
export const KC_CONFIRM_SUBTITLE = "Let the community decide by vote.";

export const KC_DURATION_HOURS = [1, 6, 12, 24] as const;
export type KcDurationHours = (typeof KC_DURATION_HOURS)[number];

export type KangarooCourtOptionRow = {
  id: string;
  court_id: string;
  label: string;
  sort_order: number;
};

export type KangarooCourtVerdictRow = {
  id: string;
  court_id: string;
  winning_option_id: string | null;
  winning_label_snapshot: string;
  total_votes: number;
  body: string;
  created_at: string;
};

export type KangarooCourtRow = {
  id: string;
  feed_post_id: string | null;
  unit_post_id: string | null;
  unit_id: string | null;
  opened_by: string;
  status: "active" | "closed" | "cancelled";
  duration_hours: number;
  expires_at: string;
  closed_at: string | null;
  winning_option_id: string | null;
  total_votes: number;
  source: string;
  created_at: string;
};

/** Built in loadPosts: court/options/verdict/counts are session-backed (RLS); myVoteOptionId is viewer-specific. */
export type FeedKangarooBundle = {
  court: KangarooCourtRow;
  options: KangarooCourtOptionRow[];
  verdict: KangarooCourtVerdictRow | null;
  myVoteOptionId: string | null;
  voteCounts: Record<string, number>;
};

export function judgeAvatarSrc(): string {
  return "/branding/judge-n-e-w.png";
}
