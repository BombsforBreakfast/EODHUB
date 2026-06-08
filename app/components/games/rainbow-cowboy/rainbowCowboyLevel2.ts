import type { LevelConfig, RainbowCowboyLevel } from "./rainbowCowboyTypes";

const GROUND_Y = 460;
const LEVEL_WIDTH = 16800;

export const LEVEL_2_META: RainbowCowboyLevel = {
  id: "level-2",
  slug: "drone-valley",
  title: "Drone Valley",
  subtitle: "The sky belongs to the drones.",
  objective: "Fight through the valley, survive the swarm, and reach extraction.",
  description:
    "A rocky canyon swarming with aggressive drones, bomber runs, and nest complexes. Longer and meaner than Pasture of Peril.",
  difficulty: "Basic",
  estimatedMinutes: "5–7 minutes",
  levelWidth: LEVEL_WIDTH,
  groundY: GROUND_Y,
  targetTimeSeconds: 360,
  status: "playable",
};

export const LEVEL_2_STORY = `The unicorn survived Pasture of Peril.

Unfortunately, he has wandered directly into Drone Valley.

The valley is notorious for aggressive drone activity.

Stay mobile. Manage your rainbow charges. Prioritize threats.

And whatever you do…

Don't eat the balloons.`;

export const LEVEL_2_CONFIG: LevelConfig = {
  level: LEVEL_2_META,
  theme: "canyon",
  completeBanner: "DRONE VALLEY CLEARED",
  storyIntro: LEVEL_2_STORY,
  warnings: [
    { triggerX: 3950, message: "RED BARON INBOUND" },
    { triggerX: 11400, message: "DRONE SWARM DETECTED" },
  ],
  platforms: [
    // Section 1 — warmup ledges
    { x: 900, y: 380, w: 120, h: 16 },
    { x: 1400, y: 340, w: 100, h: 16 },
    // Section 2 — lower canyon
    { x: 2600, y: 360, w: 140, h: 16 },
    { x: 3100, y: 320, w: 90, h: 16 },
    // Section 4 — cliffside route
    { x: 5400, y: 350, w: 110, h: 16 },
    { x: 5800, y: 300, w: 130, h: 16 },
    { x: 6200, y: 360, w: 100, h: 16 },
    { x: 6600, y: 280, w: 80, h: 16 },
    // Section 5 — nest complex platforms
    { x: 7800, y: 340, w: 120, h: 16 },
    { x: 8400, y: 300, w: 100, h: 16 },
    // Section 6 — balloon field ledge
    { x: 10200, y: 330, w: 140, h: 16 },
    // Section 8 — broken bridge
    { x: 13800, y: 360, w: 70, h: 16 },
    { x: 14120, y: 340, w: 70, h: 16 },
    { x: 14440, y: 320, w: 70, h: 16 },
    { x: 14760, y: 340, w: 70, h: 16 },
    { x: 15080, y: 360, w: 80, h: 16 },
    // Section 9 — exit ledge
    { x: 15600, y: 370, w: 160, h: 16 },
  ],
  walls: [
    { x: 2200, y: GROUND_Y - 72, w: 32, h: 72 },
    { x: 4800, y: GROUND_Y - 88, w: 32, h: 88 },
    { x: 9200, y: GROUND_Y - 64, w: 32, h: 64 },
    { x: 13200, y: GROUND_Y - 80, w: 32, h: 80 },
  ],
  pickups: [
    { kind: "range_beer", x: 1100, y: GROUND_Y - 36 },
    { kind: "white_energy_drink", x: 3200, y: GROUND_Y - 36 },
    { kind: "range_beer", x: 4800, y: GROUND_Y - 36 },
    { kind: "nicotine_pouch", x: 6500, y: 260 },
    { kind: "rainbow", x: 6700, y: GROUND_Y - 36 },
    { kind: "range_beer", x: 7100, y: GROUND_Y - 36 },
    { kind: "range_beer", x: 8700, y: GROUND_Y - 36 },
    { kind: "unicorn_treat", x: 9400, y: GROUND_Y - 36 },
    { kind: "white_energy_drink", x: 10800, y: GROUND_Y - 36 },
    { kind: "range_beer", x: 11200, y: GROUND_Y - 36 },
    { kind: "rainbow", x: 11600, y: GROUND_Y - 36 },
    { kind: "unicorn_treat", x: 11800, y: GROUND_Y - 36 },
    { kind: "rainbow", x: 12000, y: 300 },
    // After swarm corridor — reload before broken bridge
    { kind: "range_beer", x: 13350, y: GROUND_Y - 36 },
    { kind: "rainbow", x: 13550, y: GROUND_Y - 36 },
    { kind: "nicotine_pouch", x: 14440, y: 284 },
    { kind: "range_beer", x: 14200, y: 300 },
  ],
  hazards: [
    { kind: "trash_balloon", x: 6000, y: GROUND_Y - 100 },
    { kind: "trash_balloon", x: 9600, y: GROUND_Y - 80 },
    { kind: "trash_balloon", x: 9900, y: GROUND_Y - 130 },
    { kind: "trash_balloon", x: 10200, y: GROUND_Y - 70 },
    { kind: "trash_balloon", x: 10500, y: GROUND_Y - 110 },
    { kind: "trash_balloon", x: 10800, y: GROUND_Y - 90 },
    { kind: "landmine", x: 13600, y: GROUND_Y },
    { kind: "landmine", x: 14000, y: GROUND_Y },
    { kind: "dynamite", x: 14500, y: GROUND_Y - 28, timerSeconds: 5 },
    { kind: "dynamite", x: 14900, y: GROUND_Y - 28, timerSeconds: 4 },
  ],
  nests: [
    { x: 7600, y: GROUND_Y, spawnKinds: ["recon", "quad", "quad", "fpv"] },
    { x: 8800, y: GROUND_Y, spawnKinds: ["recon", "quad", "fpv", "quad"] },
    { x: 10000, y: GROUND_Y, spawnKinds: ["quad", "recon", "fpv", "quad"] },
  ],
  enemies: [
    // Section 1 — Valley Warmup
    { kind: "recon", triggerX: 400, y: 300 },
    { kind: "recon", triggerX: 650, y: 280, delayMs: 200 },
    { kind: "quad", triggerX: 900, y: 260, delayMs: 350 },
    { kind: "quad", triggerX: 1100, y: 290, delayMs: 500 },
    { kind: "recon", triggerX: 1300, y: 270, delayMs: 650 },
    { kind: "quad", triggerX: 1550, y: 250, delayMs: 800 },
    { kind: "fixed_wing", triggerX: 1800, y: 110 },
    // Section 2 — Lower Canyon
    { kind: "quad", triggerX: 2100, y: 260 },
    { kind: "fpv", triggerX: 2300, y: 270, delayMs: 150 },
    { kind: "quad", triggerX: 2500, y: 240, delayMs: 300 },
    { kind: "quad", triggerX: 2700, y: 280, delayMs: 450 },
    { kind: "recon", triggerX: 2900, y: 250, delayMs: 600 },
    { kind: "fixed_wing", triggerX: 3100, y: 120, delayMs: 750 },
    { kind: "fpv", triggerX: 3300, y: 260, delayMs: 900 },
    { kind: "quad", triggerX: 3500, y: 230, delayMs: 1050 },
    // Section 3 — First Red Baron
    { kind: "red_baron", triggerX: 4000, y: 220, popupOnSpawn: "RED BARON INBOUND" },
    { kind: "quad", triggerX: 4200, y: 270, delayMs: 400 },
    { kind: "recon", triggerX: 4400, y: 250, delayMs: 700 },
    // Section 4 — Cliffside
    { kind: "quad", triggerX: 5200, y: 240 },
    { kind: "fpv", triggerX: 5400, y: 260, delayMs: 150 },
    { kind: "quad", triggerX: 5600, y: 220, delayMs: 300 },
    { kind: "recon", triggerX: 5800, y: 280, delayMs: 450 },
    { kind: "quad", triggerX: 6000, y: 240, delayMs: 600 },
    { kind: "fpv", triggerX: 6200, y: 200, delayMs: 750 },
    { kind: "fixed_wing", triggerX: 6400, y: 100, delayMs: 900 },
    { kind: "red_baron", triggerX: 6600, y: 210, delayMs: 1100 },
    { kind: "quad", triggerX: 6800, y: 260, delayMs: 1300 },
    // Section 5 — Nest complex
    { kind: "recon", triggerX: 7200, y: 280 },
    { kind: "quad", triggerX: 7400, y: 250, delayMs: 200 },
    { kind: "fpv", triggerX: 7600, y: 270, delayMs: 400 },
    { kind: "quad", triggerX: 8000, y: 240, delayMs: 600 },
    { kind: "recon", triggerX: 8200, y: 260, delayMs: 800 },
    { kind: "fpv", triggerX: 8600, y: 230, delayMs: 1000 },
    { kind: "red_baron", triggerX: 9100, y: 210, delayMs: 1200 },
    { kind: "quad", triggerX: 9300, y: 250, delayMs: 1400 },
    // Section 6 — Balloon field
    { kind: "quad", triggerX: 9500, y: 250 },
    { kind: "recon", triggerX: 9700, y: 230, delayMs: 150 },
    { kind: "quad", triggerX: 9900, y: 270, delayMs: 300 },
    { kind: "fpv", triggerX: 10100, y: 240, delayMs: 450 },
    { kind: "quad", triggerX: 10300, y: 260, delayMs: 600 },
    { kind: "cargo", triggerX: 10500, y: 270, delayMs: 750 },
    { kind: "quad", triggerX: 10700, y: 220, delayMs: 900 },
    { kind: "recon", triggerX: 10900, y: 250, delayMs: 1050 },
    // Section 7 — Swarm corridor
    { kind: "quad", triggerX: 11300, y: 260 },
    { kind: "recon", triggerX: 11400, y: 220, delayMs: 100 },
    { kind: "quad", triggerX: 11500, y: 280, delayMs: 200 },
    { kind: "fpv", triggerX: 11600, y: 240, delayMs: 300 },
    { kind: "quad", triggerX: 11700, y: 260, delayMs: 400 },
    { kind: "recon", triggerX: 11800, y: 210, delayMs: 500 },
    { kind: "fpv", triggerX: 11900, y: 270, delayMs: 600 },
    { kind: "quad", triggerX: 12000, y: 230, delayMs: 700 },
    { kind: "red_baron", triggerX: 12100, y: 200, delayMs: 800 },
    { kind: "quad", triggerX: 12200, y: 260, delayMs: 900 },
    { kind: "fpv", triggerX: 12300, y: 240, delayMs: 1000 },
    { kind: "quad", triggerX: 12400, y: 220, delayMs: 1100 },
    { kind: "recon", triggerX: 12500, y: 280, delayMs: 1200 },
    { kind: "fpv", triggerX: 12600, y: 250, delayMs: 1300 },
    { kind: "fixed_wing", triggerX: 12700, y: 100, delayMs: 1400 },
    { kind: "quad", triggerX: 12800, y: 260, delayMs: 1500 },
    { kind: "recon", triggerX: 12900, y: 210, delayMs: 1600 },
    { kind: "fpv", triggerX: 13000, y: 270, delayMs: 1700 },
    { kind: "quad", triggerX: 13100, y: 240, delayMs: 1800 },
    { kind: "cargo", triggerX: 13200, y: 260, delayMs: 1900 },
    { kind: "quad", triggerX: 13300, y: 220, delayMs: 2000 },
    // Section 8 — Broken bridge
    { kind: "fpv", triggerX: 13500, y: 280 },
    { kind: "quad", triggerX: 13700, y: 260, delayMs: 200 },
    { kind: "red_baron", triggerX: 13900, y: 190, delayMs: 400 },
    { kind: "fpv", triggerX: 14100, y: 270, delayMs: 600 },
    { kind: "quad", triggerX: 14300, y: 250, delayMs: 800 },
    { kind: "red_baron", triggerX: 14500, y: 200, delayMs: 1000 },
    { kind: "fixed_wing", triggerX: 14800, y: 130, delayMs: 1200 },
    { kind: "quad", triggerX: 15000, y: 260, delayMs: 1400 },
    // Section 9 — Valley exit
    { kind: "quad", triggerX: 15400, y: 260 },
    { kind: "fpv", triggerX: 15600, y: 240, delayMs: 300 },
    { kind: "recon", triggerX: 15800, y: 270, delayMs: 600 },
    { kind: "quad", triggerX: 16000, y: 250, delayMs: 900 },
  ],
  extractionX: 16200,
};
