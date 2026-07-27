/** Body-class signal so the global Team Room peek bar can hide under modals / composers. */

export const CHATROOM_PEEK_SUPPRESS_BODY_CLASS = "chatroom-peek-suppressed";

const reasons = new Set<string>();

function syncBodyClass() {
  if (typeof document === "undefined") return;
  if (reasons.size > 0) {
    document.body.classList.add(CHATROOM_PEEK_SUPPRESS_BODY_CLASS);
  } else {
    document.body.classList.remove(CHATROOM_PEEK_SUPPRESS_BODY_CLASS);
  }
}

/** Hide the Team Room peek bar until matching release (supports stacked reasons). */
export function suppressChatroomPeek(reason: string): void {
  if (!reason || typeof document === "undefined") return;
  reasons.add(reason);
  syncBodyClass();
}

export function releaseChatroomPeek(reason: string): void {
  if (!reason || typeof document === "undefined") return;
  reasons.delete(reason);
  syncBodyClass();
}

export function isChatroomPeekSuppressed(): boolean {
  if (typeof document === "undefined") return false;
  return document.body.classList.contains(CHATROOM_PEEK_SUPPRESS_BODY_CLASS);
}
