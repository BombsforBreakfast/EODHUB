import type {
  LevelConfig,
  LevelEnemySpawn,
  LevelHazardSpawn,
  LevelPlatform,
  LevelWall,
  RainbowCowboyLevel,
} from "./rainbowCowboyTypes";
import {
  ABYSS_ARENA_Y,
  ABYSS_FLOOR_Y,
  ABYSS_LEVEL_WIDTH,
  ABYSS_SECTION_Y,
} from "./rainbowCowboyAbyssConstants";
import { VIEW_W } from "./rainbowCowboyConstants";

const FLOOR_Y = ABYSS_FLOOR_Y;

function buildOceanFloorObstacles(): { walls: LevelWall[]; platforms: LevelPlatform[] } {
  // Wide central swim lane — debris only on far edges at floor level
  const walls: LevelWall[] = [
    { x: 32, y: FLOOR_Y - 48, w: 18, h: 48 },
    { x: 910, y: FLOOR_Y - 52, w: 18, h: 52 },
    { x: 140, y: FLOOR_Y - 72, w: 14, h: 36 },
    { x: 806, y: FLOOR_Y - 68, w: 14, h: 32 },
  ];
  const platforms: LevelPlatform[] = [
    { x: 160, y: FLOOR_Y - 110, w: 64, h: 8 },
    { x: 736, y: FLOOR_Y - 105, w: 64, h: 8 },
  ];
  return { walls, platforms };
}

function buildSunkenShip(): { walls: LevelWall[]; platforms: LevelPlatform[] } {
  const walls: LevelWall[] = [];
  const platforms: LevelPlatform[] = [];
  const baseY = ABYSS_SECTION_Y.ship;
  walls.push({ x: 40, y: baseY - 200, w: 24, h: 200 });
  walls.push({ x: 40, y: baseY - 20, w: 24, h: 80 });
  walls.push({ x: 880, y: baseY - 180, w: 24, h: 180 });
  walls.push({ x: 880, y: baseY + 20, w: 24, h: 100 });
  platforms.push({ x: 120, y: baseY - 60, w: 200, h: 12 });
  platforms.push({ x: 400, y: baseY - 120, w: 160, h: 10 });
  platforms.push({ x: 620, y: baseY - 80, w: 180, h: 12 });
  walls.push({ x: 350, y: baseY - 160, w: 260, h: 16 });
  walls.push({ x: 350, y: baseY + 40, w: 260, h: 16 });
  return { walls, platforms };
}

function buildMinefield(): { walls: LevelWall[]; hazards: LevelHazardSpawn[] } {
  const walls: LevelWall[] = [];
  const hazards: LevelHazardSpawn[] = [];
  const baseY = ABYSS_SECTION_Y.minefield;
  walls.push({ x: 0, y: baseY - 220, w: VIEW_W, h: 14 });
  walls.push({ x: 180, y: baseY - 160, w: 20, h: 140 });
  walls.push({ x: 760, y: baseY - 140, w: 20, h: 120 });
  return { walls, hazards };
}

function buildSharkGauntlet(): { walls: LevelWall[]; enemies: LevelEnemySpawn[] } {
  const walls: LevelWall[] = [];
  const enemies: LevelEnemySpawn[] = [];
  const baseY = ABYSS_SECTION_Y.sharkGauntlet;
  for (let i = 0; i < 5; i++) {
    walls.push({
      x: 120 + i * 160,
      y: baseY - 180 + (i % 2) * 60,
      w: 24,
      h: 180 - (i % 2) * 80,
    });
    walls.push({
      x: 120 + i * 160 + 80,
      y: baseY - 60,
      w: 24,
      h: 120,
    });
  }
  for (let i = 0; i < 8; i++) {
    enemies.push({
      kind: "laser_shark",
      triggerX: 0,
      triggerY: baseY - i * 30,
      y: baseY - 80 - (i % 3) * 45,
      fixedX: 100 + (i * 97) % (VIEW_W - 200),
      delayMs: i * 400,
      patrolMinX: 60,
      patrolMaxX: VIEW_W - 60,
      patrolDir: i % 2 === 0 ? 1 : -1,
    });
  }
  return { walls, enemies };
}

function buildSubGraveyard(): { walls: LevelWall[]; platforms: LevelPlatform[]; hazards: LevelHazardSpawn[] } {
  const walls: LevelWall[] = [];
  const platforms: LevelPlatform[] = [];
  const hazards: LevelHazardSpawn[] = [];
  const baseY = ABYSS_SECTION_Y.subGraveyard;
  walls.push({ x: 80, y: baseY - 240, w: 200, h: 28 });
  walls.push({ x: 680, y: baseY - 200, w: 180, h: 24 });
  platforms.push({ x: 300, y: baseY - 100, w: 120, h: 14 });
  platforms.push({ x: 520, y: baseY - 160, w: 100, h: 12 });
  walls.push({ x: 420, y: baseY - 80, w: 28, h: 160 });
  walls.push({ x: 520, y: baseY - 40, w: 28, h: 120 });
  return { walls, platforms, hazards };
}

