import type { LevelConfig, LevelEnemySpawn, RainbowCowboyLevel } from "./rainbowCowboyTypes";

const GROUND_Y = 460;
const LEVEL_WIDTH = 10800;

const RAMPAGE_SHARK_LANES = [240, 265, 290, 310, 320, 335, 350, 370, 380] as const;

/** Unicorn treat triggers this swarm — player is invincible; score/spectacle through extraction. */
function buildDeepSeaRampageWave(): LevelEnemySpawn[] {
  const enemies: LevelEnemySpawn[] = [];

  for (let i = 0; i < 28; i++) {
    enemies.push({
      kind: "laser_shark",
      triggerX: 0,
      y: RAMPAGE_SHARK_LANES[i % RAMPAGE_SHARK_LANES.length],
      delayMs: i * 160 + (i % 4) * 35,
    });
  }
  for (let i = 0; i < 10; i++) {
    enemies.push({
      kind: "laser_shark",
      triggerX: 0,
      y: RAMPAGE_SHARK_LANES[(i + 3) % RAMPAGE_SHARK_LANES.length],
      delayMs: 4600 + i * 200,
    });
  }
  return enemies;
}

export const LEVEL_5_META: RainbowCowboyLevel = {
  id: "level-5",
  slug: "deep-sea-rodeo",
  title: "Deep Sea Rodeo",
  subtitle: "Play as Frogman — swim the minefield to Camp Poseidon.",
  objective: "Swim through the wreck, dodge laser sharks, and reach extraction.",
  description:
    "Underwater side-scroll with 4-way swim controls, unlimited harpoon, sonic blast pickups, destructible sea mines, and laser sharks patrolling the sunken hull.",
  difficulty: "Advanced",
  estimatedMinutes: "3–5 minutes",
  levelWidth: LEVEL_WIDTH,
  groundY: GROUND_Y,
  targetTimeSeconds: 240,
  status: "playable",
  campaignBase: "camp_poseidon",
};

export const LEVEL_5_STORY = `FOB Thunder is secured.

Camp Poseidon waits beneath the waves — and Frogman is first in.

A sunken wreck blocks the route. Swim through the hull. Sharks with lasers patrol inside.

Your harpoon never runs dry. Grab sonic blasts for crowd control. Don't get cocky in the deep.`;

