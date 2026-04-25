"use client";

import type { CSSProperties } from "react";
import { useTheme } from "../../lib/ThemeContext";

type Props = {
  tags: string[] | null | undefined;
  /** Max chips before +N; default 6 */
  maxVisible?: number;
  chipStyle?: CSSProperties;
};

/**
 * Read-only tag row for business/org/resource cards.
 */
export function BizListingTagChips({ tags, maxVisible = 6, chipStyle }: Props) {
  const { t } = useTheme();
  const list = Array.isArray(tags) ? tags.map((s) => s.trim()).filter(Boolean) : [];
  if (list.length === 0) return null;
  const visible = list.slice(0, maxVisible);
  const rest = list.length - visible.length;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
      {visible.map((tag, i) => (
        <span
          key={`${tag}-${i}`}
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.2,
            color: t.textMuted,
            background: t.surface,
            border: `1px solid ${t.border}`,
            padding: "3px 8px",
            borderRadius: 999,
            lineHeight: 1.2,
            maxWidth: "100%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            ...chipStyle,
          }}
        >
          {tag}
        </span>
      ))}
      {rest > 0 ? (
        <span style={{ fontSize: 10, fontWeight: 700, color: t.textMuted, alignSelf: "center" }}>+{rest}</span>
      ) : null}
    </div>
  );
}
