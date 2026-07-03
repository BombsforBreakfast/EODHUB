"use client";

import { useEffect, useState } from "react";
import { BombSuitManAvatar } from "../bomb-suit-man/BombSuitManAvatar";
import {
  BSM_ACCENT_LIGHT,
  BSM_BUTTON_BORDER,
  BSM_BUTTON_GRADIENT,
} from "../bomb-suit-man/bombSuitManTheme";
import {
  getRainbowCowboyControlProfileByLevelId,
  isFrogmanLevelId,
} from "./rainbowCowboyControlProfile";

interface Props {
  open: boolean;
  levelId?: string;
  attackLabel: string;
  specialLabel: string;
  onDismiss: () => void;
}

function useLayoutMode(): { mobile: boolean; landscape: boolean; compact: boolean } {
  const read = () => {
    if (typeof window === "undefined") {
      return { mobile: false, landscape: false, compact: false };
    }
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const narrow = window.matchMedia("(max-width: 900px), (max-height: 500px)").matches;
    const landscape = window.matchMedia("(orientation: landscape)").matches;
    const mobile = coarse || narrow;
    const vh = window.visualViewport?.height ?? window.innerHeight;
    return {
      mobile,
      landscape: narrow && landscape,
      compact: mobile && landscape && vh < 420,
    };
  };

  const [state, setState] = useState(read);

  useEffect(() => {
    const refresh = () => setState(read());
    refresh();
    window.addEventListener("resize", refresh);
    window.visualViewport?.addEventListener("resize", refresh);
    return () => {
      window.removeEventListener("resize", refresh);
      window.visualViewport?.removeEventListener("resize", refresh);
    };
  }, []);

  return state;
}

function isFrogmanLevel(levelId?: string): boolean {
  return isFrogmanLevelId(levelId);
}

function levelUsesGunHoldById(levelId?: string): boolean {
  return levelId === "level-3" || levelId === "level-4";
}

const DESKTOP_ROWS = (attackLabel: string, specialLabel: string, levelId?: string) => {
  if (isFrogmanLevel(levelId)) {
    return [
      { keys: "← → ↑ ↓ / WASD", action: "Swim (no jump)" },
      { keys: "T / R", action: "Harpoon gun (unlimited)" },
      { keys: "Q", action: "Swap harpoon / sonic blast" },
      { keys: "E", action: `${specialLabel} blast` },
    ];
  }
  const rows = [
    { keys: "← / →", action: "Move" },
    { keys: "↑ / Space", action: "Jump" },
    { keys: "↓", action: "Crouch" },
    { keys: "R", action: `${attackLabel} (slurp)` },
    { keys: "E", action: `${specialLabel} (explosion)` },
  ] as { keys: string; action: string }[];
  if (levelUsesGunHoldById(levelId)) {
    rows.push({
      keys: "T",
      action: "Fire gun — pistol from the start; upgrades on the field",
    });
    if (levelId === "level-4") {
      rows.push({ keys: "Q", action: "Cycle pistol, MG, and bazooka" });
    }
  }
  return rows;
};

const MOBILE_LANDSCAPE_ROWS = (attackLabel: string, specialLabel: string, levelId?: string) => {
  if (isFrogmanLevel(levelId)) {
    return [
      { keys: "Joystick", action: "Swim all directions" },
      { keys: "UP", action: "Swim upward" },
      { keys: "SPEAR / ATK", action: "Harpoon (unlimited)" },
      { keys: "SPEC", action: `${specialLabel} (charge count)` },
    ];
  }
  const rows = [
    { keys: "Joystick ← →", action: "Move" },
    { keys: "Joystick ↑ / ↓", action: "Aim up / Duck" },
    { keys: "JUMP", action: "Jump (lower-right)" },
    { keys: "ATK", action: `${attackLabel}` },
    { keys: "SPEC", action: `${specialLabel} (charge count)` },
  ] as { keys: string; action: string }[];
  if (levelUsesGunHoldById(levelId)) {
    rows.push({ keys: "GUN", action: "Hold to fire" });
  }
  return rows;
};

const MOBILE_COMPACT_ROWS = (levelId?: string) => {
  if (isFrogmanLevel(levelId)) {
    return [
      { keys: "Joystick", action: "Swim · no jump" },
      { keys: "UP / SPEAR", action: "Ascend · fire harpoon" },
      { keys: "SPEC", action: "Rainbow blast" },
    ];
  }
  const rows = [
    { keys: "Joystick", action: "Move · aim · duck" },
    { keys: "JUMP / ATK", action: "Jump & attack" },
    { keys: "SPEC", action: "Special blast" },
  ] as { keys: string; action: string }[];
  if (levelUsesGunHoldById(levelId)) rows.push({ keys: "GUN", action: "Hold to fire" });
  return rows;
};

