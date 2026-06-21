import type { LevelConfig, LevelEnemySpawn, LevelHazardSpawn, RainbowCowboyLevel } from "./rainbowCowboyTypes";
import { GATOR_SURFACE_Y_OFFSET, WATER_SURFACE_Y } from "./rainbowCowboyConstants";

const GROUND_Y = 460;
const LEVEL_WIDTH = 10200;
const GATOR_PATROL_Y = WATER_SURFACE_Y + GATOR_SURFACE_Y_OFFSET;
const GATOR_MID_Y = 282;
const GATOR_DEEP_Y = GROUND_Y - 74;

const GATOR_CRUISE_LANES = [GATOR_PATROL_Y, GATOR_MID_Y, GATOR_DEEP_Y] as const;

function buildGatorSpawns(): LevelEnemySpawn[] {
  const out: LevelEnemySpawn[] = [];
  let n = 0;
  for (let tx = 580; tx < 9580; tx += 330) {
    const y = GATOR_CRUISE_LANES[n % GATOR_CRUISE_LANES.length];
    out.push({
      kind: "laser_gator",
      triggerX: tx,
      y: y + (n % 2 === 0 ? 0 : 6),
      delayMs: (n % 4) * 110,
      patrolDir: n % 2 === 0 ? -1 : 1,
      popupOnSpawn: n === 11 ? "GATORS INCOMING" : undefined,
    });
    n++;
  }
  return out;
}

/** Staggered logs — wide horizontal/vertical gaps so lanes stay swimmable. */
function buildFloatingLogs(): LevelHazardSpawn[] {
  const lanes = [188, 278, 368, 418] as const;
  const out: LevelHazardSpawn[] = [];

  for (let seg = 0; seg < 26; seg++) {
    const baseX = 420 + seg * 380;
    const laneA = seg % lanes.length;

    out.push({
      kind: "floating_log",
      x: baseX,
      y: lanes[laneA],
      logW: 68 + (seg % 3) * 14,
      logVx: -(0.95 + (seg % 5) * 0.04),
    });

    // Every other segment: one offset log in a different lane (never stacks vertically)
    if (seg % 2 === 1) {
      out.push({
        kind: "floating_log",
        x: baseX + 210,
        y: lanes[(seg + 2) % lanes.length],
        logW: 62 + (seg % 4) * 10,
        logVx: -(1.0 + (seg % 4) * 0.05),
      });
    }
  }

  return out;
}

const RAMPAGE_GATOR_LANES = [
  GATOR_PATROL_Y,
  GATOR_PATROL_Y + 3,
  GATOR_MID_Y,
  GATOR_MID_Y + 8,
  GATOR_DEEP_Y,
  GATOR_DEEP_Y - 6,
] as const;

function buildGatorRampageWave(): LevelEnemySpawn[] {
  const enemies: LevelEnemySpawn[] = [];
  for (let i = 0; i < 18; i++) {
    enemies.push({
      kind: "laser_gator",
      triggerX: 0,
      y: RAMPAGE_GATOR_LANES[i % RAMPAGE_GATOR_LANES.length],
      delayMs: i * 200 + (i % 3) * 50,
    });
  }
  for (let i = 0; i < 8; i++) {
    enemies.push({
      kind: "laser_gator",
      triggerX: 0,
      y: RAMPAGE_GATOR_LANES[(i + 1) % RAMPAGE_GATOR_LANES.length],
      delayMs: 4000 + i * 260,
    });
  }
  return enemies;
}

export const LEVEL_7_META: RainbowCowboyLevel = {
  id: "level-7",
  slug: "gator-gulch",
  title: "Gator Gulch",
  subtitle: "Shallow lake patrol — logs, mines, and gators cruising every depth.",
  objective: "Swim the lake channels, weave through drifting logs, and reach the dock.",
  description:
    "Third Frogman swim: bright lake water, sea mines, drifting logs, and kamikaze gators patrolling the surface, mid-water, and lake bed.",
  difficulty: "Advanced",
  estimatedMinutes: "3–5 minutes",
  levelWidth: LEVEL_WIDTH,
  groundY: GROUND_Y,
  targetTimeSeconds: 240,
  status: "playable",
  campaignBase: "camp_gator_gulch",
};

export const LEVEL_7_STORY = `The trench is behind you.

Gator Gulch is a sunlit lake — deceptively peaceful.

Logs drift across your lane. Mines hang in the shallows. Gators cruise the surface, mid-depth, and along the bottom — then kamikaze when you're in range.

Keep moving. The dock is east.`;

