export type ScrapbookItemType = "photo" | "article" | "document" | "memory";

export type ScrapbookItemRow = {
  id: string;
  memorial_id: string;
  user_id: string | null;
  item_type: ScrapbookItemType;
  file_url: string | null;
  external_url: string | null;
  thumbnail_url: string | null;
  memory_body: string | null;
  caption: string | null;
  location: string | null;
  event_date: string | null;
  status: string;
  created_at: string;
};

export type ScrapbookItemWithAuthor = ScrapbookItemRow & {
  authorName: string;
  authorPhotoUrl: string | null;
};

export type ScrapbookFlagReason = "in_photo" | "inappropriate" | "incorrect" | "duplicate" | "other";

export const FLAG_REASON_OPTIONS: { value: ScrapbookFlagReason; label: string }[] = [
  { value: "in_photo", label: "I am in this photo and want it reviewed" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "incorrect", label: "Incorrect information" },
  { value: "duplicate", label: "Duplicate" },
  { value: "other", label: "Other" },
];

/** Subset of app theme tokens used by scrapbook UI (keeps this module server-safe). */
export type MemorialScrapbookTheme = {
  surface: string;
  surfaceHover: string;
  border: string;
  borderLight: string;
  text: string;
  textMuted: string;
  textFaint: string;
  badgeBg: string;
};
