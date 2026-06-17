import { VIEW_W } from "./rainbowCowboyConstants";
import { HIVE_ARENA_WIDTH, HIVE_MAX_HP } from "./rainbowCowboyHiveConstants";
import type { LevelConfig, RainbowCowboyLevel } from "./rainbowCowboyTypes";

const GROUND_Y = 460;
const ARENA_WIDTH = HIVE_ARENA_WIDTH;

export const LEVEL_4_META: RainbowCowboyLevel = {
  id: "level-4",
  slug: "the-hive",
  title: "The Hive",
  subtitle: "Shut down the swarm.",
  objective: "Destroy The Hive and secure FOB Thunder.",
  description:
    "A gigantic cartoon landmine bristling with radar dishes and a drone hatch. Ride the planks, dodge the swarm, and shut down every drone in the arsenal.",
  difficulty: "Boss",
  estimatedMinutes: "5–8 minutes",
  levelWidth: ARENA_WIDTH,
  groundY: GROUND_Y,
  targetTimeSeconds: 420,
  status: "playable",
  campaignBase: "fob_thunder",
  isBossLevel: true,
};

export const LEVEL_4_STORY = `THE HIVE

Shut down the swarm.

A massive angry landmine — five times the size of anything you've stomped before.

Trapdoor hatch. Full drone swarm. Static planks.

You start with a pistol.

Find the openings. Shut it down.`;

export const LEVEL_4_CONFIG: LevelConfig = {
  level: LEVEL_4_META,
  theme: "hive",
  storyIntro: LEVEL_4_STORY,
  completeBanner: "FOB THUNDER SECURED",
  victoryCondition: "boss_defeated",
  bossArena: {
    triggerX: 0,
    width: ARENA_WIDTH,
    hiveMaxHp: HIVE_MAX_HP,
    immediate: true,
  },
  warnings: [{ triggerX: 0, message: "BOSS ARENA — SHUT DOWN THE SWARM" }],
  platforms: [],
  walls: [
    { x: -8, y: GROUND_Y - 200, w: 24, h: 200 },
    { x: ARENA_WIDTH - 16, y: GROUND_Y - 200, w: 24, h: 200 },
  ],
  pickups: [],
  hazards: [],
  enemies: [],
  extractionX: ARENA_WIDTH,
};
