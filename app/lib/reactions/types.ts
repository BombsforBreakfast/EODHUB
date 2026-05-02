export const REACTION_TYPES = [
  "like",
  "dislike",
  "rock_on",
  "silva",
  "strong",
  "fire",
  "bomb",
  "whiskey",
  "smoke",
  "laugh",
  "sad",
  "respect",
] as const;

export type ReactionType = (typeof REACTION_TYPES)[number];

/** Normalize values from Postgres / API so "like" === Like. */
export function parseReactionType(value: unknown): ReactionType | null {
  const s = typeof value === "string" ? value.trim().toLowerCase() : "";
  return (REACTION_TYPES as readonly string[]).includes(s) ? (s as ReactionType) : null;
}

/** Extend migration CHECK when adding surfaces (comments, DMs, …). */
export type ReactionSubjectKind = "post" | "post_comment" | "unit_post" | "unit_post_comment" | "event" | "event_comment";

export type ReactionMeta = {
  emoji: string;
  ariaLabel: string;
};

export const REACTION_META: Record<ReactionType, ReactionMeta> = {
  like: { emoji: "👍", ariaLabel: "Like" },
  dislike: { emoji: "👎", ariaLabel: "Dislike" },
  rock_on: { emoji: "🤘", ariaLabel: "Rock and Roll" },
  silva: { emoji: "🤙", ariaLabel: "The Silva" },
  strong: { emoji: "💪", ariaLabel: "Strong" },
  fire: { emoji: "🔥", ariaLabel: "Fire" },
  bomb: { emoji: "💣", ariaLabel: "Bomb" },
  whiskey: { emoji: "🥃", ariaLabel: "Whiskey" },
  smoke: { emoji: "🚬", ariaLabel: "Smoke" },
  laugh: { emoji: "😂", ariaLabel: "Laugh" },
  sad: { emoji: "😢", ariaLabel: "Sad" },
  respect: { emoji: "🫡", ariaLabel: "Respect" },
};

/** Picker display order */
export const DEFAULT_REACTION_ORDER: ReactionType[] = [...REACTION_TYPES];
