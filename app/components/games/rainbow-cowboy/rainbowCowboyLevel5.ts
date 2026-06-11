import type { LevelConfig, RainbowCowboyLevel } from "./rainbowCowboyTypes";

const GROUND_Y = 460;
const LEVEL_WIDTH = 14000;

export const LEVEL_5_META: RainbowCowboyLevel = {
  id: "level-5",
  slug: "deep-sea-rodeo",
  title: "Deep Sea Rodeo",
  subtitle: "EOD diver. Spear gun. Laser sharks. Poor decisions.",
  objective: "Swim through the underwater minefield, spear hostile sea life, and reach extraction.",
  description:
    "A cartoon Navy EOD diver rides into absurd underwater chaos — sea mines, laser sharks, ROV drones, and toxic jelly clouds. Spear wisely.",
  difficulty: "Expert",
  estimatedMinutes: "5–8 minutes",
  levelWidth: LEVEL_WIDTH,
  groundY: GROUND_Y,
  targetTimeSeconds: 420,
  status: "playable",
};

export const LEVEL_5_STORY = `The unicorn made it through the Alamo.

Now he's underwater. Somehow.

Sea mines drift on the seabed. Laser sharks patrol the depths.
ROV drones buzz like angry Roombas with torpedoes.

Your Spear Gun holds three shots — make them count.

Rainbow Blast clears the water… but don't shoot the toxic jelly.

Deep Sea Rodeo. Good luck.`;

export const LEVEL_5_CONFIG: LevelConfig = {
  level: LEVEL_5_META,
  theme: "deep_sea",
  completeBanner: "DEEP SEA RODEO — EXTRACTION COMPLETE",
  storyIntro: LEVEL_5_STORY,
  extractionGate: ["boss_defeated"],
  warnings: [
    { triggerX: 1800, message: "SEA MINES AHEAD — SPEAR OR SWIM" },
    { triggerX: 5200, message: "LASER SHARKS INBOUND" },
    { triggerX: 8800, message: "TOXIC JELLY — DO NOT SHOOT" },
    { triggerX: 11800, message: "LASER JAWS APPROACHING" },
  ],
  platforms: [
    { x: 1200, y: 360, w: 120, h: 16 },
    { x: 3400, y: 330, w: 100, h: 16 },
    { x: 5600, y: 350, w: 130, h: 16 },
    { x: 7200, y: 310, w: 90, h: 16 },
    { x: 9600, y: 340, w: 110, h: 16 },
    { x: 11200, y: 370, w: 140, h: 16 },
    { x: 12800, y: 330, w: 100, h: 16 },
  ],
  walls: [
    { x: 2600, y: GROUND_Y - 72, w: 32, h: 72 },
    { x: 6400, y: GROUND_Y - 80, w: 32, h: 80 },
    { x: 10400, y: GROUND_Y - 64, w: 32, h: 64 },
  ],
  pickups: [
    { kind: "range_beer", x: 800, y: GROUND_Y - 36 },
    { kind: "rainbow", x: 2200, y: GROUND_Y - 36 },
    { kind: "white_energy_drink", x: 4100, y: GROUND_Y - 36 },
    { kind: "range_beer", x: 6100, y: GROUND_Y - 36 },
    { kind: "nicotine_pouch", x: 7000, y: 280 },
    { kind: "rainbow", x: 8200, y: GROUND_Y - 36 },
    { kind: "unicorn_treat", x: 9400, y: GROUND_Y - 36 },
    { kind: "white_energy_drink", x: 10600, y: GROUND_Y - 36 },
    { kind: "rainbow", x: 11500, y: GROUND_Y - 36 },
    { kind: "range_beer", x: 12200, y: GROUND_Y - 36 },
  ],
  hazards: [
    { kind: "sea_mine", x: 2100, y: GROUND_Y },
    { kind: "sea_mine", x: 2450, y: GROUND_Y },
    { kind: "sea_mine", x: 2800, y: GROUND_Y },
    { kind: "sea_mine", x: 3150, y: GROUND_Y },
    { kind: "sea_mine", x: 4800, y: GROUND_Y },
    { kind: "sea_mine", x: 5150, y: GROUND_Y },
    { kind: "toxic_jelly", x: 7600, y: GROUND_Y - 80 },
    { kind: "toxic_jelly", x: 7900, y: GROUND_Y - 120 },
    { kind: "toxic_jelly", x: 8200, y: GROUND_Y - 70 },
    { kind: "toxic_jelly", x: 8500, y: GROUND_Y - 100 },
    { kind: "sea_mine", x: 10000, y: GROUND_Y },
    { kind: "sea_mine", x: 10350, y: GROUND_Y },
  ],
  enemies: [
    { kind: "rov_drone", triggerX: 600, y: 300 },
    { kind: "rov_drone", triggerX: 1400, y: 260, delayMs: 300 },
    { kind: "laser_shark", triggerX: 3600, y: 280 },
    { kind: "laser_shark", triggerX: 3900, y: 240, delayMs: 400 },
    { kind: "rov_drone", triggerX: 4300, y: 320 },
    { kind: "laser_shark", triggerX: 5500, y: 270 },
    { kind: "elite_laser_shark", triggerX: 5800, y: 230, delayMs: 500 },
    { kind: "rov_drone", triggerX: 6500, y: 300, delayMs: 200 },
    { kind: "rov_drone", triggerX: 6700, y: 260, delayMs: 450 },
    { kind: "laser_shark", triggerX: 9000, y: 280 },
    { kind: "laser_shark", triggerX: 9300, y: 240, delayMs: 350 },
    { kind: "elite_laser_shark", triggerX: 9800, y: 220 },
    { kind: "rov_drone", triggerX: 10800, y: 290 },
    { kind: "laser_shark", triggerX: 11400, y: 260, delayMs: 300 },
    { kind: "laser_jaws", triggerX: 12000, y: 300, popupOnSpawn: "LASER JAWS!" },
  ],
  extractionX: 13500,
};

/** Level-specific control labels for Deep Sea Rodeo. */
export function getLevelAttackLabel(levelId: string, rideAttackLabel: string): string {
  if (levelId === "level-5") return "Spear Gun";
  return rideAttackLabel;
}

export function getLevelSpecialLabel(levelId: string, rideSpecialLabel: string): string {
  if (levelId === "level-5") return "Rainbow Blast";
  return rideSpecialLabel;
}
