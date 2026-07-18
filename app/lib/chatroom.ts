/** Ephemeral lobby chatroom helpers (24h messages, presence-gated entry). */

export const CHATROOM_ROOM_ID = "lobby";
export const CHATROOM_MESSAGE_MAX_LEN = 500;
export const CHATROOM_OPEN_MIN_PRESENCE = 3;
export const CHATROOM_BANNER_DISMISS_KEY = "eod_chatroom_banner_dismissed";

/** Owner account — always see chat entry on localhost for QA. */
export const CHATROOM_LOCAL_QA_USER_IDS = new Set<string>([
  "a28ddac8-dc3a-4ae1-83f5-b675e7b85871", // Michael Twigg
]);

export const CHATROOM_TAGS = ["general", "question", "looking", "hiring"] as const;
export type ChatroomTag = (typeof CHATROOM_TAGS)[number];

export const CHATROOM_TAG_LABELS: Record<ChatroomTag, string> = {
  general: "General",
  question: "Question",
  looking: "Looking",
  hiring: "Hiring",
};

export function isChatroomTag(v: string | null | undefined): v is ChatroomTag {
  return !!v && (CHATROOM_TAGS as readonly string[]).includes(v);
}

export function isLocalDevHost(): boolean {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    return host === "localhost" || host === "127.0.0.1";
  }
  return process.env.NODE_ENV === "development";
}

/** Localhost-only QA: owner can always open the chatroom regardless of presence. */
export function canAlwaysAccessChatroomQa(userId: string | null | undefined): boolean {
  if (!userId || !CHATROOM_LOCAL_QA_USER_IDS.has(userId)) return false;
  return isLocalDevHost();
}

export function isChatroomEntryAvailable(
  onlineCount: number,
  userId: string | null | undefined,
): boolean {
  return onlineCount >= CHATROOM_OPEN_MIN_PRESENCE || canAlwaysAccessChatroomQa(userId);
}

export type ChatroomMessageDto = {
  id: string;
  user_id: string;
  body: string;
  tag: string | null;
  created_at: string;
  expires_at: string;
  author_name: string;
  author_photo_url: string | null;
  author_service: string | null;
  author_is_employer: boolean | null;
  up_count: number;
  down_count: number;
  my_reaction: "up" | "down" | null;
};
