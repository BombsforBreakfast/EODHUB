"use client";

import Link from "next/link";
import { useTheme } from "../../lib/ThemeContext";

const contributeButtonStyle: React.CSSProperties = {
  border: "none",
  borderRadius: 999,
  background: "#facc15",
  color: "#0f172a",
  padding: "6px 22px",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 14,
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

export default function RabbitholeShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const { t } = useTheme();

  return (
    <main
      style={{
        width: "100%",
        padding: "0 0 48px",
        boxSizing: "border-box",
        color: t.text,
      }}
    >
      {/* Header — mirrors HomePageClient Rabbithole header exactly */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- static mascot asset */}
          <img
            src="/rabbithole-mascot.png"
            alt=""
            width={44}
            height={44}
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              objectFit: "cover",
              border: `1px solid ${t.border}`,
            }}
          />
          <h1 style={{ margin: 0, fontSize: 32, fontWeight: 900, letterSpacing: "-0.02em" }}>Rabbithole</h1>
          <Link href="/rabbithole?contribute=1" style={contributeButtonStyle}>
            Contribute
          </Link>
        </div>
        {description && (
          <div style={{ marginTop: 8, maxWidth: 700 }}>
            <p style={{ margin: 0, color: t.textMuted, fontSize: 14 }}>{description}</p>
          </div>
        )}
      </div>
      {children}
    </main>
  );
}
