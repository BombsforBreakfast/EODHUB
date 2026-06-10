import {
  compareFeedPosts,
  computeFeedSortScore,
  diversifyFeedPosts,
  KNOWN_AUTHOR_AFFINITY_MULTIPLIER,
  WORKED_WITH_AUTHOR_AFFINITY_MULTIPLIER,
  type FeedSortPost,
} from "../app/lib/feedRanking";

const nowMs = new Date("2026-06-10T12:00:00.000Z").getTime();

function hoursAgo(hours: number): string {
  return new Date(nowMs - hours * 3_600_000).toISOString();
}

function post(overrides: Partial<FeedSortPost> & { id: string }): FeedSortPost {
  return {
    user_id: overrides.user_id ?? `author-${overrides.id}`,
    authorUserId: overrides.authorUserId,
    created_at: overrides.created_at ?? hoursAgo(1),
    likeCount: overrides.likeCount ?? 0,
    commentCount: overrides.commentCount ?? 0,
    authorIsPureAdmin: overrides.authorIsPureAdmin ?? false,
    content_type: overrides.content_type ?? "user_post",
    system_generated: overrides.system_generated ?? false,
    court_verdict_at: overrides.court_verdict_at,
    event_id: overrides.event_id,
    news_item_id: overrides.news_item_id,
    rabbithole_thread_id: overrides.rabbithole_thread_id,
    rabbithole_contribution_id: overrides.rabbithole_contribution_id,
  };
}

function score(input: FeedSortPost, affinity = new Map<string, number>()): number {
  return computeFeedSortScore(input, { nowMs, authorAffinityBoost: affinity });
}

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const brandNew = post({ id: "brand-new", created_at: hoursAgo(0.25) });
const threeDayEngaged = post({
  id: "three-day-engaged",
  created_at: hoursAgo(72),
  likeCount: 20,
  commentCount: 10,
});

assert(
  score(brandNew) > score(threeDayEngaged),
  `Expected brand-new zero-engagement post (${score(brandNew)}) to outrank 3-day engaged post (${score(threeDayEngaged)}).`,
);

const oneHourLow = post({ id: "one-hour-low", created_at: hoursAgo(1), likeCount: 1 });
const sevenDayExceptional = post({
  id: "seven-day-exceptional",
  created_at: hoursAgo(168),
  likeCount: 100,
  commentCount: 40,
});

assert(
  score(sevenDayExceptional) > score(oneHourLow),
  `Expected exceptional 7-day post (${score(sevenDayExceptional)}) to remain competitive above low-engagement 1-hour post (${score(oneHourLow)}).`,
);

const knownAuthor = post({ id: "known", user_id: "known-author", created_at: hoursAgo(12), likeCount: 2 });
const workedWithAuthor = post({ id: "worked-with", user_id: "worked-author", created_at: hoursAgo(12), likeCount: 2 });
assert(
  score(knownAuthor, new Map([["known-author", KNOWN_AUTHOR_AFFINITY_MULTIPLIER]])) <
    score(workedWithAuthor, new Map([["worked-author", WORKED_WITH_AUTHOR_AFFINITY_MULTIPLIER]])),
  "Expected worked-with relationship to outrank known relationship for equivalent posts.",
);

const communityPost = post({ id: "community", created_at: hoursAgo(10), likeCount: 2 });
const eventPost = post({ id: "event", created_at: hoursAgo(10), likeCount: 2, event_id: "event-1" });
assert(score(eventPost) > score(communityPost), "Expected event content boost to outrank equivalent community post.");

const clustered = [
  post({ id: "a1", user_id: "author-a", likeCount: 10 }),
  post({ id: "a2", user_id: "author-a", likeCount: 9 }),
  post({ id: "a3", user_id: "author-a", likeCount: 8 }),
  post({ id: "b1", user_id: "author-b", likeCount: 7 }),
  post({ id: "c1", user_id: "author-c", likeCount: 6 }),
].sort((a, b) => compareFeedPosts(a, b, { nowMs }));

const diversified = diversifyFeedPosts(clustered, { authorWindow: 3, candidateLookahead: 5 });
assert(
  diversified[0].user_id !== diversified[1].user_id,
  "Expected diversity pass to interleave posts from different authors when alternatives exist.",
);

console.log("Feed ranking scenarios passed.");
