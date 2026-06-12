import type { LevelConfig, RainbowCowboyLevel } from "./rainbowCowboyTypes";

const GROUND_Y = 460;
const LEVEL_WIDTH = 7200;
const ARENA_LEFT = 2800;
const ARENA_RIGHT = 7000;

export const LEVEL_4_META: RainbowCowboyLevel = {
  id: "level-4",
  slug: "drone-nest-assault",
  title: "Drone Nest Assault",
  subtitle: "Assault the moving nest. Survive the sweep. Earn your stripes.",
  objective: "Fight through the approach, defeat the Drone Nest boss, and clear the arena.",
  description:
    "A condensed boss gauntlet — elevated Obi planks, roaming drones, and a massive moving nest raining chaos from above.",
  difficulty: "Boss",
  estimatedMinutes: "2–4 minutes",
  levelWidth: LEVEL_WIDTH,
  groundY: GROUND_Y,
  targetTimeSeconds: 210,
  status: "playable",
};

export const LEVEL_4_STORY = `The Alamo held, but the sky is still angry.

Intel says a mega Drone Nest has rooted in the canyon ahead.

It patrols the arena like a smug floating junkyard.

Drones pour out nonstop. And every so often…

A ground sweep rolls through like a very rude Roomba.

Grab guns. Grab rainbow charges. Jump to the planks.

Then punch that nest until it stops moving.`;

export const LEVEL_4_CONFIG: LevelConfig = {
  level: LEVEL_4_META,
  theme: "nest",
  completeBanner: "DRONE NEST ASSAULT CLEARED",
  storyIntro: LEVEL_4_STORY,
  extractionGate: ["boss_defeated"],
  extractionX: ARENA_RIGHT - 80,
  bossArena: {
    triggerX: 2500,
    leftX: ARENA_LEFT,
    rightX: ARENA_RIGHT,
    bossY: 300,
    bossHp: 35,
    groundSweepIntervalMs: 11000,
    groundSweepWarningMs: 2600,
    groundSweepSpeed: 5.2,
  },
  warnings: [
    { triggerX: 400, message: "DRONE NEST ASSAULT — STAY MOBILE" },
    { triggerX: 2200, message: "BOSS ARENA AHEAD" },
    { triggerX: ARENA_LEFT + 200, message: "DRONE NEST ONLINE — ENGAGE" },
  ],
  platforms: [
    // Approach ledges
    { x: 900, y: 370, w: 110, h: 16 },
    { x: 1600, y: 350, w: 100, h: 16 },
    { x: 2100, y: 330, w: 90, h: 16 },
    // Boss arena Obi planks
    { x: ARENA_LEFT + 180, y: 340, w: 120, h: 16 },
    { x: ARENA_LEFT + 520, y: 320, w: 100, h: 16 },
    { x: ARENA_LEFT + 900, y: 350, w: 130, h: 16 },
    { x: ARENA_LEFT + 1280, y: 330, w: 110, h: 16 },
    { x: ARENA_LEFT + 1680, y: 340, w: 120, h: 16 },
    { x: ARENA_LEFT + 2100, y: 320, w: 100, h: 16 },
    { x: ARENA_LEFT + 2500, y: 350, w: 140, h: 16 },
    { x: ARENA_LEFT + 3000, y: 330, w: 110, h: 16 },
    { x: ARENA_LEFT + 3400, y: 340, w: 120, h: 16 },
  ],
  walls: [
    { x: 1200, y: GROUND_Y - 72, w: 32, h: 72 },
    { x: ARENA_LEFT - 32, y: GROUND_Y - 96, w: 32, h: 96 },
    { x: ARENA_RIGHT, y: GROUND_Y - 96, w: 32, h: 96 },
  ],
  pickups: [
    // Approach — lighter than arena
    { kind: "weapon_pistol", x: 500, y: GROUND_Y - 36 },
    { kind: "range_beer", x: 950, y: GROUND_Y - 36 },
    { kind: "rainbow", x: 1300, y: GROUND_Y - 36 },
    { kind: "weapon_machine_gun", x: 1750, y: GROUND_Y - 36 },
    { kind: "white_energy_drink", x: 2050, y: GROUND_Y - 36 },
    // Arena — generous boss support
    { kind: "weapon_pistol", x: ARENA_LEFT + 120, y: GROUND_Y - 36 },
    { kind: "range_beer", x: ARENA_LEFT + 400, y: GROUND_Y - 36 },
    { kind: "rainbow", x: ARENA_LEFT + 700, y: GROUND_Y - 36 },
    { kind: "weapon_bazooka", x: ARENA_LEFT + 1050, y: GROUND_Y - 36 },
    { kind: "weapon_machine_gun", x: ARENA_LEFT + 1450, y: GROUND_Y - 36 },
    { kind: "nicotine_pouch", x: ARENA_LEFT + 1850, y: GROUND_Y - 36 },
    { kind: "rainbow", x: ARENA_LEFT + 2250, y: GROUND_Y - 36 },
    { kind: "range_beer", x: ARENA_LEFT + 2650, y: GROUND_Y - 36 },
    { kind: "weapon_bazooka", x: ARENA_LEFT + 3100, y: GROUND_Y - 36 },
    { kind: "rainbow", x: ARENA_LEFT + 3500, y: GROUND_Y - 36 },
    { kind: "unicorn_treat", x: ARENA_LEFT + 3850, y: GROUND_Y - 36 },
    { kind: "white_energy_drink", x: ARENA_LEFT + 3200, y: 310 },
  ],
  hazards: [],
  enemies: [
    // Condensed approach (~45% shorter than a full level)
    { kind: "recon", triggerX: 350, y: 280 },
    { kind: "quad", triggerX: 600, y: 260, delayMs: 200 },
    { kind: "recon", triggerX: 850, y: 270, delayMs: 350 },
    { kind: "fpv", triggerX: 1100, y: 250, delayMs: 500 },
    { kind: "quad", triggerX: 1350, y: 280, delayMs: 650 },
    { kind: "recon", triggerX: 1550, y: 260, delayMs: 800 },
    { kind: "fpv", triggerX: 1800, y: 240, delayMs: 950 },
    { kind: "quad", triggerX: 2000, y: 270, delayMs: 1100 },
    { kind: "recon", triggerX: 2250, y: 250, delayMs: 1250 },
  ],
};