export const LEVEL_7_CONFIG: LevelConfig = {
  level: LEVEL_7_META,
  theme: "lake",
  playMode: "swim",
  character: "frogman",
  storyIntro: LEVEL_7_STORY,
  completeBanner: "GATOR GULCH CLEARED",
  warnings: [
    { triggerX: 800, message: "FLOATING LOGS — DRIFTING LEFT" },
    { triggerX: 1400, message: "CREEPER MINES ON THE LAKE BED" },
    { triggerX: 3200, message: "GATORS AT EVERY DEPTH — SURFACE TO BOTTOM" },
    { triggerX: 6200, message: "LOG JAM AHEAD — FIND THE GAPS" },
    { triggerX: 8500, message: "DOCK IN SIGHT — SWIM HARD" },
  ],
  platforms: [
    { x: 4400, y: 310, w: 100, h: 10 },
    { x: 7100, y: 300, w: 110, h: 10 },
  ],
  walls: [
    // Rock shelf — two segments per column, ~90px swim lane
    { x: 2400, y: 200, w: 18, h: 72 },
    { x: 2400, y: 364, w: 18, h: 52 },
    { x: 2580, y: 215, w: 16, h: 68 },
    { x: 2580, y: 368, w: 16, h: 48 },
    // Channel pinch — single wide gap per column (~108px)
    { x: 3600, y: 200, w: 12, h: 56 },
    { x: 3600, y: 364, w: 12, h: 58 },
    { x: 3780, y: 205, w: 12, h: 52 },
    { x: 3780, y: 361, w: 12, h: 62 },
    // Fallen pier beam — low ceiling + raised floor stripe
    { x: 5200, y: 200, w: 140, h: 12 },
    { x: 5200, y: 388, w: 120, h: 14 },
    // Late rock teeth — ~88px vertical lane
    { x: 6400, y: 210, w: 16, h: 76 },
    { x: 6400, y: 374, w: 16, h: 52 },
    { x: 6620, y: 220, w: 16, h: 70 },
    { x: 6620, y: 368, w: 16, h: 58 },
  ],
  pickups: [
    { kind: "range_beer", x: 450, y: 280 },
    { kind: "weapon_sonic", x: 1000, y: 250 },
    { kind: "rainbow", x: 2100, y: 260 },
    { kind: "weapon_sonic", x: 3000, y: 310 },
    { kind: "white_energy_drink", x: 4200, y: 270 },
    { kind: "weapon_sonic", x: 5600, y: 290 },
    { kind: "nicotine_pouch", x: 6300, y: 240 },
    { kind: "rainbow", x: 7500, y: 280 },
    { kind: "weapon_sonic", x: 8100, y: 260 },
    { kind: "unicorn_treat", x: 7800, y: 270 },
    { kind: "weapon_sonic", x: 9400, y: 300 },
  ],
  hazards: [
    ...buildFloatingLogs(),
    { kind: "creeper_mine", x: 1200, y: GROUND_Y },
    { kind: "sea_mine_floating", x: 900, y: 300 },
    { kind: "sea_mine_tethered", x: 1500, y: 360 },
    { kind: "creeper_mine", x: 2200, y: GROUND_Y },
    { kind: "sea_mine_floating", x: 2600, y: 270 },
    { kind: "sea_mine_tethered", x: 3400, y: 340 },
    { kind: "creeper_mine", x: 3100, y: GROUND_Y },
    { kind: "sea_mine_floating", x: 3900, y: 290 },
    { kind: "creeper_mine", x: 4500, y: GROUND_Y },
    { kind: "sea_mine_floating", x: 4800, y: 310 },
    { kind: "sea_mine_tethered", x: 5500, y: 330 },
    { kind: "creeper_mine", x: 5800, y: GROUND_Y },
    { kind: "sea_mine_floating", x: 6000, y: 280 },
    { kind: "sea_mine_tethered", x: 6700, y: 350 },
    { kind: "creeper_mine", x: 7000, y: GROUND_Y },
    { kind: "sea_mine_floating", x: 7600, y: 295 },
    { kind: "creeper_mine", x: 8200, y: GROUND_Y },
    { kind: "sea_mine_tethered", x: 8600, y: 320 },
    { kind: "sea_mine_floating", x: 9200, y: 305 },
    { kind: "creeper_mine", x: 9100, y: GROUND_Y },
    { kind: "sea_mine_tethered", x: 9700, y: 335 },
  ],
  enemies: buildGatorSpawns(),
  rampageWave: {
    message: "GATOR FRENZY!",
    enemies: buildGatorRampageWave(),
  },
  extractionX: 9900,
};
