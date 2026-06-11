"use client";

import { useEffect, useState } from "react";
import { BombSuitManAvatar } from "../bomb-suit-man/BombSuitManAvatar";
import {
  BSM_ACCENT_LIGHT,
  BSM_BUTTON_BORDER,
  BSM_BUTTON_GRADIENT,
} from "../bomb-suit-man/bombSuitManTheme";

interface Props {
  open: boolean;
  levelId?: string;
  attackLabel: string;
  specialLabel: string;
  onDismiss: () => void;
}

function useLayoutMode(): { mobile: boolean; landscape: boolean } {
  const [state, setState] = useState(() => {
    if (typeof window === "undefined") {
      return { mobile: false, landscape: false };
    }
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const narrow = window.matchMedia("(max-width: 900px), (max-height: 500px)").matches;
    const landscape = window.matchMedia("(orientation: landscape)").matches;
    return { mobile: coarse || narrow, landscape: narrow && landscape };
  });

  useEffect(() => {
    const refresh = () => {
      const coarse = window.matchMedia("(pointer: coarse)").matches;
      const narrow = window.matchMedia("(max-width: 900px), (max-height: 500px)").matches;
      const landscape = window.matchMedia("(orientation: landscape)").matches;
      setState({ mobile: coarse || narrow, landscape: narrow && landscape });
    };
    refresh();
    window.addEventListener("resize", refresh);
    return () => window.removeEventListener("resize", refresh);
  }, []);

  return state;
}

const DESKTOP_ROWS = (attackLabel: string, specialLabel: string, levelId?: string) => {
  const rows = [
    { keys: "← / →", action: "Move" },
    { keys: "↑ / Space", action: "Jump" },
    { keys: "↓", action: "Crouch" },
    { keys: "R", action: `${attackLabel} (slurp)` },
    { keys: "E", action: `${specialLabel} (explosion)` },
  ] as { keys: string; action: string }[];
  if (levelId === "level-3") {
    rows.push({ keys: "T", action: "Fire gun — pistol from the start; upgrades on the field" });
  }
  return rows;
};

const MOBILE_LANDSCAPE_ROWS = (attackLabel: string, specialLabel: string, levelId?: string) => {
  const rows = [
    { keys: "Joystick ← →", action: "Move left and right" },
    { keys: "Joystick ↑", action: "Aim upward for attacks" },
    { keys: "Joystick ↓", action: "Duck / crouch" },
    { keys: "JUMP", action: "Jump (largest button, lower-right)" },
    { keys: "ATK", action: `${attackLabel} — primary attack` },
    { keys: "SPEC", action: `${specialLabel} — shows charge count (×N)` },
  ] as { keys: string; action: string }[];
  if (levelId === "level-3") {
    rows.push({ keys: "GUN", action: "Fire weapon — pistol, bazooka, or machine gun (hold to spray)" });
  }
  return rows;
};

const MOBILE_PORTRAIT_ROWS = (attackLabel: string, specialLabel: string, levelId?: string) =>
  MOBILE_LANDSCAPE_ROWS(attackLabel, specialLabel, levelId);

const MISSION_BY_LEVEL: Record<string, string> = {
  "level-1":
    "Ride right, reach extraction alive, and rack up points by eating drones and grabbing loot.",
  "level-2":
    "Fight through the canyon, survive the swarm, and reach extraction. Prioritize threats.",
  "level-3":
    "Hold the Alamo against RC monster trucks. You start with a pistol — use GUN / T to fire.",
};

const DEFAULT_MISSION = MISSION_BY_LEVEL["level-1"];

const BASE_HAZARDS = (attackLabel: string) =>
  [
    "Landmines — jump or crouch past.",
    `Trash balloons — ${attackLabel.toLowerCase()} at your peril.`,
    `Drones — bump for damage; ${attackLabel.toLowerCase()} for points.`,
    "Dynamite — clear out before it blows.",
  ] as const;

const LEVEL_2_HAZARDS = [
  "Red Baron — red bomber; bomb every second until slurped.",
  "Dropped bombs — dodge the blast radius.",
  "Drone nests — spawn every second until destroyed.",
  "Swarm corridor — save a rainbow charge.",
] as const;

const LEVEL_3_HAZARDS = [
  "You start with a PISTOL — no waiting for a pickup. (T) or mobile GUN to fire.",
  "Machine gun & bazooka pickups upgrade you temporarily, then back to pistol.",
  "RC Monster Trucks — blinking red light, explode when destroyed.",
  "Turret Trucks — slow roof gun shoots left or right at you.",
  "Grenade Trucks — lob bouncing grenades until you kill them.",
  "Powerups — Range Beer, White Monster, Zyn, Unicorn Treat still apply.",
  "The Alamo — clear both drone nests or survive the final wave to unlock extraction.",
] as const;

function getHazards(levelId: string | undefined, attackLabel: string): readonly string[] {
  if (levelId === "level-3") return [...BASE_HAZARDS(attackLabel), ...LEVEL_3_HAZARDS];
  if (levelId === "level-2") return [...BASE_HAZARDS(attackLabel), ...LEVEL_2_HAZARDS];
  return BASE_HAZARDS(attackLabel);
}

