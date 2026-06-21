import type { LevelConfig, LevelEnemySpawn, RainbowCowboyLevel } from "./rainbowCowboyTypes";

const GROUND_Y = 460;
const LEVEL_WIDTH = 10400;

const RAMPAGE_LANES = [240, 270, 300, 320, 340, 360, 380] as const;

function buildTrenchRampageWave(): LevelEnemySpawn[] {
  const enemies: LevelEnemySpawn[] = [];
  for (let i = 0; i < 20; i++) {
    enemies.push({
      kind: "laser_shark",
      triggerX: 0,
      y: RAMPAGE_LANES[i % RAMPAGE_LANES.length],
      delayMs: i * 180 + (i % 3) * 40,
    });
  }
  for (let i = 0; i < 6; i++) {
    enemies.push({
      kind: "laser_shark",
      triggerX: 0,
      y: RAMPAGE_LANES[(i + 2) % RAMPAGE_LANES.length],
      delayMs: 3800 + i * 220,
    });
  }
  return enemies;
}

export const LEVEL_6_META: RainbowCowboyLevel = {
  id: "level-6",
  slug: "poseidon-trench",
  title: "Poseidon Trench",
  subtitle: "Frogman dives deeper — floor crawlers and tighter kelp channels.",
  objective: "Navigate the trench, dodge creeper sonic bursts, and reach extraction.",
  description:
    "Second deep-sea swim: kelp squeeze corridors, basalt ribs, fewer sharks, but creeping mines on the seafloor that sonic-blast upward when you pass overhead.",
  difficulty: "Advanced",
  estimatedMinutes: "3–5 minutes",
  levelWidth: LEVEL_WIDTH,
  groundY: GROUND_Y,
  targetTimeSeconds: 240,
  status: "playable",
  campaignBase: "camp_poseidon_trench",
};

export const LEVEL_6_STORY = `Deep Sea Rodeo taught you the wreck.

Now the trench swallows you whole.

Creeper mines patrol the floor — crawl right to left on treads. Pass overhead and they charge a sonic burst at ten degrees off vertical. The red eye means move.

Sharks are thinner here. The floor is not.`;

