"use client";

import { useEffect, useState } from "react";

interface Props {
  open: boolean;
  levelId?: string;
  attackLabel: string;
  specialLabel: string;
  onDismiss: () => void;
}

function useMobileLayout(): boolean | null {
  const [mobile, setMobile] = useState<boolean | null>(null);

  useEffect(() => {
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const narrow = window.matchMedia("(max-width: 900px), (max-height: 500px)").matches;
    setMobile(coarse || narrow);

    const onChange = () => {
      const c = window.matchMedia("(pointer: coarse)").matches;
      const n = window.matchMedia("(max-width: 900px), (max-height: 500px)").matches;
      setMobile(c || n);
    };
    window.addEventListener("resize", onChange);
    return () => window.removeEventListener("resize", onChange);
  }, []);

  return mobile;
}

const DESKTOP_ROWS = (attackLabel: string, specialLabel: string) =>
  [
    { keys: "← / →", action: "Move" },
    { keys: "↑ / Space", action: "Jump" },
    { keys: "↓", action: "Crouch" },
    { keys: "R", action: attackLabel },
    { keys: "E", action: specialLabel },
  ] as const;

const MOBILE_ROWS = (attackLabel: string, specialLabel: string) =>
  [
    { keys: "◀ ▶", action: "Move" },
    { keys: "JUMP", action: "Jump" },
    { keys: "DUCK", action: "Crouch" },
    { keys: attackLabel.toUpperCase(), action: attackLabel },
    { keys: "🌈", action: specialLabel },
  ] as const;

const MISSION_BY_LEVEL: Record<string, string> = {
  "level-1":
    "Ride right, reach extraction alive, and rack up points by eating drones and grabbing loot.",
  "level-2":
    "Fight through the canyon, survive the swarm, and reach extraction. Prioritize threats.",
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

function getHazards(levelId: string | undefined, attackLabel: string): readonly string[] {
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
  const mobile = useMobileLayout();

  if (!open) return null;

  const rows = mobile === false ? DESKTOP_ROWS(attackLabel, specialLabel) : MOBILE_ROWS(attackLabel, specialLabel);
  const isLevel2 = levelId === "level-2";
  const mission = (levelId && MISSION_BY_LEVEL[levelId]) || DEFAULT_MISSION;
  const hazards = getHazards(levelId, attackLabel);

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
          maxWidth: isLevel2 ? 460 : 380,
          borderRadius: 14,
          border: "3px solid rgba(255,96,192,0.65)",
          background: "linear-gradient(180deg, rgba(30,18,48,0.98), rgba(16,10,32,0.98))",
          boxShadow: "0 12px 40px rgba(0,0,0,0.55)",
          padding: mobile ? "12px 12px 10px" : "14px 14px 12px",
          fontFamily: "monospace",
          color: "#fff",
        }}
      >
        <div style={{ fontSize: mobile ? 22 : 24, textAlign: "center", marginBottom: 0 }}>
          {isLevel2 ? "🏜️" : "🦄"}
        </div>
        <h2
          id="rc-instructions-title"
          style={{
            margin: "0 0 8px",
            textAlign: "center",
            fontSize: mobile ? 16 : 17,
            fontWeight: 900,
            color: "#ff80d0",
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
          {mobile === false ? "Controls" : mobile ? "Touch controls" : "Controls"}
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
          {mobile !== null &&
            rows.map((row) => (
              <li
                key={row.action}
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
                <span style={{ fontWeight: 800, color: "#ffe080" }}>{row.keys}</span>
                <span style={{ color: "#c8b8d8" }}>{row.action}</span>
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
          Hazards{isLevel2 ? " — Drone Valley" : ""}
        </p>
        <ul
          style={{
            margin: "0 0 10px",
            paddingLeft: 14,
            fontSize: mobile ? 9.5 : 10,
            lineHeight: 1.35,
            color: "#b8a8c8",
            display: isLevel2 && mobile === false ? "grid" : "block",
            gridTemplateColumns: isLevel2 && mobile === false ? "1fr 1fr" : undefined,
            columnGap: isLevel2 && mobile === false ? 12 : undefined,
            rowGap: isLevel2 && mobile === false ? 2 : undefined,
          }}
        >
          {hazards.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>

        <button
          type="button"
          onClick={onDismiss}
          disabled={mobile === null}
          style={{
            width: "100%",
            padding: mobile ? "9px 14px" : "10px 16px",
            borderRadius: 9,
            border: "2px solid #ff60c0",
            background: mobile === null ? "#6a4060" : "linear-gradient(180deg,#ff80d0,#c040a0)",
            color: "#fff",
            fontWeight: 800,
            fontSize: mobile ? 13 : 14,
            cursor: mobile === null ? "wait" : "pointer",
            fontFamily: "monospace",
          }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}
