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
  user_id: string;
  created_at: string;
  likeCount: number;
  commentCount: number;
  authorIsPureAdmin?: boolean | null;
  content_type?: string | null;
  system_generated?: boolean | null;
  court_verdict_at?: string | null;
};

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

  const ageHours = staffPostAgeHours(post.created_at, opts.nowMs);
  const effectiveAge = staff
    ? Math.max(0.25, ageHours - STAFF_POST_CHRONO_HOUR_CREDIT)
    : rumint
      ? Math.max(0.25, ageHours - RUMINT_POST_CHRONO_HOUR_CREDIT)
      : ageHours;

  let score =
    (post.likeCount + post.commentCount * 2 + 1) / Math.pow(effectiveAge + 2, 1.5);
  score *= opts.authorAffinityBoost?.get(post.user_id) ?? 1;
  score *= verdictBoost(post.court_verdict_at, opts.nowMs);

  if (staff) {
    if (ageHours <= STAFF_POST_SOFT_PIN_HOURS) {
      return 1_000_000 + (STAFF_POST_SOFT_PIN_HOURS - ageHours) * 1_000 + score;
    }
    score *= STAFF_POST_ONGOING_BOOST_MULTIPLIER;
    return score;
  }

  if (rumint) {
    if (ageHours <= RUMINT_POST_SOFT_PIN_HOURS) {
      return (
        RUMINT_POST_SOFT_PIN_BASE
        + (RUMINT_POST_SOFT_PIN_HOURS - ageHours) * RUMINT_POST_SOFT_PIN_SLOPE
        + score
      );
    }
    score *= RUMINT_POST_ONGOING_BOOST_MULTIPLIER;
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
