import type { LevelConfig, RainbowCowboyLevel } from "./rainbowCowboyTypes";



const GROUND_Y = 460;

const LEVEL_WIDTH = 15200;



export const LEVEL_3_META: RainbowCowboyLevel = {

  id: "level-3",

  slug: "boom-bot-alamo",

  title: "Boom Bot Alamo",

  subtitle: "Hold the line. Save the unicorn.",

  objective: "Survive the RC truck waves, clear the nests, and reach extraction.",

  description:

    "A cartoon fort under siege by RC monster trucks, rogue drones, and bouncing cartoon grenades. No gore — just arcade chaos.",

  difficulty: "Advanced",

  estimatedMinutes: "6–9 minutes",

  levelWidth: LEVEL_WIDTH,

  groundY: GROUND_Y,

  targetTimeSeconds: 420,

  status: "playable",

};



export const LEVEL_3_STORY = `The unicorn made it through Drone Valley.



Now RC monster trucks are charging the line.



Big wheels, blinking red lights, and zero mercy.



Some have roof turrets. Some spew grenades.



Grab pistols, machine guns, and bazookas. Hold the Alamo. Save the unicorn.`;



export const LEVEL_3_CONFIG: LevelConfig = {

  level: LEVEL_3_META,

  theme: "alamo",

  completeBanner: "ALAMO HELD — UNICORN SAVED",

  storyIntro: LEVEL_3_STORY,

  warnings: [

    { triggerX: 11800, message: "THE ALAMO — HOLD THE LINE" },

    { triggerX: 13400, message: "RED BARON INBOUND" },

  ],

  extractionGate: ["nests_cleared", "final_wave_survived"],

  finalWave: {

    triggerX: 13100,

    message: "FINAL WAVE INBOUND",

    bonusScore: 1000,

    enemies: [

      { kind: "boom_bot", triggerX: 0, y: GROUND_Y, delayMs: 0 },

      { kind: "boom_bot", triggerX: 0, y: GROUND_Y, delayMs: 250 },

      { kind: "armored_boom_bot", triggerX: 0, y: GROUND_Y, delayMs: 500 },

      { kind: "boom_bot", triggerX: 0, y: GROUND_Y, delayMs: 700 },

      { kind: "fpv", triggerX: 0, y: 240, delayMs: 900 },

      { kind: "boom_bot", triggerX: 0, y: GROUND_Y, delayMs: 1050 },

      { kind: "armored_boom_bot", triggerX: 0, y: GROUND_Y, delayMs: 1300 },

      { kind: "grenade_goblin_bot", triggerX: 0, y: GROUND_Y, delayMs: 1600 },

      { kind: "armored_boom_bot", triggerX: 0, y: GROUND_Y, delayMs: 1800 },

    ],

  },

  platforms: [

    { x: 1200, y: 370, w: 120, h: 16 },

    { x: 5200, y: 350, w: 100, h: 16 },

    { x: 8200, y: 340, w: 110, h: 16 },

    { x: 10600, y: 360, w: 90, h: 16 },

    { x: 12300, y: 380, w: 140, h: 16 },

    { x: 12800, y: 340, w: 100, h: 16 },

    { x: 14100, y: 370, w: 160, h: 16 },

  ],

  walls: [

    { x: 2800, y: GROUND_Y - 72, w: 32, h: 72 },

    { x: 6800, y: GROUND_Y - 80, w: 32, h: 80 },

    { x: 11700, y: GROUND_Y - 96, w: 32, h: 96 },

    { x: 12200, y: GROUND_Y - 64, w: 32, h: 64 },

    { x: 12200, y: GROUND_Y - 128, w: 32, h: 64 },

    { x: 13700, y: GROUND_Y - 88, w: 32, h: 88 },

  ],

  pickups: [

    { kind: "weapon_pistol", x: 950, y: GROUND_Y - 36 },

    { kind: "range_beer", x: 2100, y: GROUND_Y - 36 },

    { kind: "weapon_machine_gun", x: 3200, y: GROUND_Y - 36 },

    { kind: "white_energy_drink", x: 4500, y: GROUND_Y - 36 },

    { kind: "weapon_bazooka", x: 5350, y: GROUND_Y - 36 },

    { kind: "nicotine_pouch", x: 6800, y: GROUND_Y - 36 },

    { kind: "weapon_pistol", x: 7600, y: GROUND_Y - 36 },

    { kind: "weapon_machine_gun", x: 9200, y: GROUND_Y - 36 },

    { kind: "weapon_bazooka", x: 10200, y: GROUND_Y - 36 },

    { kind: "rainbow", x: 11500, y: GROUND_Y - 36 },

    { kind: "weapon_pistol", x: 12100, y: GROUND_Y - 36 },

    { kind: "weapon_bazooka", x: 12650, y: GROUND_Y - 36 },

    { kind: "unicorn_treat", x: 13950, y: GROUND_Y - 36 },

  ],

  hazards: [

    { kind: "landmine", x: 2500, y: GROUND_Y },

    { kind: "landmine", x: 2850, y: GROUND_Y },

    { kind: "landmine", x: 3200, y: GROUND_Y },

    { kind: "landmine", x: 3550, y: GROUND_Y },

    { kind: "landmine", x: 3900, y: GROUND_Y },

    { kind: "trash_balloon", x: 6100, y: GROUND_Y - 95 },

    { kind: "trash_balloon", x: 6400, y: GROUND_Y - 130 },

    { kind: "trash_balloon", x: 6700, y: GROUND_Y - 85 },

    { kind: "trash_balloon", x: 7000, y: GROUND_Y - 110 },

    { kind: "trash_balloon", x: 9800, y: GROUND_Y - 100 },

    { kind: "trash_balloon", x: 10100, y: GROUND_Y - 140 },

  ],

  nests: [

    {

      x: 12450,

      y: GROUND_Y,

      spawnIntervalMs: 850,

      spawnKinds: ["quad", "boom_bot", "fpv", "boom_bot", "recon"],

    },

    {

      x: 13050,

      y: GROUND_Y,

      spawnIntervalMs: 750,

      spawnKinds: ["quad", "boom_bot", "fpv", "armored_boom_bot", "boom_bot"],

    },

  ],

  enemies: [

    // Section 1 — First Wave

    { kind: "boom_bot", triggerX: 500, y: GROUND_Y },

    { kind: "boom_bot", triggerX: 700, y: GROUND_Y, delayMs: 200 },

    { kind: "boom_bot", triggerX: 900, y: GROUND_Y, delayMs: 400 },

    { kind: "boom_bot", triggerX: 1100, y: GROUND_Y, delayMs: 600 },

    { kind: "boom_bot", triggerX: 1300, y: GROUND_Y, delayMs: 800 },

    { kind: "quad", triggerX: 1600, y: 280, delayMs: 500 },

    // Section 2 — Mine Pressure

    { kind: "boom_bot", triggerX: 2300, y: GROUND_Y },

    { kind: "boom_bot", triggerX: 2550, y: GROUND_Y, delayMs: 250 },

    { kind: "boom_bot", triggerX: 2800, y: GROUND_Y, delayMs: 500 },

    { kind: "boom_bot", triggerX: 3700, y: GROUND_Y, delayMs: 400 },

    { kind: "boom_bot", triggerX: 4000, y: GROUND_Y, delayMs: 700 },

    { kind: "boom_bot", triggerX: 4300, y: GROUND_Y, delayMs: 950 },

    { kind: "fpv", triggerX: 4600, y: 250, delayMs: 800 },

    // Section 3 — Drone Mix

    { kind: "boom_bot", triggerX: 4900, y: GROUND_Y },

    { kind: "quad", triggerX: 5200, y: 270, delayMs: 150 },

    { kind: "boom_bot", triggerX: 5400, y: GROUND_Y, delayMs: 300 },

    { kind: "fpv", triggerX: 5650, y: 240, delayMs: 450 },

    { kind: "boom_bot", triggerX: 5900, y: GROUND_Y, delayMs: 600 },

    { kind: "quad", triggerX: 6150, y: 280, delayMs: 750 },

    { kind: "boom_bot", triggerX: 6400, y: GROUND_Y, delayMs: 900 },

    { kind: "fpv", triggerX: 6650, y: 260, delayMs: 1050 },

    { kind: "armored_boom_bot", triggerX: 6900, y: GROUND_Y, delayMs: 1200 },

    // Section 4 — Armored Bots

    { kind: "armored_boom_bot", triggerX: 7400, y: GROUND_Y },

    { kind: "boom_bot", triggerX: 7650, y: GROUND_Y, delayMs: 280 },

    { kind: "armored_boom_bot", triggerX: 7900, y: GROUND_Y, delayMs: 560 },

    { kind: "fpv", triggerX: 8200, y: 250, delayMs: 700 },

    { kind: "quad", triggerX: 8500, y: 260, delayMs: 850 },

    { kind: "armored_boom_bot", triggerX: 8750, y: GROUND_Y, delayMs: 1100 },

    { kind: "boom_bot", triggerX: 9000, y: GROUND_Y, delayMs: 1350 },

    { kind: "fpv", triggerX: 9300, y: 230, delayMs: 1500 },

    // Section 5 — Grenade Goblins

    { kind: "grenade_goblin_bot", triggerX: 10100, y: GROUND_Y },

    { kind: "boom_bot", triggerX: 10350, y: GROUND_Y, delayMs: 250 },

    { kind: "grenade_goblin_bot", triggerX: 10600, y: GROUND_Y, delayMs: 500 },

    { kind: "boom_bot", triggerX: 10850, y: GROUND_Y, delayMs: 750 },

    { kind: "grenade_goblin_bot", triggerX: 11100, y: GROUND_Y, delayMs: 1000 },

    { kind: "fpv", triggerX: 11350, y: 240, delayMs: 1150 },

    { kind: "quad", triggerX: 11600, y: 250, delayMs: 1300 },

    { kind: "armored_boom_bot", triggerX: 11850, y: GROUND_Y, delayMs: 1450 },

    // Section 6 — The Alamo

    { kind: "boom_bot", triggerX: 12000, y: GROUND_Y },

    { kind: "boom_bot", triggerX: 12100, y: GROUND_Y, delayMs: 150 },

    { kind: "boom_bot", triggerX: 12200, y: GROUND_Y, delayMs: 300 },

    { kind: "grenade_goblin_bot", triggerX: 13300, y: GROUND_Y, delayMs: 350 },

    { kind: "grenade_goblin_bot", triggerX: 13450, y: GROUND_Y, delayMs: 550 },

    { kind: "red_baron", triggerX: 13550, y: 210, popupOnSpawn: "RED BARON INBOUND" },

    { kind: "fpv", triggerX: 13650, y: 220, delayMs: 400 },

    { kind: "boom_bot", triggerX: 13700, y: GROUND_Y, delayMs: 450 },

    { kind: "armored_boom_bot", triggerX: 13850, y: GROUND_Y, delayMs: 750 },

    { kind: "quad", triggerX: 14000, y: 260, delayMs: 950 },

    { kind: "armored_boom_bot", triggerX: 14200, y: GROUND_Y, delayMs: 1150 },

  ],

  extractionX: 14800,

};

