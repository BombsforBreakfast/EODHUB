"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { useTheme } from "../lib/ThemeContext";

type EmptyStateAction =
  | { label: string; onClick: () => void; href?: never }
  | { label: string; href: string; onClick?: never };

type Props = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  compact?: boolean;
  style?: CSSProperties;
};

function ActionButton({
  action,
  primary,
  border,
  surface,
  text,
}: {
  action: EmptyStateAction;
  primary: boolean;
  border: string;
  surface: string;
  text: string;
}) {
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "10px 16px",
    borderRadius: 10,
    fontWeight: 800,
    fontSize: 14,
    textDecoration: "none",
    cursor: "pointer",
    border: primary ? "none" : `1px solid ${border}`,
    background: primary ? "#111827" : surface,
    color: primary ? "#fff" : text,
  };

  if (action.href) {
    return (
      <Link href={action.href} style={base}>
        {action.label}
      </Link>
    );
  }

  return (
    <button type="button" onClick={action.onClick} style={base}>
      {action.label}
    </button>
  );
}

/**
 * Quiet empty-state with a clear next action. Prefer this over one-line muted copy.
 */
export default function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  compact = false,
  style,
}: Props) {
  const { t } = useTheme();

  return (
    <div
      style={{
        textAlign: "center",
        padding: compact ? "22px 16px" : "36px 20px",
        borderRadius: 14,
        border: `1px dashed ${t.border}`,
        background: t.surface,
        ...style,
      }}
    >
      {icon ? (
        <div
          aria-hidden
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: compact ? 40 : 48,
            height: compact ? 40 : 48,
            borderRadius: 12,
            background: t.badgeBg,
            color: t.textMuted,
            marginBottom: compact ? 10 : 14,
            fontSize: compact ? 20 : 24,
            lineHeight: 1,
          }}
        >
          {icon}
        </div>
      ) : null}
      <div
        style={{
          fontSize: compact ? 15 : 17,
          fontWeight: 900,
          color: t.text,
          letterSpacing: -0.01,
        }}
      >
        {title}
      </div>
      {description ? (
        <p
          style={{
            margin: "8px auto 0",
            maxWidth: 420,
            fontSize: 14,
            lineHeight: 1.55,
            color: t.textMuted,
          }}
        >
          {description}
        </p>
      ) : null}
      {action || secondaryAction ? (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            justifyContent: "center",
            marginTop: compact ? 14 : 18,
          }}
        >
          {action ? (
            <ActionButton
              action={action}
              primary
              border={t.border}
              surface={t.bg}
              text={t.text}
            />
          ) : null}
          {secondaryAction ? (
            <ActionButton
              action={secondaryAction}
              primary={false}
              border={t.border}
              surface={t.bg}
              text={t.text}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