export const LEVEL_6_CONFIG: LevelConfig = {
  level: LEVEL_6_META,
  theme: "deep_sea",
  playMode: "swim",
  character: "frogman",
  storyIntro: LEVEL_6_STORY,
  completeBanner: "POSEIDON TRENCH CLEARED",
  warnings: [
    { triggerX: 900, message: "CREEPER MINES ON THE SEAFLOOR" },
    { triggerX: 3600, message: "KELP SQUEEZE — STAY IN THE LANE" },
    { triggerX: 7200, message: "SONIC BURST ZONE — DON'T HOVER" },
  ],
  platforms: [
    // Fallen submarine keel ribs — horizontal lanes at varied depth
    { x: 1800, y: 320, w: 140, h: 10 },
    { x: 2100, y: 280, w: 100, h: 8 },
    { x: 5200, y: 300, w: 120, h: 10 },
    { x: 5500, y: 340, w: 90, h: 8 },
    { x: 7800, y: 290, w: 110, h: 10 },
    { x: 8100, y: 330, w: 80, h: 8 },
    { x: 9200, y: 310, w: 100, h: 10 },
  ],
  walls: [
    // Kelp curtain — section 1 (gaps at y ~240–320 and ~360–420)
    { x: 1400, y: 200, w: 14, h: 36 },
    { x: 1400, y: 320, w: 14, h: 38 },
    { x: 1580, y: 200, w: 14, h: 50 },
    { x: 1580, y: 350, w: 14, h: 48 },
    // Basalt arch left pillar + lintel stub
    { x: 2800, y: 220, w: 20, h: 90 },
    { x: 2800, y: 360, w: 20, h: 60 },
    { x: 2800, y: 200, w: 80, h: 14 },
    // Arch right pillar — wide swim-through under lintel
    { x: 3020, y: 240, w: 18, h: 110 },
    { x: 3020, y: 380, w: 18, h: 40 },
    // Kelp squeeze — section 2
    { x: 3800, y: 200, w: 12, h: 70 },
    { x: 3800, y: 310, w: 12, h: 30 },
    { x: 3800, y: 390, w: 12, h: 50 },
    { x: 4020, y: 210, w: 12, h: 55 },
    { x: 4020, y: 300, w: 12, h: 45 },
    { x: 4020, y: 380, w: 12, h: 58 },
    // Thermal vent collar — ring segments (swim over or under)
    { x: 4800, y: 250, w: 16, h: 70 },
    { x: 4800, y: 360, w: 16, h: 60 },
    { x: 4940, y: 270, w: 16, h: 50 },
    { x: 4940, y: 370, w: 16, h: 50 },
    // Collapsed ridge — low ceiling stripe
    { x: 6100, y: 200, w: 160, h: 12 },
    { x: 6100, y: 380, w: 140, h: 14 },
    // Cave pinch — upper/lower teeth
    { x: 6800, y: 200, w: 14, h: 80 },
    { x: 6800, y: 350, w: 14, h: 60 },
    { x: 7000, y: 210, w: 14, h: 60 },
    { x: 7000, y: 340, w: 14, h: 70 },
    // Late basalt spires — staggered
    { x: 8400, y: 230, w: 16, h: 90 },
    { x: 8620, y: 280, w: 16, h: 80 },
    { x: 8840, y: 220, w: 16, h: 100 },
  ],
  pickups: [
    { kind: "range_beer", x: 500, y: 290 },
    { kind: "weapon_sonic", x: 1100, y: 260 },
    { kind: "rainbow", x: 2200, y: 250 },
    { kind: "weapon_sonic", x: 3200, y: 300 },
    { kind: "white_energy_drink", x: 4500, y: 270 },
    { kind: "weapon_sonic", x: 5800, y: 310 },
    { kind: "nicotine_pouch", x: 6600, y: 240 },
    { kind: "rainbow", x: 7600, y: 280 },
    { kind: "weapon_sonic", x: 8300, y: 260 },
    { kind: "unicorn_treat", x: 8100, y: 270 },
    { kind: "weapon_sonic", x: 9500, y: 300 },
  ],
  hazards: [
    { kind: "creeper_mine", x: 1300, y: GROUND_Y },
    { kind: "sea_mine_floating", x: 1600, y: 280 },
    { kind: "creeper_mine", x: 2500, y: GROUND_Y },
    { kind: "sea_mine_tethered", x: 2900, y: 350 },
    { kind: "sea_mine_floating", x: 3400, y: 260 },
    { kind: "creeper_mine", x: 3900, y: GROUND_Y },
    { kind: "sea_mine_tethered", x: 4200, y: 380 },
    { kind: "sea_mine_floating", x: 4600, y: 290 },
    { kind: "creeper_mine", x: 5300, y: GROUND_Y },
    { kind: "sea_mine_tethered", x: 5700, y: 320 },
    { kind: "sea_mine_floating", x: 6000, y: 270 },
    { kind: "creeper_mine", x: 6500, y: GROUND_Y },
    { kind: "sea_mine_floating", x: 6900, y: 340 },
    { kind: "creeper_mine", x: 7400, y: GROUND_Y },
    { kind: "sea_mine_tethered", x: 7900, y: 360 },
    { kind: "creeper_mine", x: 8700, y: GROUND_Y },
    { kind: "sea_mine_floating", x: 9100, y: 280 },
    { kind: "creeper_mine", x: 9600, y: GROUND_Y },
    { kind: "sea_mine_tethered", x: 9900, y: 310 },
  ],
  enemies: [
    { kind: "laser_shark", triggerX: 700, y: 300 },
    { kind: "laser_shark", triggerX: 1100, y: 270, delayMs: 350 },
    { kind: "laser_shark", triggerX: 1700, y: 330, delayMs: 200 },
    { kind: "laser_shark", triggerX: 2300, y: 280, delayMs: 450 },
    { kind: "laser_shark", triggerX: 3000, y: 310, delayMs: 150 },
    { kind: "laser_shark", triggerX: 3700, y: 260, delayMs: 500 },
    { kind: "laser_shark", triggerX: 4100, y: 340, popupOnSpawn: "SHARKS IN THE SQUEEZE" },
    { kind: "laser_shark", triggerX: 4400, y: 290, delayMs: 300 },
    { kind: "laser_shark", triggerX: 5000, y: 270, delayMs: 600 },
    { kind: "laser_shark", triggerX: 5600, y: 320, delayMs: 250 },
    { kind: "laser_shark", triggerX: 6300, y: 285, delayMs: 400 },
    { kind: "laser_shark", triggerX: 7100, y: 300, delayMs: 150 },
    { kind: "laser_shark", triggerX: 8000, y: 265, delayMs: 350 },
    { kind: "laser_shark", triggerX: 8800, y: 310, delayMs: 200 },
    { kind: "laser_shark", triggerX: 9300, y: 275, delayMs: 500 },
  ],
  rampageWave: {
    message: "SHARK SWARM!",
    enemies: buildTrenchRampageWave(),
  },
  extractionX: 9800,
};
