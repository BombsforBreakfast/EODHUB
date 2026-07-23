import { RUMINT_USER_ID } from "./userDirectory";

/** How long fresh EOD HUB staff posts stay soft-pinned to the feed top. */
export const STAFF_POST_SOFT_PIN_HOURS = 2;

/** After the soft pin expires, treat staff posts as this many hours younger. */
export const STAFF_POST_CHRONO_HOUR_CREDIT = 4;

/** Ranking multiplier while a staff post is soft-pinned (kept in sync with ranked_posts view). */
export const STAFF_POST_SOFT_PIN_MULTIPLIER = 50;

/** Ongoing ranking multiplier for staff posts after the soft pin window. */
export const STAFF_POST_ONGOING_BOOST_MULTIPLIER = 2.5;

/** How long freshly released RUMINT news stays boosted near the feed top. */
export const RUMINT_POST_SOFT_PIN_HOURS = 3;

/** After the soft pin expires, treat RUMINT posts as this many hours younger. */
export const RUMINT_POST_CHRONO_HOUR_CREDIT = 6;

/** Soft-pin floor for RUMINT (well below staff's 1_000_000 tier). */
export const RUMINT_POST_SOFT_PIN_BASE = 6_000;

/** Per-hour decay added to the RUMINT soft-pin floor while pinned. */
export const RUMINT_POST_SOFT_PIN_SLOPE = 300;

/** Ongoing ranking multiplier for RUMINT after the soft pin window. */
export const RUMINT_POST_ONGOING_BOOST_MULTIPLIER = 2;

export const FRESHNESS_FLOOR_24H = 1.35;
export const FRESHNESS_FLOOR_48H = 0.9;
export const POST_REACTION_WEIGHT = 0.65;
export const COMMENT_REACTION_WEIGHT = 1.3;
export const MAX_WEIGHTED_ENGAGEMENT = 70;
export const FEED_AGE_DECAY_EXPONENT = 0.65;
export const KNOWN_AUTHOR_AFFINITY_MULTIPLIER = 1.25;
export const WORKED_WITH_AUTHOR_AFFINITY_MULTIPLIER = 1.5;

export type StaffFeedPostInput = {
  userId: string;
  authorIsPureAdmin?: boolean | null;
  contentType?: string | null;
  systemGenerated?: boolean | null;
};

/** Manual posts from EOD HUB staff accounts — not RUMINT/news automation. */
export function isStaffFeedPost(input: StaffFeedPostInput): boolean {
  if (!input.authorIsPureAdmin) return false;
  if (input.userId === RUMINT_USER_ID) return false;
  if (input.contentType === "news") return false;
  if (input.systemGenerated === true) return false;
  return true;
}

/** Automated RUMINT / news shadow posts in the public feed. */
export function isRumintFeedPost(input: StaffFeedPostInput): boolean {
  if (input.userId === RUMINT_USER_ID) return true;
  if (input.contentType === "news") return true;
  return false;
}

export function staffPostAgeHours(createdAt: string, nowMs = Date.now()): number {
  return Math.max(0, (nowMs - new Date(createdAt).getTime()) / 3_600_000);
}

/** Age used for feed ranking (actual age + optional offset; display timestamp unchanged). */
export function feedRankAgeHours(
  createdAt: string,
  opts: { nowMs?: number; ageOffsetHours?: number | null } = {},
): number {
  const offset = Math.max(0, opts.ageOffsetHours ?? 0);
  return staffPostAgeHours(createdAt, opts.nowMs) + offset;
}

export function isStaffPostSoftPinned(createdAt: string, nowMs = Date.now()): boolean {
  return staffPostAgeHours(createdAt, nowMs) <= STAFF_POST_SOFT_PIN_HOURS;
}

function verdictBoost(at: string | null | undefined, nowMs: number): number {
  if (!at) return 1;
  const ms = nowMs - new Date(at).getTime();
  if (ms < 0) return 1;
  const hours = ms / 3_600_000;
  if (hours >= 48) return 1;
  return 1 + 0.2 * (1 - hours / 48);
}

export type FeedSortPost = {
  id?: string;
  user_id: string;
  authorUserId?: string | null;
  created_at: string;
  likeCount: number;
  commentCount: number;
  authorIsPureAdmin?: boolean | null;
  content_type?: string | null;
  system_generated?: boolean | null;
  court_verdict_at?: string | null;
  event_id?: string | null;
  news_item_id?: string | null;
  rabbithole_thread_id?: string | null;
  rabbithole_contribution_id?: string | null;
  feed_rank_age_offset_hours?: number | null;
};

export function feedFreshnessMultiplier(ageHours: number): number {
  if (ageHours < 6) return 3;
  if (ageHours < 24) return 2;
  if (ageHours < 72) return 1.5;
  if (ageHours <= 168) return 1;
  if (ageHours < 720) return 0.5;
  return 0.25;
}

export function feedFreshnessFloor(ageHours: number): number {
  if (ageHours < 24) return FRESHNESS_FLOOR_24H;
  if (ageHours < 48) return FRESHNESS_FLOOR_48H;
  return 0;
}

