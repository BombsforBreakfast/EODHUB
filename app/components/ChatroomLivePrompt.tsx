"use client";

import { useEffect, useState } from "react";
import { useOnlinePresence } from "./OnlinePresenceProvider";
import {
  CHATROOM_LIVE_PROMPT_MIN_ONLINE,
  dismissChatroomLivePromptForSession,
  isChatroomLivePromptMutedToday,
  isChatroomLivePromptSessionDismissed,
  isChatroomUiUnlocked,
  muteChatroomLivePromptForToday,
} from "../lib/chatroom";

type Props = {
  currentUserId: string | null;
  /** Hide while the chat modal is already open. */
  chatroomOpen: boolean;
  onEnter: () => void;
};

const CRT = {
  bg: "#000000",
  green: "#33ff66",
  greenDim: "#1a9940",
  mono: 'var(--font-geist-mono), "Courier New", Courier, monospace',
} as const;

/**
 * Nudge popup when enough members are online. Session X dismisses until reload;
 * optional “Don’t show this again today” mutes until the next local calendar day.
 */
export default function ChatroomLivePrompt({
  currentUserId,
  chatroomOpen,
  onEnter,
}: Props) {
  const { onlineUserIds } = useOnlinePresence();
  const [open, setOpen] = useState(false);
  const [dontShowToday, setDontShowToday] = useState(false);

  const onlineCount = onlineUserIds.length;

  useEffect(() => {
    if (!currentUserId || chatroomOpen || !isChatroomUiUnlocked()) {
      setOpen(false);
      return;
    }
    if (isChatroomLivePromptSessionDismissed() || isChatroomLivePromptMutedToday()) {
      setOpen(false);
      return;
    }
    setOpen(onlineCount >= CHATROOM_LIVE_PROMPT_MIN_ONLINE);
  }, [chatroomOpen, currentUserId, onlineCount]);

  if (!open) return null;

  function closePrompt(options?: { muteToday?: boolean }) {
    if (options?.muteToday || dontShowToday) {
      muteChatroomLivePromptForToday();
    }
    dismissChatroomLivePromptForSession();
    setOpen(false);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="chatroom-live-prompt-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "rgba(0,0,0,0.72)",
        fontFamily: CRT.mono,
      }}
      onClick={() => closePrompt()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 380,
          border: `1px solid ${CRT.green}`,
          background: "#001000",
          boxShadow: `0 0 24px rgba(51,255,102,0.18)`,
          padding: "22px 18px 16px",
        }}
      >
        <button
          type="button"
          aria-label="Dismiss chat room prompt"
          onClick={() => closePrompt()}
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            width: 28,
            height: 28,
            border: `1px solid ${CRT.greenDim}`,
            background: "transparent",
            color: CRT.greenDim,
            fontSize: 16,
            fontFamily: CRT.mono,
            cursor: "pointer",
            lineHeight: 1,
          }}
        >
          ×
        </button>

        <div
          id="chatroom-live-prompt-title"
          style={{
            color: CRT.green,
            fontWeight: 700,
            fontSize: 15,
            letterSpacing: 1,
            textTransform: "uppercase",
            lineHeight: 1.35,
            paddingRight: 28,
            textShadow: "0 0 8px rgba(51,255,102,0.35)",
          }}
        >
          *** CHANNEL LIVE ***
          <br />
          Enter team room now
        </div>
        <div
          style={{
            fontSize: 12,
            color: CRT.greenDim,
            marginTop: 10,
            lineHeight: 1.5,
            letterSpacing: 0.3,
          }}
        >
          {onlineCount} members online. Nothing&apos;s saved — messages self-destruct after 24 hours.
        </div>

        <button
          type="button"
          onClick={() => {
            closePrompt();
            onEnter();
          }}
          style={{
            width: "100%",
            marginTop: 18,
            border: `1px solid ${CRT.green}`,
            borderRadius: 0,
            padding: "12px 14px",
            background: "transparent",
            color: CRT.green,
            fontFamily: CRT.mono,
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            cursor: "pointer",
            boxShadow: "0 0 12px rgba(51,255,102,0.2)",
          }}
        >
          &gt;&gt; ENTER CHAT
        </button>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 14,
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          <input
            type="checkbox"
            checked={dontShowToday}
            onChange={(e) => setDontShowToday(e.target.checked)}
            style={{ width: 14, height: 14, accentColor: CRT.green, cursor: "pointer" }}
          />
          <span style={{ fontSize: 11, color: CRT.greenDim, lineHeight: 1.3 }}>
            Don&apos;t show this again today
          </span>
        </label>
      </div>
    </div>
  );
}
