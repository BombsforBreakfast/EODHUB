import { RUMINT_USER_ID } from "@/app/lib/userDirectory";

/** Default sender: Micheal Twigg — override with WELCOME_SIDEBAR_SENDER_USER_ID. */
export const DEFAULT_WELCOME_SIDEBAR_SENDER_USER_ID =
  "a28ddac8-dc3a-4ae1-83f5-b675e7b85871";

export const WELCOME_SIDEBAR_MESSAGE = `Hey — Mike here, creator of EOD-HUB. Just wanted to personally say thanks for joining.

We're still early beta, so you're getting a front-row seat while this thing takes shape. Poke around, connect with people you know, break stuff, tell me what sucks, tell me what you'd like to see.

The goal is pretty simple: build a solid place for EOD and PSBTs, and the broader community to stay connected, find opportunities, and share knowledge.

Once again, glad you're here! If you run into issues or have ideas, shoot me a message directly.`;

export function getWelcomeSidebarSenderUserId(): string | null {
  const fromEnv = process.env.WELCOME_SIDEBAR_SENDER_USER_ID?.trim();
  if (fromEnv) return fromEnv;
  return DEFAULT_WELCOME_SIDEBAR_SENDER_USER_ID;
}

/** Optional comma-separated UUID overrides (manual exempt list). */
export function getWelcomeSidebarExemptUserIds(): Set<string> {
  const raw = process.env.WELCOME_SIDEBAR_EXEMPT_USER_IDS?.trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function welcomeSidebarDedupeKey(recipientUserId: string): string {
  return `welcome_sidebar:${recipientUserId}`;
}

/** Staff bots and automated identities — never receive founder welcome DMs. */
export function isWelcomeSidebarSystemAccount(profile: {
  user_id: string;
  is_pure_admin?: boolean | null;
  email?: string | null;
}): boolean {
  if (profile.user_id === RUMINT_USER_ID) return true;
  if (profile.is_pure_admin === true) return true;
  const email = profile.email?.trim().toLowerCase();
  if (email?.endsWith("@system.eod-hub.invalid")) return true;
  return false;
}
