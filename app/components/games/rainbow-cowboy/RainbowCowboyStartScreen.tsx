"use client";

import { useTheme } from "@/app/lib/ThemeContext";

interface Props {
  onStart: () => void;
  onBack: () => void;
}

const DISCLAIMER =
  "Rainbow Cowboy is a fictional arcade game for community fun. It does not teach real EOD procedures.";

export function RainbowCowboyStartScreen({ onStart, onBack }: Props) {
  const { t } = useTheme();

  return (
    <div style={{ textAlign: "center", padding: "8px 0 24px" }}>
      <div style={{ fontSize: 48, marginBottom: 8 }}>🦄</div>
      <h1
        style={{
          margin: "0 0 6px",
          fontSize: 32,
          fontWeight: 900,
          background: "linear-gradient(90deg,#ff60c0,#60d0ff,#ffe060)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        Rainbow Cowboy
      </h1>
      <p style={{ margin: "0 0 20px", color: t.textMuted, fontSize: 15 }}>
        The legend. The unicorn. The poor life choices.
      </p>

      <button
        type="button"
        onClick={onStart}
        style={{
          padding: "14px 28px",
          borderRadius: 12,
          border: "3px solid #ff60c0",
          background: "linear-gradient(180deg,#ff80d0,#c040a0)",
          color: "#fff",
          fontWeight: 800,
          fontSize: 16,
          cursor: "pointer",
          marginBottom: 12,
        }}
      >
        Start Pasture of Peril
      </button>

      <div>
        <button
          type="button"
          onClick={onBack}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: `1px solid ${t.border}`,
            background: "transparent",
            color: t.textMuted,
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          Back to Arcade
        </button>
      </div>

      <p
        style={{
          marginTop: 28,
          padding: "12px 14px",
          borderRadius: 10,
          border: `1px solid ${t.borderLight}`,
          fontSize: 12,
          color: t.textMuted,
          lineHeight: 1.5,
        }}
      >
        {DISCLAIMER}
      </p>
    </div>
  );
}
