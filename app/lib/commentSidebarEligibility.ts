/** Minimal shape for eligibility — feed/profile comments share this. */
export type CommentAuthorTimestamp = {
  user_id: string;
  created_at: string;
};

/** Need A→B→A→B (four comments, strict alternation between exactly two people). */
const MIN_STRICT_ALTERNATION = 4;

export function maxAlternatingRunBetweenPair(
  comments: CommentAuthorTimestamp[],
  a: string,
  b: string,
): number {
  const sub = comments
    .filter((c) => c.user_id === a || c.user_id === b)
    .sort((x, y) => new Date(x.created_at).getTime() - new Date(y.created_at).getTime());

  let run = 0;
  let best = 0;
  let last: string | null = null;
  for (const c of sub) {
    if (last === null) {
      run = 1;
    } else if (c.user_id === last) {
      run = 1;
    } else {
      run += 1;
    }
    last = c.user_id;
    if (run > best) best = run;
  }
  return best;
}

/**
 * If the viewer is one of two users with enough back-and-forth on this thread,
 * return the other user's id for the Sidebar nudge.
 */
export function getSidebarNudgePeer(
  comments: CommentAuthorTimestamp[],
  viewerId: string | null,
): { peerUserId: string } | null {
  if (!viewerId || comments.length < MIN_STRICT_ALTERNATION) return null;

  const distinct = [...new Set(comments.map((c) => c.user_id))];
  for (let i = 0; i < distinct.length; i++) {
    for (let j = i + 1; j < distinct.length; j++) {
      const u1 = distinct[i];
      const u2 = distinct[j];
      if (u1 !== viewerId && u2 !== viewerId) continue;
      if (maxAlternatingRunBetweenPair(comments, u1, u2) >= MIN_STRICT_ALTERNATION) {
        return { peerUserId: viewerId === u1 ? u2 : u1 };
      }
    }
  }
  return null;
}

export function sidebarNudgeDismissStorageKey(postId: string, userId: string, peerId: string): string {
  const a = userId < peerId ? userId : peerId;
  const b = userId < peerId ? peerId : userId;
  return `eod_sidebar_nudge_dismissed:${postId}:${a}:${b}`;
}
