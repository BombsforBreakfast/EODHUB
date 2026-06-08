"use client";

import Link from "next/link";
import { useTheme } from "@/app/lib/ThemeContext";

const linkStyle = (t: { border: string; textMuted: string; surface: string }): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  padding: "8px 14px",
  borderRadius: 8,
  border: `1px solid ${t.border}`,
  background: t.surface,
  color: t.textMuted,
  fontSize: 13,
  fontWeight: 700,
  textDecoration: "none",
});

export function GameArcadeNav() {
  const { t } = useTheme();

  return (
    <nav
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        marginBottom: 16,
      }}
    >
      <Link href="/games" style={linkStyle(t)}>
        ← Back to Games
      </Link>
      <Link href="/" style={linkStyle(t)}>
        ← Back to EOD HUB
      </Link>
    </nav>
  );
}
