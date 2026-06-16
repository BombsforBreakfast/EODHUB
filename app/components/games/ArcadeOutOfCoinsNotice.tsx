"use client";

import { useTheme } from "@/app/lib/ThemeContext";

export function ArcadeOutOfCoinsNotice({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss?: () => void;
}) {
  const { t } = useTheme();

  return (
    <div
      role="alert"
      style={{
        marginBottom: 16,
        padding: "12px 14px",
        borderRadius: 12,
        border: `1px solid ${t.border}`,
        background: t.surface,
        color: t.text,
        fontSize: 14,
        lineHeight: 1.5,
      }}
    >
      <div style={{ fontWeight: 800, marginBottom: 4 }}>Out of challenge coins</div>
      <div style={{ color: t.textMuted }}>{message}</div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          style={{
            marginTop: 10,
            border: `1px solid ${t.border}`,
            borderRadius: 8,
            background: t.bg,
            color: t.text,
            padding: "6px 12px",
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          OK
        </button>
      ) : null}
    </div>
  );
}
