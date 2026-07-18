"use client";

import { useTheme } from "../lib/ThemeContext";

type Props = {
  visible: boolean;
  onEnter: () => void;
  onDismiss: () => void;
};

export default function ChatroomOpenBanner({ visible, onEnter, onDismiss }: Props) {
  const { t } = useTheme();
  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Chat room is open"
      style={{
        position: "relative",
        marginBottom: 12,
        borderRadius: 12,
        border: `1px solid ${t.border}`,
        background: t.surface,
        padding: "12px 40px 12px 14px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        cursor: "pointer",
      }}
      onClick={onEnter}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onEnter();
        }
      }}
      tabIndex={0}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: t.text, lineHeight: 1.3 }}>
          Chat room is open, enter now!
        </div>
        <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>
          Drop in anytime — messages disappear after 24 hours.
        </div>
      </div>
      <button
        type="button"
        aria-label="Dismiss chat room banner"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          width: 28,
          height: 28,
          borderRadius: 8,
          border: "none",
          background: "transparent",
          color: t.textMuted,
          fontSize: 18,
          fontWeight: 700,
          cursor: "pointer",
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}