export function feedContentTypeMultiplier(post: Pick<
  FeedSortPost,
  "content_type" | "event_id" | "news_item_id" | "rabbithole_thread_id" | "rabbithole_contribution_id"
>): number {
  const contentType = post.content_type ?? "user_post";
  if (contentType === "memorial" || contentType === "memorial_scrapbook") return 1.5;
  if (contentType === "job" || contentType === "job_post") return 1.25;
  if (post.event_id || contentType === "event_publish" || contentType === "event_t30" || contentType === "event_t7" || contentType === "event_scrapbook") return 1.2;
  if (contentType === "resource" || contentType === "rabbithole_resource" || post.rabbithole_contribution_id || post.rabbithole_thread_id) {
    return 1.15;
  }
  if (contentType === "news" || post.news_item_id) return 1.15;
  return 1;
}

function weightedEngagement(post: FeedSortPost): number {
  return Math.min(
    MAX_WEIGHTED_ENGAGEMENT,
    post.likeCount * POST_REACTION_WEIGHT + post.commentCount * COMMENT_REACTION_WEIGHT,
  );
}

export function computeFeedSortScore(
  post: FeedSortPost,
  opts: {
    nowMs: number;
    authorAffinityBoost?: Map<string, number>;
  },
): number {
  const staff = isStaffFeedPost({
    userId: post.user_id,
    authorIsPureAdmin: post.authorIsPureAdmin,
    contentType: post.content_type,
    systemGenerated: post.system_generated,
  });
  const rumint = !staff && isRumintFeedPost({
    userId: post.user_id,
    contentType: post.content_type,
    systemGenerated: post.system_generated,
  });

  const ageHours = feedRankAgeHours(post.created_at, {
    nowMs: opts.nowMs,
    ageOffsetHours: post.feed_rank_age_offset_hours,
  });
  let score = Math.max(
    ((1 + weightedEngagement(post)) / Math.pow(ageHours + 2, FEED_AGE_DECAY_EXPONENT))
      * feedFreshnessMultiplier(ageHours),
    feedFreshnessFloor(ageHours),
  ) * feedContentTypeMultiplier(post);

  const authorId = post.authorUserId ?? post.user_id;
  score *= opts.authorAffinityBoost?.get(authorId) ?? 1;
  score *= verdictBoost(post.court_verdict_at, opts.nowMs);

  if (staff) {
    if (ageHours <= STAFF_POST_SOFT_PIN_HOURS) {
      score *= 8;
      return score;
    }
    score *= 1.5;
    return score;
  }

  if (rumint) {
    if (ageHours <= RUMINT_POST_SOFT_PIN_HOURS) {
      score *= 3;
      return score;
    }
    score *= 1.2;
  }

  return score;
}

export function compareFeedPosts(
  a: FeedSortPost,
  b: FeedSortPost,
  opts: {
    nowMs: number;
    authorAffinityBoost?: Map<string, number>;
  },
): number {
  const scoreDelta = computeFeedSortScore(b, opts) - computeFeedSortScore(a, opts);
  if (scoreDelta !== 0) return scoreDelta;
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

export function postDiversityType(post: FeedSortPost): string {
  if (post.content_type === "memorial" || post.content_type === "memorial_scrapbook") return "memorial";
  if (post.content_type === "job" || post.content_type === "job_post") return "job";
  if (post.event_id || post.content_type === "event_publish" || post.content_type === "event_t30" || post.content_type === "event_t7" || post.content_type === "event_scrapbook") return "event";
  if (post.content_type === "resource" || post.content_type === "rabbithole_resource" || post.rabbithole_thread_id || post.rabbithole_contribution_id) {
    return "resource";
  }
  if (post.content_type === "news" || post.news_item_id) return "news";
  return "community";
}

export function diversifyFeedPosts<T extends FeedSortPost>(
  sortedPosts: T[],
  opts: { authorWindow?: number; candidateLookahead?: number; maxSameTypeRun?: number } = {},
): T[] {
  const remaining = [...sortedPosts];
  const result: T[] = [];
  const authorWindow = opts.authorWindow ?? 12;
  const candidateLookahead = opts.candidateLookahead ?? 8;
  const maxSameTypeRun = opts.maxSameTypeRun ?? 3;

  while (remaining.length > 0) {
    const recentAuthors = new Set(
      result
        .slice(-authorWindow)
        .map((post) => post.authorUserId ?? post.user_id),
    );
    const recentTypes = result.slice(-(maxSameTypeRun - 1)).map(postDiversityType);
    const recentTypeRun =
      recentTypes.length === maxSameTypeRun - 1 && recentTypes.every((type) => type === recentTypes[0])
        ? recentTypes[0]
        : null;

    let pickIndex = 0;
    const lookahead = Math.min(candidateLookahead, remaining.length);
    for (let i = 0; i < lookahead; i += 1) {
      const candidate = remaining[i];
      const author = candidate.authorUserId ?? candidate.user_id;
      const authorAllowed = !recentAuthors.has(author);
      const typeAllowed = !recentTypeRun || postDiversityType(candidate) !== recentTypeRun;
      if (authorAllowed && typeAllowed) {
        pickIndex = i;
        break;
      }
      if (pickIndex === 0 && typeAllowed) {
        pickIndex = i;
      }
    }

    const [next] = remaining.splice(pickIndex, 1);
    result.push(next);
  }

  return result;
}
