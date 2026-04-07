export const FLAG_CATEGORIES = [
  "self_harm",
  "nudity",
  "spam_bot",
  "hatespeech",
  "harassment",
  "unlawful_activity",
  "spillage",
  "general",
] as const;

export type FlagCategory = (typeof FLAG_CATEGORIES)[number];

export const FLAG_CATEGORY_LABELS: Record<FlagCategory, string> = {
  self_harm: "Self harm",
  nudity: "Nudity",
  spam_bot: "Spam / bot",
  hatespeech: "Hate speech",
  harassment: "Harassment",
  unlawful_activity: "Unlawful activity",
  spillage: "Spillage",
  general: "General",
};

export function isFlagCategory(v: string): v is FlagCategory {
  return (FLAG_CATEGORIES as readonly string[]).includes(v);
}