const MISSION_BY_LEVEL: Record<string, string> = {
  "level-1": "Ride right, reach extraction alive, and rack up points.",
  "level-2": "Fight through the canyon and reach extraction.",
  "level-3": "Hold the Alamo — pistol from the start, use GUN to fire.",
  "level-4":
    "Destroy The Hive — infinite pistol from the start; grab supply crates for MG and bazooka. Time shots when the hatch opens.",
  "level-5": "Swim through the wreck as Frogman — unlimited harpoon, sonic blasts, dense shark packs.",
  "level-6": "Poseidon Trench — kelp squeezes, floor creeper mines, fewer sharks, more vertical dodging.",
  "level-7": "Gator Gulch — sunny lake, drifting logs, sea mines, gators cruising surface, mid-depth, and bottom.",
  "level-8":
    "The Abyss — vertical ascent from the ocean floor. A mechanical squid pursues from below. Survive six sections, then destroy tentacle joints and spear the exposed eye on the offshore platform.",
};

const DEFAULT_MISSION = MISSION_BY_LEVEL["level-1"];

const BASE_HAZARDS = (attackLabel: string) =>
  [
    "Landmines — jump or crouch past.",
    `Trash balloons — ${attackLabel.toLowerCase()} at your peril.`,
    `Drones — ${attackLabel.toLowerCase()} for points.`,
    "Dynamite — clear out before it blows.",
  ] as const;

const LEVEL_2_HAZARDS = [
  "Red Baron — bomber until slurped.",
  "Dropped bombs — dodge blast radius.",
  "Drone nests — destroy to stop spawns.",
] as const;

const LEVEL_3_HAZARDS = [
  "Pistol from start — GUN / T to fire.",
  "RC Monster Trucks — explode when destroyed.",
  "Turret & Grenade Trucks — priority threats.",
] as const;

const LEVEL_4_HAZARDS = [
  "Infinite pistol — GUN / T to fire; hold on mobile.",
  "Supply crates — MG, bazooka, hearts, rainbow; press Q on keyboard to cycle weapons.",
  "Hive hatch — full damage when open; moving planks to ride.",
  "Boss drones and falling debris — dodge or shoot down.",
] as const;

const LEVEL_5_HAZARDS = [
  "Harpoon — unlimited shots; short cooldown only.",
  "Sonic blast pickups — wide wave clears sharks and detonates mines; Q to swap.",
  "Sea mines — drift vertically; glow red and detonate if you swim too close.",
  "Laser sharks — dense packs; emerge ahead and home in with laser bolts.",
  "Sunken wreck — swim through the hull, not around it.",
] as const;

const LEVEL_6_HAZARDS = [
  "Creeper mines — crawl the floor; red eye warns, then a triple fan. Swim sideways to cancel or dodge the gaps.",
  "Don't hover directly overhead — swim past or drop a harpoon on the treads.",
  "Fewer laser sharks than Deep Sea Rodeo — creepers replace the pressure.",
  "Kelp squeeze & basalt ribs — new lanes, same harpoon and sonic rules.",
] as const;

const LEVEL_7_HAZARDS = [
  "Floating logs — drift right-to-left; solid obstacles you must swim around.",
  "Kamikaze gators — cruise the surface, mid-water, and lake bed; homing-ram when you get close.",
  "Sea mines — same rules as deep sea: glow red when you get too close.",
  "Creeper mines — crawl the lake bed; don't hover overhead or they sonic-burst upward.",
  "A direct gator hit costs two hearts — dodge sideways or harpoon them on the way down.",
] as const;