export function RainbowCowboyInstructionsModal({
  open,
  levelId,
  attackLabel,
  specialLabel,
  onDismiss,
}: Props) {
  const { mobile, landscape } = useLayoutMode();

  if (!open) return null;

  const isLevel2 = levelId === "level-2";
  const isLevel3 = levelId === "level-3";
  const isWideLevel = isLevel2 || isLevel3;
  const mission = (levelId && MISSION_BY_LEVEL[levelId]) || DEFAULT_MISSION;
  const hazards = getHazards(levelId, attackLabel);

  const rows = !mobile
    ? DESKTOP_ROWS(attackLabel, specialLabel, levelId)
    : landscape
      ? MOBILE_LANDSCAPE_ROWS(attackLabel, specialLabel, levelId)
      : MOBILE_PORTRAIT_ROWS(attackLabel, specialLabel, levelId);

  const controlsHeading = !mobile
    ? "Controls"
    : landscape
      ? "Landscape touch controls"
      : "Touch controls";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rc-instructions-title"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 35,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: mobile ? 8 : 12,
        background: "rgba(8, 4, 20, 0.82)",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: isWideLevel ? 480 : 380,
          borderRadius: 14,
          border: "3px solid rgba(255,96,192,0.65)",
          background: "linear-gradient(180deg, rgba(30,18,48,0.98), rgba(16,10,32,0.98))",
          boxShadow: "0 12px 40px rgba(0,0,0,0.55)",
          padding: mobile ? "12px 12px 10px" : "14px 14px 12px",
          fontFamily: "monospace",
          color: "#fff",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 4 }}>
          <BombSuitManAvatar size={mobile ? 40 : 44} />
        </div>
        <h2
          id="rc-instructions-title"
          style={{
            margin: "0 0 8px",
            textAlign: "center",
            fontSize: mobile ? 16 : 17,
            fontWeight: 900,
            color: BSM_ACCENT_LIGHT,
          }}
        >
          Quick Guide
        </h2>

        <p
          style={{
            margin: "0 0 8px",
            fontSize: mobile ? 10 : 11,
            lineHeight: 1.35,
            color: "#d8cce8",
          }}
        >
          {mission}
        </p>

        {isLevel3 && (
          <div
            style={{
              margin: "0 0 10px",
              padding: "8px 10px",
              borderRadius: 8,
              border: "2px solid rgba(128,240,255,0.65)",
              background: "rgba(128,240,255,0.12)",
              fontSize: mobile ? 10 : 11,
              lineHeight: 1.4,
              color: "#dff8ff",
            }}
          >
            <strong style={{ color: "#80f0ff" }}>GUN (Level 3):</strong> Press <strong>T</strong> on
            keyboard or hold the compact <strong>GUN</strong> button near attack on mobile.
          </div>
        )}

        <p
          style={{
            margin: "0 0 4px",
            fontSize: 10,
            fontWeight: 800,
            color: "#ffe080",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          {controlsHeading}
        </p>

        <ul
          style={{
            listStyle: "none",
            margin: "0 0 8px",
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 3,
          }}
        >
          {rows.map((row) => (
              <li
                key={`${row.keys}-${row.action}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  padding: "4px 7px",
                  borderRadius: 5,
                  background: "rgba(255,255,255,0.05)",
                  fontSize: mobile ? 10 : 11,
                }}
              >
                <span style={{ fontWeight: 800, color: "#ffe080", flexShrink: 0 }}>{row.keys}</span>
                <span style={{ color: "#c8b8d8", textAlign: "right" }}>{row.action}</span>
              </li>
            ))}
        </ul>

        <p
          style={{
            margin: "0 0 4px",
            fontSize: 10,
            fontWeight: 800,
            color: "#ffe080",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          Hazards{isLevel2 ? " — Drone Valley" : isLevel3 ? " — Boom Bot Alamo" : ""}
        </p>
        <ul
          style={{
            margin: "0 0 10px",
            paddingLeft: 14,
            fontSize: mobile ? 9.5 : 10,
            lineHeight: 1.35,
            color: "#b8a8c8",
            display: isWideLevel && !mobile ? "grid" : "block",
            gridTemplateColumns: isWideLevel && !mobile ? "1fr 1fr" : undefined,
            columnGap: isWideLevel && !mobile ? 12 : undefined,
            rowGap: isWideLevel && !mobile ? 2 : undefined,
          }}
        >
          {hazards.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>

        <button
          type="button"
          onClick={onDismiss}
          style={{
            width: "100%",
            padding: mobile ? "9px 14px" : "10px 16px",
            borderRadius: 9,
            border: `2px solid ${BSM_BUTTON_BORDER}`,
            background: BSM_BUTTON_GRADIENT,
            color: "#fff",
            fontWeight: 800,
            fontSize: mobile ? 13 : 14,
            cursor: "pointer",
            fontFamily: "monospace",
          }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}