function buildSurfacePush(): { walls: LevelWall[]; enemies: LevelEnemySpawn[]; pickups: LevelConfig["pickups"] } {
  const walls: LevelWall[] = [];
  const enemies: LevelEnemySpawn[] = [];
  const pickups: LevelConfig["pickups"] = [];
  const baseY = ABYSS_SECTION_Y.surfacePush;
  walls.push({ x: 0, y: baseY - 300, w: VIEW_W, h: 16 });
  walls.push({ x: 200, y: baseY - 220, w: 24, h: 200 });
  walls.push({ x: 736, y: baseY - 200, w: 24, h: 180 });
  for (let i = 0; i < 6; i++) {
    enemies.push({
      kind: "laser_shark",
      triggerX: 0,
      triggerY: baseY - i * 25,
      y: baseY - 60 - i * 35,
      fixedX: 80 + i * 130,
      delayMs: i * 250,
      patrolMinX: 40,
      patrolMaxX: VIEW_W - 40,
    });
  }
  pickups.push({ kind: "rainbow", x: 220, y: baseY - 140 });
  pickups.push({ kind: "weapon_sonic", x: 180, y: baseY - 100 });
  pickups.push({ kind: "white_energy_drink", x: 240, y: baseY - 120 });
  return { walls, enemies, pickups };
}

function buildSectionPickups(): LevelConfig["pickups"] {
  const lane = 200;
  return [
    { kind: "weapon_sonic", x: lane, y: FLOOR_Y - 240 },
    { kind: "rainbow", x: lane + 40, y: ABYSS_SECTION_Y.ship - 90 },
    { kind: "weapon_sonic", x: lane, y: ABYSS_SECTION_Y.minefield - 70 },
    { kind: "unicorn_treat", x: lane + 30, y: ABYSS_SECTION_Y.sharkGauntlet - 100 },
    { kind: "rainbow", x: lane, y: ABYSS_SECTION_Y.subGraveyard - 120 },
    { kind: "weapon_sonic", x: lane + 20, y: ABYSS_SECTION_Y.surfacePush - 90 },
    { kind: "range_beer", x: lane + 60, y: ABYSS_SECTION_Y.ship - 140 },
    { kind: "white_energy_drink", x: lane, y: ABYSS_SECTION_Y.sharkGauntlet - 160 },
  ];
}

const floor = buildOceanFloorObstacles();
const ship = buildSunkenShip();
const minefield = buildMinefield();
const sharks = buildSharkGauntlet();
const subs = buildSubGraveyard();
const surface = buildSurfacePush();

export const LEVEL_8_META: RainbowCowboyLevel = {
  id: "level-8",
  slug: "the-abyss",
  title: "The Abyss",
  subtitle: "Don't let it catch you.",
  objective: "Descend to awaken the mechanical squid, then ascend and destroy THE ABYSS.",
  description:
    "Drop into the depths to find a Cold War mechanical squid, then flee upward through wreckage, narrow lanes, and shark gauntlets. Survive the ascent and destroy THE ABYSS on the offshore platform.",
  difficulty: "Boss",
  estimatedMinutes: "6–10 minutes",
  levelWidth: ABYSS_LEVEL_WIDTH,
  groundY: FLOOR_Y,
  levelHeight: FLOOR_Y,
  targetTimeSeconds: 480,
  status: "playable",
  campaignBase: "camp_poseidon_abyss",
  isBossLevel: true,
};

export const LEVEL_8_STORY = `THE ABYSS

Don't let it catch you.

The ocean has infinite depth. You hover above the floor.

Descend first. Something waits below.

Then swim up. Always up.

A gigantic mechanical squid lurks to starboard — brass armor, spinning propellers, tentacles lashing left toward you.

Reach the offshore platform. Destroy the tentacles. Spear the eye.

Secure Camp Poseidon.`;

export const LEVEL_8_CONFIG: LevelConfig = {
  level: LEVEL_8_META,
  theme: "abyss",
  playMode: "swim",
  scrollAxis: "vertical",
  character: "frogman",
  storyIntro: LEVEL_8_STORY,
  completeBanner: "CAMP POSEIDON SECURED",
  victoryCondition: "boss_defeated",
  bossKind: "abyss",
  warnings: [
    { triggerX: 0, triggerY: ABYSS_SECTION_Y.floor, message: "THE ABYSS — SWIM UP!" },
    { triggerX: 0, triggerY: ABYSS_SECTION_Y.ship, message: "SUNKEN SHIP AHEAD" },
    { triggerX: 0, triggerY: ABYSS_SECTION_Y.minefield, message: "NARROW PASSAGE" },
    { triggerX: 0, triggerY: ABYSS_SECTION_Y.sharkGauntlet, message: "SHARK GAUNTLET" },
    { triggerX: 0, triggerY: ABYSS_SECTION_Y.subGraveyard, message: "SUBMARINE GRAVEYARD" },
    { triggerX: 0, triggerY: ABYSS_SECTION_Y.surfacePush, message: "SURFACE PUSH — GO GO GO" },
  ],
  platforms: [...floor.platforms, ...ship.platforms, ...subs.platforms],
  walls: [
    ...floor.walls,
    ...ship.walls,
    ...minefield.walls,
    ...sharks.walls,
    ...subs.walls,
    ...surface.walls,
    { x: -8, y: ABYSS_ARENA_Y - 8, w: 24, h: 200 },
    { x: VIEW_W - 16, y: ABYSS_ARENA_Y - 8, w: 24, h: 200 },
  ],
  pickups: [...buildSectionPickups(), ...surface.pickups],
  hazards: [],
  enemies: [
    ...sharks.enemies,
    ...surface.enemies,
    {
      kind: "laser_shark",
      triggerX: 0,
      triggerY: ABYSS_SECTION_Y.ship,
      y: ABYSS_SECTION_Y.ship - 70,
      fixedX: 480,
      delayMs: 200,
      patrolMinX: 100,
      patrolMaxX: VIEW_W - 100,
    },
  ],
  extractionX: 0,
  extractionY: ABYSS_ARENA_Y,
};
