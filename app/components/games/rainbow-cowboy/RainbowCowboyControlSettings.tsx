"use client";

import {
  loadRainbowCowboyControlPrefs,
  saveRainbowCowboyControlPrefs,
  type ArcadeControlOpacity,
  type ArcadeControlSize,
  type RainbowCowboyControlPrefs,
} from "./rainbowCowboyControlPrefs";

interface Props {
  prefs?: RainbowCowboyControlPrefs;
  onChange: (next: RainbowCowboyControlPrefs) => void;
  compact?: boolean;
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onSelect,
  compact,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onSelect: (id: T) => void;
  compact?: boolean;
}) {
  return (
    <div style={{ marginBottom: compact ? 10 : 12 }}>
      <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.75, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.6 }}>
        {label}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onSelect(opt.id)}
            style={{
              flex: "1 1 auto",
              minWidth: 64,
              padding: "6px 10px",
              borderRadius: 8,
              border: value === opt.id ? "2px solid rgba(255,200,120,0.85)" : "1px solid rgba(255,255,255,0.25)",
              background: value === opt.id ? "rgba(255,200,120,0.18)" : "rgba(0,0,0,0.35)",
              color: "#fff",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "monospace",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function RainbowCowboyControlSettings({ prefs: prefsProp, onChange, compact }: Props) {
  const prefs = prefsProp ?? loadRainbowCowboyControlPrefs();

  const update = (patch: Partial<RainbowCowboyControlPrefs>) => {
    const next = { ...prefs, ...patch };
    saveRainbowCowboyControlPrefs(next);
    onChange(next);
  };

  return (
    <div
      style={{
        background: "rgba(0,0,0,0.72)",
        border: "2px solid rgba(255,200,120,0.4)",
        borderRadius: 10,
        padding: compact ? "10px 12px" : "12px 14px",
        fontFamily: "monospace",
        color: "#fff",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 800, marginBottom: compact ? 8 : 10, color: "#ffe08a" }}>
        Touch Controls
      </div>

      <Segmented<ArcadeControlSize>
        compact={compact}
        label="Control size"
        value={prefs.controlSize}
        options={[
          { id: "small", label: "Small" },
          { id: "medium", label: "Medium" },
          { id: "large", label: "Large" },
        ]}
        onSelect={(controlSize) => update({ controlSize })}
      />

      <Segmented<ArcadeControlOpacity>
        compact={compact}
        label="Button opacity"
        value={prefs.buttonOpacity}
        options={[
          { id: "low", label: "Low" },
          { id: "medium", label: "Medium" },
          { id: "high", label: "High" },
        ]}
        onSelect={(buttonOpacity) => update({ buttonOpacity })}
      />

      <Segmented<"on" | "off">
        compact={compact}
        label="Haptics"
        value={prefs.hapticsEnabled ? "on" : "off"}
        options={[
          { id: "on", label: "On" },
          { id: "off", label: "Off" },
        ]}
        onSelect={(v) => update({ hapticsEnabled: v === "on" })}
      />
    </div>
  );
}
