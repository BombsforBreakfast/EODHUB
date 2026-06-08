"use client";

import { useTheme } from "@/app/lib/ThemeContext";
import type { UnicornHeroAudioPrefs } from "./unicornHeroAudio";

interface Props {
  prefs: UnicornHeroAudioPrefs;
  onChange: (prefs: UnicornHeroAudioPrefs) => void;
  compact?: boolean;
  onInteract?: () => void;
}

export function UnicornHeroAudioControls({ prefs, onChange, compact = false, onInteract }: Props) {
  const { t } = useTheme();

  const patch = (partial: Partial<UnicornHeroAudioPrefs>) => {
    onInteract?.();
    onChange({ ...prefs, ...partial });
  };

  const boxStyle: React.CSSProperties = compact
    ? {
        background: "rgba(0,0,0,0.55)",
        border: "1px solid rgba(255,120,200,0.35)",
        borderRadius: 8,
        padding: "8px 10px",
        fontFamily: "monospace",
        fontSize: 10,
        color: "#fff",
        pointerEvents: "auto",
      }
    : {
        marginTop: 16,
        marginBottom: 16,
        padding: "14px 16px",
        borderRadius: 12,
        border: `1px solid ${t.borderLight}`,
        background: "rgba(0,0,0,0.15)",
        textAlign: "left" as const,
      };

  const toggleBtn = (active: boolean) => ({
    padding: compact ? "4px 8px" : "6px 12px",
    borderRadius: 6,
    border: `1px solid ${active ? "#ff60c0" : t.border}`,
    background: active ? "rgba(255,96,192,0.2)" : "transparent",
    color: active ? "#ffb0e0" : t.textMuted,
    fontWeight: 700 as const,
    fontSize: compact ? 10 : 12,
    cursor: "pointer" as const,
    fontFamily: "monospace",
  });

  return (
    <div style={boxStyle}>
      {!compact && (
        <div style={{ fontSize: 12, fontWeight: 700, color: t.text, marginBottom: 10 }}>Audio</div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: compact ? 6 : 10 }}>
        <button type="button" style={toggleBtn(prefs.musicEnabled)} onClick={() => patch({ musicEnabled: !prefs.musicEnabled })}>
          Music {prefs.musicEnabled ? "On" : "Off"}
        </button>
        <button type="button" style={toggleBtn(prefs.sfxEnabled)} onClick={() => patch({ sfxEnabled: !prefs.sfxEnabled })}>
          SFX {prefs.sfxEnabled ? "On" : "Off"}
        </button>
      </div>

      <label style={{ display: "block", fontSize: compact ? 10 : 11, color: t.textMuted, marginBottom: 4 }}>
        Music volume
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(prefs.musicVolume * 100)}
          onChange={(e) => patch({ musicVolume: Number(e.target.value) / 100 })}
          style={{ width: "100%", marginTop: 4, accentColor: "#ff60c0" }}
        />
      </label>

      <label style={{ display: "block", fontSize: compact ? 10 : 11, color: t.textMuted, marginTop: 8 }}>
        SFX volume
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(prefs.sfxVolume * 100)}
          onChange={(e) => patch({ sfxVolume: Number(e.target.value) / 100 })}
          style={{ width: "100%", marginTop: 4, accentColor: "#ff60c0" }}
        />
      </label>
    </div>
  );
}
