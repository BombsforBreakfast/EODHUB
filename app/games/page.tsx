"use client";

import { useTheme } from "@/app/lib/ThemeContext";
import { RequireFullAccess } from "@/app/hooks/useRequireFullAccess";
import { RequireArcadePreview } from "@/app/components/games/RequireArcadePreview";

const GAMES = [
  {
    title: "Render Safe",
    subtitle: "Top-down night raid — get the assault force to the target.",
    href: "/render-safe",
    emoji: "💣",
    accent: "#f97316",
  },
  {
    title: "Unicorn Hero",
    subtitle: "Ride a pink unicorn or a robot. Eat drones. Make poor life choices.",
    href: "/games/rainbow-cowboy",
    emoji: "🦄",
    accent: "#ff60c0",
  },
] as const;

function GamesHubContent() {
  const { t } = useTheme();

  return (
    <div style={{ padding: "16px 12px 48px", maxWidth: 720, margin: "0 auto" }}>
      <div
        style={{
          textAlign: "center",
          marginBottom: 28,
          padding: "20px 16px",
          borderRadius: 16,
          border: `1px solid ${t.border}`,
          background: t.surface,
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 8 }}>🕹️</div>
        <h1 style={{ margin: "0 0 6px", fontSize: 28, fontWeight: 800 }}>EOD-HUB Arcade</h1>
        <p style={{ margin: 0, color: t.textMuted, fontSize: 14 }}>
          Fictional community games — not real EOD training.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {GAMES.map((game) => (
          <a
            key={game.href}
            href={game.href}
            style={{
              display: "block",
              textDecoration: "none",
              padding: 18,
              borderRadius: 14,
              border: `2px solid ${game.accent}44`,
              background: t.surface,
              color: t.text,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ fontSize: 32 }}>{game.emoji}</span>
              <div>
                <div style={{ fontWeight: 800, fontSize: 18, color: game.accent }}>{game.title}</div>
                <div style={{ fontSize: 13, color: t.textMuted, marginTop: 4 }}>{game.subtitle}</div>
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

export default function GamesHubPage() {
  return (
    <RequireFullAccess route="app/games/page.tsx">
      <RequireArcadePreview>
        <GamesHubContent />
      </RequireArcadePreview>
    </RequireFullAccess>
  );
}
