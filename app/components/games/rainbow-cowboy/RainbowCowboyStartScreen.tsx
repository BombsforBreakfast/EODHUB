"use client";

import { useState } from "react";
import { useTheme } from "@/app/lib/ThemeContext";
import type { RainbowCowboyLevel } from "./rainbowCowboyTypes";
import { loadUnicornHeroAudioPrefs, saveUnicornHeroAudioPrefs, type UnicornHeroAudioPrefs } from "../unicorn-hero/unicornHeroAudio";
import { UnicornHeroAudioControls } from "../unicorn-hero/UnicornHeroAudioControls";
import { UnicornHeroRideSelect } from "../unicorn-hero/UnicornHeroRideSelect";
import {
  saveUnicornHeroSelectedRide,
  type UnicornHeroRideType,
} from "../unicorn-hero/unicornHeroRides";

const RIDE_EMOJI: Record<UnicornHeroRideType, string> = {
  unicorn: "🦄",
  eod_robot: "🤖",
};

interface Props {
  level: RainbowCowboyLevel;
  storyIntro?: string;
  selectedRide: UnicornHeroRideType;
  onRideChange: (ride: UnicornHeroRideType) => void;
  onStart: () => void;
  onBack: () => void;
}

const DISCLAIMER =
  "Unicorn Hero is a fictional arcade game for community fun. It does not teach real EOD procedures. Intended for adult audiences; adult references are used as powerups.";

export function RainbowCowboyStartScreen({
  level,
  storyIntro,
  selectedRide,
  onRideChange,
  onStart,
  onBack,
}: Props) {
  const { t } = useTheme();
  const [audioPrefs, setAudioPrefs] = useState<UnicornHeroAudioPrefs>(() => loadUnicornHeroAudioPrefs());

  const handleRideChange = (ride: UnicornHeroRideType) => {
    onRideChange(ride);
    saveUnicornHeroSelectedRide(ride);
  };

  return (
    <div style={{ textAlign: "center", padding: "8px 0 24px" }}>
      <div style={{ fontSize: 48, marginBottom: 8 }}>
        {level.id === "level-2" ? "🏜️" : RIDE_EMOJI[selectedRide]}
      </div>
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
        {level.title}
      </h1>
      <p style={{ margin: "0 0 8px", color: t.textMuted, fontSize: 15 }}>{level.subtitle}</p>
      <p style={{ margin: "0 0 16px", color: t.text, fontSize: 13 }}>{level.objective}</p>

      {storyIntro && (
        <div
          style={{
            marginBottom: 20,
            padding: "14px 16px",
            borderRadius: 12,
            border: `1px solid ${t.borderLight}`,
            background: "rgba(0,0,0,0.2)",
            textAlign: "left",
            fontSize: 13,
            lineHeight: 1.55,
            color: t.text,
            whiteSpace: "pre-line",
          }}
        >
          {storyIntro}
        </div>
      )}

      <UnicornHeroRideSelect selected={selectedRide} onChange={handleRideChange} />

      <UnicornHeroAudioControls
        prefs={audioPrefs}
        onChange={(next) => {
          setAudioPrefs(next);
          saveUnicornHeroAudioPrefs(next);
        }}
      />

      <button
        type="button"
        onClick={() => {
          saveUnicornHeroSelectedRide(selectedRide);
          onStart();
        }}
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
        Start Ride
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
          Back to Levels
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
