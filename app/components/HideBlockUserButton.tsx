"use client";

import { useState } from "react";
import { supabase } from "../lib/lib/supabaseClient";
import { blockUser } from "../lib/userBlocks";

type ThemeLike = {
  text: string;
  textMuted: string;
  textFaint?: string;
  surface: string;
  border: string;
};

type HideBlockUserButtonProps = {
  targetUserId: string | null | undefined;
  currentUserId: string | null | undefined;
  t: ThemeLike;
  onBlocked?: (blockedUserId: string) => void;
  compact?: boolean;
  disabled?: boolean;
  /** Optional surface label for admin alerts (e.g. "chatroom", "feed"). */
  context?: string;
};

export default function HideBlockUserButton({
  targetUserId,
  currentUserId,
  t,
  onBlocked,
  compact = false,
  disabled = false,
  context,
}: HideBlockUserButtonProps) {
  const [blocking, setBlocking] = useState(false);

  if (!targetUserId || !currentUserId || targetUserId === currentUserId) return null;

  async function handleBlock() {
    if (!targetUserId) return;
    const ok = window.confirm(
      "Hide/Block this user?\n\nYou will no longer see this user's posts, comments, or messages where possible. They will not be notified.\n\nThis only affects your EOD-HUB experience and does not ban or restrict the other user's account.",
    );
    if (!ok) return;

    setBlocking(true);
    const result = await blockUser(supabase, targetUserId, undefined, context);
    setBlocking(false);
    if (!result.ok) {
      window.alert(result.error);
      return;
    }
    onBlocked?.(targetUserId);
  }

  return (
    <button
      type="button"
      onClick={() => void handleBlock()}
      disabled={disabled || blocking}
      style={{
        background: compact ? "transparent" : t.surface,
        border: compact ? "none" : `1px solid ${t.border}`,
        borderRadius: compact ? 0 : 10,
        padding: compact ? "4px 0" : "7px 12px",
        cursor: disabled || blocking ? "not-allowed" : "pointer",
        color: compact ? t.textMuted : t.text,
        fontWeight: 800,
        fontSize: 12,
        opacity: disabled || blocking ? 0.65 : 1,
        textAlign: "left",
      }}
    >
      {blocking ? "Hiding…" : "Hide/Block User"}
    </button>
  );
}
