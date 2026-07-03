"use client";

import { useState } from "react";
import { useTheme } from "@/app/lib/ThemeContext";
import type { RainbowCowboyLevel, RainbowCowboyDifficulty } from "./rainbowCowboyTypes";
import { DIFFICULTY_OPTIONS } from "./rainbowCowboyDifficulty";
import {
  getDifficultyLockMessage,
  isDifficultyUnlocked,
  type RainbowCowboyProgressMap,
} from "./rainbowCowboyProgression";
import { loadUnicornHeroAudioPrefs, saveUnicornHeroAudioPrefs, type UnicornHeroAudioPrefs } from "../unicorn-hero/unicornHeroAudio";
import { UnicornHeroAudioControls } from "../unicorn-hero/UnicornHeroAudioControls";
import {
  BSM_BUTTON_BORDER,
  BSM_BUTTON_GRADIENT,
  BSM_TITLE_GRADIENT,
  BSM_ACCENT_LIGHT,
} from "../bomb-suit-man/bombSuitManTheme";
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
  difficulty: RainbowCowboyDifficulty;
  progress: RainbowCowboyProgressMap;
  levels: RainbowCowboyLevel[];
  /** Staff admin test mode — all difficulties selectable. */
  bypassProgression?: boolean;
  onDifficultyChange: (d: RainbowCowboyDifficulty) => void;
  onRideChange: (ride: UnicornHeroRideType) => void;
  onStart: () => void;
  onBack: () => void;
}

const DISCLAIMER =
  "Bomb Suit Man is a fictional arcade game for community fun. It does not teach real EOD procedures. Intended for adult audiences; adult references are used as powerups.";

function isFrogmanLevel(levelId: string): boolean {
  return levelId === "level-5" || levelId === "level-6" || levelId === "level-7" || levelId === "level-8";
}

