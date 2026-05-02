import { parseReactionType, type ReactionType } from "./types";

export type ReactionAggregate = {
  countsByType: Partial<Record<ReactionType, number>>;
  totalCount: number;
  userIds: string[];
  myReaction: ReactionType | null;
};

export type ContentReactionRow = {
  subject_id: string;
  user_id: string;
  reaction_type: string;
};

export function emptyAggregate(): ReactionAggregate {
  return {
    countsByType: {},
    totalCount: 0,
    userIds: [],
    myReaction: null,
  };
}

/** Group DB rows into per-subject aggregates (one reaction per user per subject). */
export function aggregatesBySubjectId(
  rows: ContentReactionRow[],
  viewerUserId: string | null,
): Map<string, ReactionAggregate> {
  const bySubject = new Map<string, ContentReactionRow[]>();
  for (const r of rows) {
    const list = bySubject.get(r.subject_id) ?? [];
    list.push(r);
    bySubject.set(r.subject_id, list);
  }

  const out = new Map<string, ReactionAggregate>();
  for (const [subjectId, list] of bySubject) {
    const countsByType: Partial<Record<ReactionType, number>> = {};
    const userIds: string[] = [];
    let myReaction: ReactionType | null = null;

    for (const row of list) {
      userIds.push(row.user_id);
      const rt = parseReactionType(row.reaction_type);
      if (!rt) continue;
      countsByType[rt] = (countsByType[rt] ?? 0) + 1;
      if (viewerUserId && row.user_id === viewerUserId) {
        myReaction = rt;
      }
    }

    out.set(subjectId, {
      countsByType,
      totalCount: list.length,
      userIds,
      myReaction,
    });
  }

  return out;
}

export type ReactionTopEntry = { type: ReactionType; count: number };

/** Highest counts first; hides zeros. */
export function topReactionCounts(
  countsByType: Partial<Record<ReactionType, number>>,
  limit: number,
): ReactionTopEntry[] {
  const entries = Object.entries(countsByType) as Array<[ReactionType, number]>;
  return entries
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([type, count]) => ({ type, count }));
}

/** Sorted display names per reaction type for one subject (post, comment, event, …). */
export function buildReactorDisplayNamesByTypeForSubject(
  rows: ContentReactionRow[],
  subjectId: string,
  profileNameMap: Map<string, string>,
): Partial<Record<ReactionType, string[]>> {
  const byType = new Map<ReactionType, Map<string, string>>();
  for (const r of rows) {
    if (r.subject_id !== subjectId) continue;
    const rt = parseReactionType(r.reaction_type);
    if (!rt) continue;
    let perType = byType.get(rt);
    if (!perType) {
      perType = new Map();
      byType.set(rt, perType);
    }
    const nm = profileNameMap.get(r.user_id)?.trim() || "Member";
    perType.set(r.user_id, nm);
  }
  const out: Partial<Record<ReactionType, string[]>> = {};
  for (const [rt, uidMap] of byType) {
    out[rt] = [...uidMap.values()].sort((a, b) => a.localeCompare(b));
  }
  return out;
}