export const LEVEL_5_CONFIG: LevelConfig = {
  level: LEVEL_5_META,
  theme: "deep_sea",
  playMode: "swim",
  character: "frogman",
  storyIntro: LEVEL_5_STORY,
  completeBanner: "DEEP SEA RODEO CLEARED",
  warnings: [{ triggerX: 4050, message: "WRECK AHEAD — SWIM THROUGH THE HULL" }],
  platforms: [
    // Partial deck planks — leave vertical lanes above/below for swim-through
    { x: 4250, y: 308, w: 110, h: 8 },
    { x: 4530, y: 302, w: 100, h: 8 },
    { x: 4760, y: 310, w: 110, h: 8 },
    { x: 8600, y: 300, w: 90, h: 12 },
    { x: 8900, y: 360, w: 100, h: 12 },
    { x: 9200, y: 280, w: 80, h: 12 },
  ],
  walls: [
    // Bow — wide entry portal (y ~272–410)
    { x: 4180, y: 200, w: 24, h: 72 },
    { x: 4180, y: 410, w: 24, h: 50 },
    // Stern — wide exit portal (y ~266–410)
    { x: 4920, y: 200, w: 24, h: 66 },
    { x: 4920, y: 410, w: 24, h: 50 },
    // Overhead deck brows — short ceiling ribs, not full compartment seals
    { x: 4250, y: 200, w: 120, h: 14 },
    { x: 4540, y: 200, w: 110, h: 14 },
    { x: 4770, y: 200, w: 120, h: 14 },
    // Bulkhead 1 — upper + lower stub with ~64px swim doorway (y ~282–346)
    { x: 4398, y: 258, w: 12, h: 24 },
    { x: 4398, y: 346, w: 12, h: 24 },
    // Bulkhead 2 — same doorway alignment
    { x: 4618, y: 258, w: 12, h: 24 },
    { x: 4618, y: 346, w: 12, h: 24 },
    // Floor ribs — low stubs only, do not block lower swim lane
    { x: 4310, y: 418, w: 10, h: 28 },
    { x: 4560, y: 422, w: 10, h: 24 },
    { x: 4800, y: 420, w: 10, h: 26 },
    // Late-route pillars — shortened with headroom above/below
    { x: 8200, y: 240, w: 16, h: 100 },
    { x: 8480, y: 300, w: 16, h: 80 },
    { x: 8720, y: 220, w: 16, h: 110 },
    { x: 9020, y: 280, w: 16, h: 90 },
  ],
  pickups: [
    { kind: "range_beer", x: 600, y: 300 },
    { kind: "weapon_sonic", x: 950, y: 280 },
    { kind: "rainbow", x: 2400, y: 260 },
    { kind: "weapon_sonic", x: 3300, y: 320 },
    { kind: "white_energy_drink", x: 5200, y: 320 },
    { kind: "weapon_sonic", x: 5600, y: 270 },
    { kind: "nicotine_pouch", x: 7100, y: 240 },
    { kind: "rainbow", x: 7800, y: 300 },
    { kind: "weapon_sonic", x: 8200, y: 290 },
    { kind: "unicorn_treat", x: 7980, y: 280 },
    { kind: "weapon_sonic", x: 9900, y: 310 },
  ],
  hazards: [
    { kind: "sea_mine_tethered", x: 900, y: 370 },
    { kind: "sea_mine_tethered", x: 1200, y: 310 },
    { kind: "sea_mine_tethered", x: 1500, y: 390 },
    { kind: "sea_mine_floating", x: 1800, y: 270 },
    { kind: "sea_mine_tethered", x: 2100, y: 350 },
    { kind: "sea_mine_tethered", x: 2400, y: 290 },
    { kind: "sea_mine_floating", x: 2650, y: 380 },
    { kind: "sea_mine_tethered", x: 2900, y: 320 },
    { kind: "sea_mine_tethered", x: 3150, y: 400 },
    { kind: "sea_mine_floating", x: 3400, y: 260 },
    { kind: "sea_mine_tethered", x: 3600, y: 370 },
    { kind: "sea_mine_floating", x: 3750, y: 290 },
    { kind: "sea_mine_tethered", x: 4280, y: 370 },
    { kind: "sea_mine_floating", x: 4350, y: 270 },
    { kind: "sea_mine_tethered", x: 4510, y: 380 },
    { kind: "sea_mine_floating", x: 4580, y: 260 },
    { kind: "sea_mine_tethered", x: 4740, y: 365 },
    { kind: "sea_mine_floating", x: 4850, y: 275 },
    { kind: "sea_mine_floating", x: 5100, y: 300 },
    { kind: "sea_mine_tethered", x: 5450, y: 390 },
    { kind: "sea_mine_floating", x: 5700, y: 270 },
    { kind: "sea_mine_floating", x: 5950, y: 340 },
    { kind: "sea_mine_tethered", x: 6250, y: 380 },
    { kind: "sea_mine_floating", x: 6500, y: 260 },
    { kind: "sea_mine_floating", x: 6750, y: 330 },
    { kind: "sea_mine_tethered", x: 7000, y: 290 },
    { kind: "sea_mine_tethered", x: 7500, y: 400 },
    { kind: "sea_mine_tethered", x: 8600, y: 350 },
    { kind: "sea_mine_floating", x: 8850, y: 270 },
    { kind: "sea_mine_tethered", x: 9100, y: 380 },
    { kind: "sea_mine_tethered", x: 9600, y: 370 },
    { kind: "sea_mine_tethered", x: 9850, y: 310 },
  ],
  enemies: [
    { kind: "laser_shark", triggerX: 500, y: 300 },
    { kind: "laser_shark", triggerX: 900, y: 280, delayMs: 300 },
    { kind: "laser_shark", triggerX: 1300, y: 340, delayMs: 150 },
    { kind: "laser_shark", triggerX: 1700, y: 270, delayMs: 450 },
    { kind: "laser_shark", triggerX: 2100, y: 320, delayMs: 200 },
    { kind: "laser_shark", triggerX: 2500, y: 290, delayMs: 350 },
    { kind: "laser_shark", triggerX: 2900, y: 350, delayMs: 100 },
    { kind: "laser_shark", triggerX: 3300, y: 260, delayMs: 500 },
    { kind: "laser_shark", triggerX: 3700, y: 310, delayMs: 250 },
    { kind: "laser_shark", triggerX: 4050, y: 305, popupOnSpawn: "LASER SHARKS INBOUND" },
    { kind: "laser_shark", triggerX: 4180, y: 278, delayMs: 400 },
    { kind: "laser_shark", triggerX: 4380, y: 292, delayMs: 200 },
    { kind: "laser_shark", triggerX: 4480, y: 318, delayMs: 600 },
    { kind: "laser_shark", triggerX: 4580, y: 275, delayMs: 1000 },
    { kind: "laser_shark", triggerX: 4680, y: 340, delayMs: 350 },
    { kind: "laser_shark", triggerX: 5050, y: 300 },
    { kind: "laser_shark", triggerX: 5400, y: 270, delayMs: 300 },
    { kind: "laser_shark", triggerX: 5750, y: 330, delayMs: 450 },
    { kind: "laser_shark", triggerX: 6100, y: 285, delayMs: 150 },
    { kind: "laser_shark", triggerX: 6800, y: 295, delayMs: 250 },
    { kind: "laser_shark", triggerX: 7500, y: 275, delayMs: 200 },
    { kind: "laser_shark", triggerX: 7850, y: 340, delayMs: 350 },
  ],
  rampageWave: {
    message: "SHARK SWARM!",
    enemies: buildDeepSeaRampageWave(),
  },
  extractionX: 10200,
};