function getHazards(levelId: string | undefined, attackLabel: string): readonly string[] {
  if (levelId === "level-4") return LEVEL_4_HAZARDS;
  if (levelId === "level-7") return [...LEVEL_5_HAZARDS.slice(0, 3), ...LEVEL_7_HAZARDS];
  if (levelId === "level-6") return [...LEVEL_5_HAZARDS.slice(0, 3), ...LEVEL_6_HAZARDS];
  if (levelId === "level-5") return LEVEL_5_HAZARDS;
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
  const { mobile, compact } = useLayoutMode();

  if (!open) return null;

  const controlProfile = getRainbowCowboyControlProfileByLevelId(levelId, {
    attack: attackLabel,
    special: specialLabel,
  });
  const showGunCallout = levelUsesGunHoldById(levelId) && !compact;
  const mission = (levelId && MISSION_BY_LEVEL[levelId]) || DEFAULT_MISSION;
  const hazards = getHazards(levelId, attackLabel);

  const rows = !mobile
    ? DESKTOP_ROWS(attackLabel, specialLabel, levelId)
    : compact
      ? MOBILE_COMPACT_ROWS(levelId)
      : MOBILE_LANDSCAPE_ROWS(attackLabel, specialLabel, levelId);

  const controlsHeading = !mobile ? "Controls" : "Touch controls";

  return (
    <div
      className="rc-instructions-overlay"
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
        background: "rgba(8, 4, 20, 0.86)",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        className="rc-instructions-panel"
        style={{
          width: "100%",
          maxWidth: compact ? 360 : 400,
          borderRadius: 14,
          border: "3px solid rgba(255,96,192,0.65)",
          background: "linear-gradient(180deg, rgba(30,18,48,0.98), rgba(16,10,32,0.98))",
          boxShadow: "0 12px 40px rgba(0,0,0,0.55)",
          padding: compact ? "10px 10px 0" : "12px 12px 0",
          fontFamily: "monospace",
          color: "#fff",
        }}
      >
        <div className="rc-instructions-scroll">
          <div style={{ display: "flex", justifyContent: "center", marginBottom: compact ? 2 : 4 }}>
            <BombSuitManAvatar size={compact ? 32 : 40} />
          </div>
          <h2
            id="rc-instructions-title"
            style={{
              margin: "0 0 6px",
              textAlign: "center",
              fontSize: compact ? 14 : 16,
              fontWeight: 900,
              color: BSM_ACCENT_LIGHT,
            }}
          >
            Quick Guide
          </h2>

          <p
            className="rc-instructions-mission"
            style={{
              margin: "0 0 8px",
              fontSize: compact ? 9.5 : 10,
              lineHeight: 1.35,
              color: "#d8cce8",
            }}
          >
            {mission}
          </p>

          {showGunCallout && (
            <div
              style={{
                margin: "0 0 8px",
                padding: "6px 8px",
                borderRadius: 8,
                border: "2px solid rgba(128,240,255,0.65)",
                background: "rgba(128,240,255,0.12)",
                fontSize: 10,
                lineHeight: 1.35,
                color: "#dff8ff",
              }}
            >
              <strong style={{ color: "#80f0ff" }}>GUN:</strong> Hold the compact GUN button or press{" "}
              <strong>T</strong> on keyboard.
              {levelId === "level-4" ? (
                <>
                  {" "}
                  <strong>Q</strong> cycles weapons on keyboard.
                </>
              ) : null}
            </div>
          )}

          <p
            style={{
              margin: "0 0 4px",
              fontSize: 9,
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
              gap: 2,
            }}
          >
            {rows.map((row) => (
              <li
                key={`${row.keys}-${row.action}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  padding: "3px 6px",
                  borderRadius: 5,
                  background: "rgba(255,255,255,0.05)",
                  fontSize: compact ? 9 : 10,
                }}
              >
                <span style={{ fontWeight: 800, color: "#ffe080", flexShrink: 0 }}>{row.keys}</span>
                <span style={{ color: "#c8b8d8", textAlign: "right" }}>{row.action}</span>
              </li>
            ))}
          </ul>

          {!compact && (
            <>
              <p
                style={{
                  margin: "0 0 4px",
                  fontSize: 9,
                  fontWeight: 800,
                  color: "#ffe080",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                Hazards
              </p>
              <ul
                className="rc-instructions-hazards"
                style={{
                  margin: "0 0 4px",
                  paddingLeft: 14,
                  fontSize: 9.5,
                  lineHeight: 1.3,
                  color: "#b8a8c8",
                }}
              >
                {hazards.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="rc-instructions-footer">
          <button
            type="button"
            onClick={onDismiss}
            style={{
              width: "100%",
              padding: compact ? "8px 12px" : "10px 14px",
              borderRadius: 9,
              border: `2px solid ${BSM_BUTTON_BORDER}`,
              background: BSM_BUTTON_GRADIENT,
              color: "#fff",
              fontWeight: 800,
              fontSize: compact ? 12 : 13,
              cursor: "pointer",
              fontFamily: "monospace",
            }}
          >
            Got it — Start
          </button>
        </div>
      </div>
    </div>
  );
}