export function RainbowCowboyStartScreen({
  level,
  storyIntro,
  selectedRide,
  difficulty,
  progress,
  levels,
  bypassProgression = false,
  onDifficultyChange,
  onRideChange,
  onStart,
  onBack,
}: Props) {
  const { t } = useTheme();
  const [audioPrefs, setAudioPrefs] = useState<UnicornHeroAudioPrefs>(() => loadUnicornHeroAudioPrefs());

  const progressionOptions = bypassProgression ? { bypassProgression: true as const } : undefined;
  const canStart = isDifficultyUnlocked(level.id, difficulty, progress, levels, progressionOptions);

  const handleRideChange = (ride: UnicornHeroRideType) => {
    onRideChange(ride);
    saveUnicornHeroSelectedRide(ride);
  };

  return (
    <div style={{ textAlign: "center", padding: "8px 0 24px" }}>
      <div style={{ fontSize: 48, marginBottom: 8 }}>
        {isFrogmanLevel(level.id)
          ? level.id === "level-8"
            ? "🦑"
            : "🤿"
          : level.id === "level-4"
            ? "🐝"
            : level.id === "level-2"
              ? "🏜️"
              : RIDE_EMOJI[selectedRide]}
      </div>
      <h1
        style={{
          margin: "0 0 6px",
          fontSize: 32,
          fontWeight: 900,
          background: BSM_TITLE_GRADIENT,
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

      {isFrogmanLevel(level.id) ? (
        <div style={{ marginBottom: 20, textAlign: "left" }}>
          <h2
            style={{
              margin: "0 0 10px",
              fontSize: 18,
              fontWeight: 900,
              textAlign: "center",
              color: BSM_ACCENT_LIGHT,
            }}
          >
            Your Operator
          </h2>
          <div
            style={{
              padding: "14px 16px",
              borderRadius: 12,
              border: `3px solid ${BSM_BUTTON_BORDER}`,
              background: "rgba(10, 40, 70, 0.35)",
              color: t.text,
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>🤿</div>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6, color: BSM_ACCENT_LIGHT }}>
              Frogman
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.5, color: t.textMuted }}>
              Elite EOD diver for Camp Poseidon. Swim in four directions with the spear gun —
              no bomb suit, no unicorn, no jumping.
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: t.textMuted }}>
              Harpoon ∞ · sonic blast pickups · Q to swap · rainbow blast
            </div>
          </div>
        </div>
      ) : (
        <UnicornHeroRideSelect selected={selectedRide} onChange={handleRideChange} />
      )}

      <div style={{ marginBottom: 16, textAlign: "left" }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 800,
            color: t.textMuted,
            marginBottom: 8,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          Difficulty
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {DIFFICULTY_OPTIONS.map((opt) => {
            const active = difficulty === opt.id;
            const unlocked = isDifficultyUnlocked(level.id, opt.id, progress, levels, progressionOptions);
            const lockMessage = unlocked ? null : getDifficultyLockMessage(opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                disabled={!unlocked}
                onClick={() => unlocked && onDifficultyChange(opt.id)}
                style={{
                  textAlign: "left",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: `2px solid ${active ? BSM_BUTTON_BORDER : t.borderLight}`,
                  background: active
                    ? "rgba(255,96,192,0.15)"
                    : unlocked
                      ? "rgba(0,0,0,0.2)"
                      : "rgba(0,0,0,0.12)",
                  color: unlocked ? t.text : t.textFaint,
                  cursor: unlocked ? "pointer" : "not-allowed",
                  opacity: unlocked ? 1 : 0.65,
                }}
              >
                <div style={{ fontWeight: 800, fontSize: 14 }}>
                  {opt.label}
                  {!unlocked && " · Locked"}
                </div>
                <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>
                  {unlocked ? opt.description : lockMessage}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {isFrogmanLevel(level.id) && (
        <p
          style={{
            margin: "0 0 16px",
            padding: "10px 12px",
            borderRadius: 10,
            border: "2px solid rgba(80,180,255,0.5)",
            background: "rgba(10,60,100,0.25)",
            fontSize: 12,
            lineHeight: 1.45,
            color: t.text,
            textAlign: "left",
          }}
        >
          <strong>Deep Sea Rodeo</strong> — swim with <strong>WASD / arrow keys</strong> (no jump).
          Swim <strong>through the sunken wreck</strong>, dodge <strong>laser sharks</strong>, and fire the
          unlimited <strong>harpoon</strong> with <strong>T</strong> or <strong>R</strong>.
          Pick up <strong>sonic blasts</strong> and press <strong>Q</strong> to swap weapons.
        </p>
      )}

      {level.id === "level-4" && (
        <p
          style={{
            margin: "0 0 16px",
            padding: "10px 12px",
            borderRadius: 10,
            border: "2px solid rgba(255,80,160,0.5)",
            background: "rgba(255,80,160,0.1)",
            fontSize: 12,
            lineHeight: 1.45,
            color: t.text,
            textAlign: "left",
          }}
        >
          Final mission of <strong>FOB Thunder</strong>. You start with an infinite{" "}
          <strong>pistol</strong> — watch for descending supply crates (MG, bazooka, hearts,
          rainbow). Time your shots when the <strong>hatch opens</strong> for full damage. Ride the
          moving planks. Press <strong>Q</strong> to swap weapons.
        </p>
      )}

      {level.id === "level-3" && (
        <p
          style={{
            margin: "0 0 16px",
            padding: "10px 12px",
            borderRadius: 10,
            border: "2px solid rgba(128,240,255,0.5)",
            background: "rgba(128,240,255,0.1)",
            fontSize: 12,
            lineHeight: 1.45,
            color: t.text,
            textAlign: "left",
          }}
        >
          Level 3 adds a <strong>gun</strong>: desktop <strong>T</strong> or mobile landscape{" "}
          <strong>(C) Fire</strong>. You start with a pistol — essential for RC monster trucks.
        </p>
      )}

      <UnicornHeroAudioControls
        prefs={audioPrefs}
        onChange={(next) => {
          setAudioPrefs(next);
          saveUnicornHeroAudioPrefs(next);
        }}
      />

      <button
        type="button"
        disabled={!canStart}
        onClick={() => {
          if (!canStart) return;
          saveUnicornHeroSelectedRide(selectedRide);
          onStart();
        }}
        style={{
          padding: "14px 28px",
          borderRadius: 12,
          border: `3px solid ${BSM_BUTTON_BORDER}`,
          background: canStart
            ? BSM_BUTTON_GRADIENT
            : "rgba(61, 79, 92, 0.55)",
          color: "#fff",
          fontWeight: 800,
          fontSize: 16,
          cursor: canStart ? "pointer" : "not-allowed",
          marginBottom: 12,
          opacity: canStart ? 1 : 0.7,
        }}
      >
        Start {isFrogmanLevel(level.id) ? "Dive" : "Ride"}
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
