/** Ephemeral lobby chatroom helpers (24h messages; room stays open for all members). */

export const CHATROOM_ROOM_ID = "lobby";
/** Max length of the visible message (after expanding mentions to @Name). */
export const CHATROOM_MESSAGE_MAX_LEN = 500;
/** Max length of stored body including `@[Name](userId)` tokens. */
export const CHATROOM_MESSAGE_RAW_MAX_LEN = 2000;
/** Session-only dismiss for the “chat’s live” prompt (X / Enter). */
export const CHATROOM_LIVE_PROMPT_SESSION_KEY = "eod_chatroom_live_prompt_dismissed";
/** Session-only collapse of the Team Room ephemeral warning banner. */
export const CHATROOM_WARNING_BANNER_SESSION_KEY = "eod_chatroom_warning_banner_dismissed";
/** Calendar-day mute for “Don’t show this again today”. */
export const CHATROOM_LIVE_PROMPT_MUTE_DAY_KEY = "eod_chatroom_live_prompt_mute_day";
/** Show the live prompt once at least this many members are online. */
export const CHATROOM_LIVE_PROMPT_MIN_ONLINE = 3;
/** Per-user ISO timestamp of last Team Room open (unread baseline). */
export const CHATROOM_LAST_OPENED_KEY_PREFIX = "eod_chatroom_last_opened:";

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

/** Chat entry: unlocked for all signed-in clients (web + native). */
export function isChatroomUiUnlocked(): boolean {
  return true;
}

/** True when this client may open Team Room UI. */
export function isChatroomEntryAvailable(userId: string | null | undefined): boolean {
  return Boolean(userId) && isChatroomUiUnlocked();
}

function localDayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isChatroomLivePromptSessionDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(CHATROOM_LIVE_PROMPT_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissChatroomLivePromptForSession(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(CHATROOM_LIVE_PROMPT_SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function isChatroomLivePromptMutedToday(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(CHATROOM_LIVE_PROMPT_MUTE_DAY_KEY) === localDayKey();
  } catch {
    return false;
  }
}

export function muteChatroomLivePromptForToday(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CHATROOM_LIVE_PROMPT_MUTE_DAY_KEY, localDayKey());
  } catch {
    /* ignore */
  }
}

export function isChatroomWarningBannerDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(CHATROOM_WARNING_BANNER_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissChatroomWarningBannerForSession(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(CHATROOM_WARNING_BANNER_SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

function chatroomLastOpenedKey(userId: string): string {
  return `${CHATROOM_LAST_OPENED_KEY_PREFIX}${userId}`;
}

/** ISO timestamp of when this user last opened Team Room, or null if never. */
export function getChatroomLastOpenedAt(userId: string | null | undefined): string | null {
  if (typeof window === "undefined" || !userId) return null;
  try {
    const v = localStorage.getItem(chatroomLastOpenedKey(userId));
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

/** Mark Team Room as read/opened now (clears peek unread badge). */
export function markChatroomOpened(userId: string | null | undefined): void {
  if (typeof window === "undefined" || !userId) return;
  try {
    localStorage.setItem(chatroomLastOpenedKey(userId), new Date().toISOString());
  } catch {
    /* ignore */
  }
}

export type ChatroomPeekLatest = {
  id: string;
  user_id: string;
  author_name: string;
  body: string;
  created_at: string;
};

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
};
