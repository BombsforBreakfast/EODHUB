import {
  BALLOON_ALTITUDE,
  BALLOON_SIZE,
  BOMB_FUSE_MS,
  BOMB_GRAVITY,
  BOMB_RADIUS,
  DYNAMITE_RADIUS,
  DYNAMITE_SIZE,
  DRONE_HOMING,
  ENEMY_SIZES,
  ENEMY_SPEEDS,
  LANDMINE_BODY_RADIUS,
  LANDMINE_AIRBORNE_HALF_W,
  LANDMINE_CLEAR_HEIGHT,
  LANDMINE_EXPLODE_MS,
  LANDMINE_TRIGGER_RADIUS,
  NEST_DEFAULT_SPAWN_MS,
  NEST_H,
  NEST_W,
  RED_BARON_BOMB_INTERVAL_MS,
  RED_BARON_BOMB_WARNING_MS,
  ARMORED_BOOM_BOT_EXPLOSION_RADIUS,
  ARMORED_BOOM_BOT_HP,
  ARMORED_BOOM_BOT_SPEED,
  BLASTER_DURATION_MS,
  BLASTER_FIRE_COOLDOWN_MS,
  BLASTER_PROJECTILE_H,
  BLASTER_PROJECTILE_SPEED,
  BLASTER_PROJECTILE_W,
  MACHINE_GUN_FIRE_COOLDOWN_MS,
  BAZOOKA_FIRE_COOLDOWN_MS,
  BAZOOKA_PROJECTILE_H,
  BAZOOKA_PROJECTILE_SPEED,
  BAZOOKA_PROJECTILE_W,
  BAZOOKA_ROCKETS_PER_PICKUP,
  BOOM_BOT_EXPLOSION_RADIUS,
  BOOM_BOT_HP,
  BOOM_BOT_SPEED,
  GOBLIN_BOT_HP,
  GOBLIN_BOT_SPEED,
  GOBLIN_THROW_INTERVAL_MS,
  TURRET_TRUCK_SHOOT_INTERVAL_MS,
  TURRET_TRUCK_TURN_SPEED,
  TURRET_BULLET_SPEED,
  ENEMY_BULLET_RADIUS,
  GASSED_DURATION_MS,
  GASSED_MOVE_MULT,
  DUCK_SPEED_MULT,
  GRAVITY,
  INVINCIBLE_FLASH_MS,
  COYOTE_TIME_MS,
  JUMP_BUFFER_MS,
  JUMP_VEL,
  KNOCKBACK_DECAY,
  MAX_HEARTS,
  MAX_RAINBOW_CHARGES,
  MOVE_SPEED,
  PICKUP_SIZE,
  PLAYER_H,
  PLAYER_W,
  FROGMAN_W,
  RAMPAGE_DURATION_MS,
  RAMPAGE_SPEED_MULT,
  RAINBOW_BLAST_RADIUS,
  SPEED_BOOST_MS,
  BOOST_SPEED_MULT,
  TONGUE_COOLDOWN_MS,
  TONGUE_DURATION_MS,
  TONGUE_HOMING_RANGE,
  TONGUE_LENGTH,
  TONGUE_TIP_RADIUS,
  VIEW_W,
  VIEW_H,
  SWIM_SPEED,
  WATER_SURFACE_Y,
  SEA_MINE_SIZE,
  SEA_MINE_SENSE_RADIUS,
  SEA_MINE_ARM_MS,
  SEA_MINE_BLAST_RADIUS,
  SEA_MINE_SCORE,
  SEA_MINE_BOB_AMP_MIN,
  SEA_MINE_BOB_AMP_MAX,
  CREEPER_MINE_W,
  CREEPER_MINE_H,
  CREEPER_MINE_SPEED,
  CREEPER_OVERHEAD_HALF_W,
  CREEPER_OVERHEAD_CANCEL_HALF_W,
  CREEPER_MIN_Y_ABOVE,
  CREEPER_CHARGE_MS,
  CREEPER_CHARGE_CRAWL_MULT,
  CREEPER_FIRE_COOLDOWN_MS,
  CREEPER_BURST_GROW,
  CREEPER_BURST_DURATION_MS,
  CREEPER_MINE_SCORE,
  SPEAR_PROJECTILE_SPEED,
  SPEAR_FIRE_COOLDOWN_MS,
  SONIC_PICKUP_CHARGES,
  SONIC_FIRE_COOLDOWN_MS,
  SONIC_WAVE_SPEED,
  SONIC_WAVE_GROW,
  SONIC_WAVE_MAX_RADIUS,
  SONIC_WAVE_DURATION_MS,
  LASER_SHARK_SHOOT_INTERVAL_MS,
  LASER_SHARK_BULLET_SPEED,
  SHARK_HOMING,
  GATOR_KAMIKAZE,
  GATOR_CHARGE_HIT_PAD_X,
  GATOR_CHARGE_HIT_PAD_Y,
  FLOATING_LOG_W,
  FLOATING_LOG_H,
} from "./rainbowCowboyConstants";
import {
  DRONE_SCORES,
  NEST_DESTROY_SCORE,
  PICKUP_SCORES,
  RAINBOW_BLAST_BONUS,
  LEVEL_3_FINAL_WAVE_BONUS,
  buildRainbowCowboyRunResult,
} from "./rainbowCowboyScoring";
import type { LevelConfig } from "./rainbowCowboyTypes";
import { levelHasWeaponControls } from "./rainbowCowboyControlProfile";
import type {
  RainbowCowboyEnemyKind,
  RainbowCowboyGamePhase,
  RainbowCowboyHazardKind,
  RainbowCowboyHudSnapshot,
  RainbowCowboyPickupKind,
  RainbowCowboyRunResult,
  WeaponKind,
  SwimWeaponKind,
} from "./rainbowCowboyTypes";
import type { UnicornHeroAudioEvent } from "../unicorn-hero/unicornHeroAudio";
import type { UnicornHeroRideType } from "../unicorn-hero/unicornHeroRides";
import {
  getRideBadAttackPopup,
  getRideStatusAttack,
  getRideStatusRiding,
} from "../unicorn-hero/unicornHeroRides";
import { getAbyssEyeMinePressureMult, getBossPressureMult, HIVE_BOSS_PRESSURE_MULT } from "./rainbowCowboyDifficulty";
import { HiveBossController, PHASE_3_PLUS_EASE_MULT } from "./rainbowCowboyHiveBoss";
import { AbyssBossController } from "./rainbowCowboyAbyssBoss";
import {
  ABYSS_ARENA_Y,
  ABYSS_ENGAGE_Y,
  ABYSS_FALL_DAMAGE_INTERVAL_MS,
  ABYSS_FALL_DAMAGE_THRESHOLD,
  ABYSS_FLOOR_Y,
  ABYSS_PLAYER_SPAWN_Y,
  ABYSS_PLAYER_LANE_X,
  ABYSS_SURFACE_Y,
  ABYSS_TENTACLE_COUNT,
} from "./rainbowCowboyAbyssConstants";
import { rectIntersectsSonicCone, rectIntersectsHostileBurst, creeperBurstDirections, creeperBurstMaxLength } from "./rainbowCowboyDeepSea";
import {
  HIVE_BAZOOKA_AMMO,
  HIVE_BAZOOKA_DAMAGE,
  HIVE_CLOSED_DAMAGE_MULT,
  HIVE_MG_AMMO,
  HIVE_MG_DAMAGE,
  HIVE_PISTOL_DAMAGE,
  HIVE_RAINBOW_DAMAGE,
} from "./rainbowCowboyHiveConstants";

/** Bumped when engine internals change so HMR can replace stale instances. */
export const RAINBOW_COWBOY_ENGINE_REVISION = 54;

export interface GameInput {
  left: boolean;
  right: boolean;
  down: boolean;
  up: boolean;
  jumpPressed: boolean;
  tonguePressed: boolean;
  gunPressed: boolean;
  gunHeld: boolean;
  rainbowPressed: boolean;
  weaponSwapPressed: boolean;
  pausePressed: boolean;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type EnemyPhase = "patrol" | "homing" | "swoop";

interface Enemy {
  id: string;
  kind: RainbowCowboyEnemyKind;
  x: number;
  y: number;
  baseY: number;
  w: number;
  h: number;
  vx: number;
  active: boolean;
  bobPhase: number;
  phase: EnemyPhase;
  homingSince: number;
  patrolMinX?: number;
  patrolMaxX?: number;
  bombCooldownMs?: number;
  bombWarning?: boolean;
  hp?: number;
  maxHp?: number;
  throwCooldownMs?: number;
  beepPhase?: number;
  turretAngle?: number;
  shootCooldownMs?: number;
  groundUnit?: boolean;
  fromFinalWave?: boolean;
  cosmetic?: boolean;
  cosmeticFuseMs?: number;
  vy?: number;
}

interface BlasterProjectile {
  id: string;
  x: number;
  y: number;
  vx: number;
  active: boolean;
  weapon: WeaponKind;
}

export interface SonicWave {
  id: string;
  x: number;
  y: number;
  dir: 1 | -1;
  radius: number;
  bornMs: number;
  active: boolean;
  hitEnemyIds: string[];
  hitHazardIds: string[];
}

export interface HostileSonicBurst {
  id: string;
  groupId: string;
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  length: number;
  maxLength: number;
  bornMs: number;
  active: boolean;
}

interface Bomb {
  id: string;
  x: number;
  y: number;
  vy: number;
  vx?: number;
  bounces?: number;
  grounded: boolean;
  fuseMs: number;
  active: boolean;
  cartoon?: boolean;
  harmless?: boolean;
}

interface EnemyBullet {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  active: boolean;
  laser?: boolean;
  fromAbyss?: boolean;
}

interface Nest {
  id: string;
  x: number;
  y: number;
  active: boolean;
  spawnKinds: RainbowCowboyEnemyKind[];
  spawnIntervalMs: number;
  spawnTimerMs: number;
  spawnIndex: number;
}

interface WarningDef {
  triggerX: number;
  triggerY?: number;
  message: string;
  fired: boolean;
}

interface Pickup {
  id: string;
  kind: RainbowCowboyPickupKind;
  x: number;
  y: number;
  active: boolean;
}

interface FallingCrate {
  id: string;
  kind: RainbowCowboyPickupKind;
  x: number;
  y: number;
  vy: number;
  active: boolean;
}

interface Hazard {
  id: string;
  kind: RainbowCowboyHazardKind;
  x: number;
  y: number;
  active: boolean;
  timerMs?: number;
  timerMaxMs?: number;
  exploded?: boolean;
  explodeUntil?: number;
  vx?: number;
  baseY?: number;
  bobPhase?: number;
  bobAmp?: number;
  bobSpeed?: number;
  mineArmMs?: number;
  /** Creeper mine charge countdown (ms remaining). */
  chargeMs?: number;
  chargeMaxMs?: number;
  fireCooldownMs?: number;
  w?: number;
  h?: number;
}

interface SpawnDef {
  kind: RainbowCowboyEnemyKind;
  triggerX: number;
  triggerY?: number;
  y: number;
  delayMs: number;
  triggeredAt: number | null;
  spawned: boolean;
  popupOnSpawn?: string;
  finalWave?: boolean;
  fixedX?: number;
  patrolMinX?: number;
  patrolMaxX?: number;
  patrolDir?: 1 | -1;
}

function isGroundEnemy(kind: RainbowCowboyEnemyKind): boolean {
  return kind === "boom_bot" || kind === "armored_boom_bot" || kind === "grenade_goblin_bot";
}

function isBoomBot(kind: RainbowCowboyEnemyKind): boolean {
  return isGroundEnemy(kind);
}

function enemyMaxHp(kind: RainbowCowboyEnemyKind): number {
  if (kind === "armored_boom_bot") return ARMORED_BOOM_BOT_HP;
  if (kind === "grenade_goblin_bot") return GOBLIN_BOT_HP;
  if (kind === "boom_bot") return BOOM_BOT_HP;
  return 1;
}

function enemyExplosionRadius(kind: RainbowCowboyEnemyKind): number {
  return kind === "armored_boom_bot" ? ARMORED_BOOM_BOT_EXPLOSION_RADIUS : BOOM_BOT_EXPLOSION_RADIUS;
}

function groundEnemySpeed(kind: RainbowCowboyEnemyKind): number {
  if (kind === "armored_boom_bot") return ARMORED_BOOM_BOT_SPEED;
  if (kind === "grenade_goblin_bot") return GOBLIN_BOT_SPEED;
  return BOOM_BOT_SPEED;
}

let entityId = 0;
function nextId() {
  entityId += 1;
  return `e${entityId}`;
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function playerRect(x: number, y: number, ducking = false): Rect {
  if (ducking) {
    return { x: x - PLAYER_W / 2 + 6, y: y - PLAYER_H + 22, w: PLAYER_W - 12, h: PLAYER_H - 22 };
  }
  return { x: x - PLAYER_W / 2, y: y - PLAYER_H, w: PLAYER_W, h: PLAYER_H };
}

function gatorPatrolLane(baseY: number, groundY: number): "surface" | "mid" | "deep" {
  if (baseY < WATER_SURFACE_Y + 60) return "surface";
  if (baseY > groundY - 88) return "deep";
  return "mid";
}

function swimPlayerRect(x: number, y: number): Rect {
  return {
    x: x - FROGMAN_W / 2,
    y: y - PLAYER_H * 0.55,
    w: FROGMAN_W,
    h: PLAYER_H * 0.55,
  };
}

/** Hitbox for player attacks — charging gators get a forgiving pad. */
function enemyAttackHitRect(enemy: Enemy): Rect {
  if (enemy.kind === "laser_gator" && enemy.phase === "swoop") {
    return {
      x: enemy.x - GATOR_CHARGE_HIT_PAD_X,
      y: enemy.y - GATOR_CHARGE_HIT_PAD_Y,
      w: enemy.w + GATOR_CHARGE_HIT_PAD_X * 2,
      h: enemy.h + GATOR_CHARGE_HIT_PAD_Y * 2,
    };
  }
  return { x: enemy.x, y: enemy.y, w: enemy.w, h: enemy.h };
}

function quadBezier(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  t: number,
) {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

function landmineBodyRect(hazard: Hazard, groundY: number): Rect {
  const r = LANDMINE_BODY_RADIUS;
  return {
    x: hazard.x - r,
    y: groundY - r * 0.55,
    w: r * 2,
    h: r * 0.65,
  };
}

function playerOverlapsLandmine(
  playerX: number,
  playerY: number,
  prevPlayerX: number,
  groundY: number,
  hazard: Hazard,
  ducking: boolean,
): boolean {
  if (ducking) return false;

  const triggerR = LANDMINE_TRIGGER_RADIUS;
  if (playerY < groundY - LANDMINE_CLEAR_HEIGHT || playerY > groundY + 8) return false;

  const airborne = playerY < groundY - 4;
  const halfW = airborne ? LANDMINE_AIRBORNE_HALF_W : PLAYER_W / 2;
  const sweepLeft = Math.min(playerX, prevPlayerX) - halfW;
  const sweepRight = Math.max(playerX, prevPlayerX) + halfW;
  const mineLeft = hazard.x - triggerR;
  const mineRight = hazard.x + triggerR;
  return sweepLeft < mineRight && sweepRight > mineLeft;
}

export class RainbowCowboyEngine {
  config: LevelConfig;
  rideType: UnicornHeroRideType;
  phase: RainbowCowboyGamePhase = "playing";
  timeMs = 0;
  startTimeMs = 0;

  playerX = 120;
  playerY = 0;
  prevPlayerX = 120;
  playerVx = 0;
  playerVy = 0;
  grounded = false;
  lastGroundedAtMs = 0;
  jumpBufferUntil = 0;
  ducking = false;
  aimingUp = false;
  facing: "left" | "right" = "right";

  tongueTarget: { x: number; y: number } | null = null;
  tongueStartedMs = 0;

  hearts = MAX_HEARTS;
  score = 0;
  rainbowCharges = 0;
  damageTaken = 0;
  dronesEaten = 0;
  balloonsSurvived = 0;
  rainbowBlastsUsed = 0;
  balloonsSpawned = 0;
  redBaronsDestroyed = 0;
  nestsDestroyed = 0;
  bombsDodged = 0;

  gassedUntil = 0;
  rampageUntil = 0;
  speedBoostUntil = 0;
  invincibleUntil = 0;
  hitFlashUntil = 0;
  knockbackVx = 0;

  tongueUntil = 0;
  tongueCooldownUntil = 0;
  hasPistol = false;
  activeWeapon: WeaponKind = "pistol";
  machineGunUntil = 0;
  machineGunAmmo = 0;
  bazookaAmmo = 0;
  gunCooldownUntil = 0;
  lastGunFireMs = 0;
  lastGunWeapon: WeaponKind | null = null;
  activeSwimWeapon: SwimWeaponKind = "spear";
  sonicCharges = 0;

  blasterProjectiles: BlasterProjectile[] = [];
  sonicWaves: SonicWave[] = [];
  hostileSonicBursts: HostileSonicBurst[] = [];
  enemyBullets: EnemyBullet[] = [];
  finalWaveSurvived = false;
  finalWaveTriggered = false;
  finalWaveSpawns: SpawnDef[] = [];
  rampageWaveTriggered = false;
  rampageWaveSpawns: SpawnDef[] = [];
  extractionBlockedPopupUntil = 0;

  popupText: string | null = null;
  popupUntil = 0;
  status = "Riding!";
  deathCause: string | undefined;

  rainbowBlastUntil = 0;
  cameraX = 0;
  cameraY = 0;

  enemies: Enemy[] = [];
  pickups: Pickup[] = [];
  hazards: Hazard[] = [];
  spawns: SpawnDef[] = [];
  bombs: Bomb[] = [];
  nests: Nest[] = [];
  warnings: WarningDef[] = [];

  extractionReached = false;
  levelCompleteHold = 0;
  finaleShakeMag = 0;
  finaleRedFlash = 0;
  cameraShakeX = 0;
  cameraShakeY = 0;
  bossVictoryEpilogueComplete = false;
  landmineExplosionEvents: { x: number; groundY: number }[] = [];
  audioEvents: UnicornHeroAudioEvent[] = [];

  hiveBoss: HiveBossController | null = null;
  abyssBoss: AbyssBossController | null = null;
  arenaLocked = false;
  hiveBossHitCooldownUntil = 0;
  abyssBossHitCooldownUntil = 0;
  abyssFallDamageTimer = 0;
  abyssTentacleDamageUntil = 0;
  fallingCrates: FallingCrate[] = [];

  constructor(config: LevelConfig, rideType: UnicornHeroRideType = "eod_robot") {
    this.config = config;
    this.rideType = rideType;
    if (config.scrollAxis === "vertical") {
      this.playerX = ABYSS_PLAYER_LANE_X;
      this.playerY = ABYSS_PLAYER_SPAWN_Y;
      this.cameraY = ABYSS_PLAYER_SPAWN_Y - VIEW_H * 0.32;
    } else if (config.playMode === "swim") {
      this.playerY = 300;
    } else {
      this.playerY = config.level.groundY;
    }
    this.initLevel();
  }

  private isSwimLevel(): boolean {
    return this.config.playMode === "swim";
  }

  private isVerticalScroll(): boolean {
    return this.config.scrollAxis === "vertical";
  }

  private isAbyssLevel(): boolean {
    return this.config.level.id === "level-8" || this.config.bossKind === "abyss";
  }

  private initLevel() {
    entityId = 0;
    this.pickups = this.config.pickups.map((p) => ({
      id: nextId(),
      kind: p.kind,
      x: p.x,
      y: p.y,
      active: true,
    }));

    this.hazards = this.config.hazards.map((h) => {
      const hazard: Hazard = {
        id: nextId(),
        kind: h.kind,
        x: h.x,
        y: h.y,
        active: true,
      };
      if (h.kind === "dynamite") {
        const sec = h.timerSeconds ?? 5;
        hazard.timerMaxMs = sec * 1000;
        hazard.timerMs = sec * 1000;
      }
      if (h.kind === "trash_balloon") {
        const groundY = this.config.level.groundY;
        const minY = groundY - BALLOON_ALTITUDE.maxAboveGround;
        const maxY = groundY - BALLOON_ALTITUDE.minAboveGround;
        const altitude = minY + Math.random() * (maxY - minY);
        hazard.baseY = altitude;
        hazard.y = altitude;
        hazard.vx = -(0.55 + Math.random() * 0.85);
        hazard.bobPhase = Math.random() * Math.PI * 2;
        hazard.bobAmp = 10 + Math.random() * 22;
        this.balloonsSpawned += 1;
      }
      if (h.kind === "sea_mine_floating" || h.kind === "sea_mine_tethered") {
        hazard.baseY = h.y;
        hazard.bobPhase = Math.random() * Math.PI * 2;
        hazard.bobAmp =
          SEA_MINE_BOB_AMP_MIN + Math.random() * (SEA_MINE_BOB_AMP_MAX - SEA_MINE_BOB_AMP_MIN);
        hazard.bobSpeed = 0.016 + Math.random() * 0.048;
      }
      if (h.kind === "creeper_mine") {
        if (this.isVerticalScroll()) {
          hazard.y = h.y;
          hazard.vx = 0;
        } else {
          const groundY = this.config.level.groundY;
          hazard.y = groundY - CREEPER_MINE_H / 2 - 4;
          hazard.vx = -(CREEPER_MINE_SPEED + Math.random() * 0.25);
        }
        hazard.fireCooldownMs = 400 + Math.random() * 800;
      }
      if (h.kind === "floating_log") {
        const spawn = h as { logW?: number; logH?: number; logVx?: number };
        hazard.w = spawn.logW ?? FLOATING_LOG_W;
        hazard.h = spawn.logH ?? FLOATING_LOG_H;
        hazard.vx = spawn.logVx ?? -(1.0 + Math.random() * 0.45);
        hazard.baseY = h.y;
        hazard.bobPhase = Math.random() * Math.PI * 2;
        hazard.bobAmp = 3 + Math.random() * 4;
      }
      return hazard;
    });

    this.spawns = this.config.enemies.map((e) => ({
      kind: e.kind,
      triggerX: e.triggerX,
      triggerY: e.triggerY,
      y: e.y,
      delayMs: e.delayMs ?? 0,
      triggeredAt: null,
      spawned: false,
      popupOnSpawn: e.popupOnSpawn,
      fixedX: e.fixedX,
      patrolMinX: e.patrolMinX,
      patrolMaxX: e.patrolMaxX,
      patrolDir: e.patrolDir,
    }));

    this.nests = (this.config.nests ?? []).map((n) => ({
      id: nextId(),
      x: n.x,
      y: n.y,
      active: true,
      spawnKinds: n.spawnKinds ?? ["recon", "quad"],
      spawnIntervalMs: n.spawnIntervalMs ?? NEST_DEFAULT_SPAWN_MS,
      spawnTimerMs: (n.spawnIntervalMs ?? NEST_DEFAULT_SPAWN_MS) * 0.5,
      spawnIndex: 0,
    }));

    this.warnings = (this.config.warnings ?? []).map((w) => ({
      triggerX: w.triggerX,
      triggerY: w.triggerY,
      message: w.message,
      fired: false,
    }));

    this.enemies = [];
    this.bombs = [];
    this.blasterProjectiles = [];
    this.enemyBullets = [];
    this.finalWaveSurvived = false;
    this.finalWaveTriggered = false;
    this.finalWaveSpawns = (this.config.finalWave?.enemies ?? []).map((e) => ({
      kind: e.kind,
      triggerX: 0,
      y: e.y,
      delayMs: e.delayMs ?? 0,
      triggeredAt: null,
      spawned: false,
      popupOnSpawn: e.popupOnSpawn,
      finalWave: true,
    }));
    this.rampageWaveTriggered = false;
    this.rampageWaveSpawns = (this.config.rampageWave?.enemies ?? []).map((e) => ({
      kind: e.kind,
      triggerX: 0,
      y: e.y,
      delayMs: e.delayMs ?? 0,
      triggeredAt: null,
      spawned: false,
      popupOnSpawn: e.popupOnSpawn,
    }));
    this.extractionBlockedPopupUntil = 0;
    this.hasPistol = false;
    this.activeWeapon = "pistol";
    this.machineGunUntil = 0;
    this.machineGunAmmo = 0;
    this.bazookaAmmo = 0;
    if (this.isSwimLevel()) {
      this.activeSwimWeapon = "spear";
      this.sonicCharges = 0;
      this.sonicWaves = [];
      this.hostileSonicBursts = [];
      this.activeWeapon = "spear";
      this.status = "Swimming!";
    } else {
      this.hasPistol = this.weaponsEnabled();
      this.activeWeapon = "pistol";
    }
    this.gunCooldownUntil = 0;
    this.lastGunFireMs = 0;
    this.lastGunWeapon = null;
    this.landmineExplosionEvents = [];
    this.prevPlayerX = this.playerX;
    this.startTimeMs = performance.now();
    this.arenaLocked = false;
    this.hiveBossHitCooldownUntil = 0;
    this.abyssBossHitCooldownUntil = 0;
    this.abyssTentacleDamageUntil = 0;
    this.abyssFallDamageTimer = 0;
    this.fallingCrates = [];

    if (this.config.bossArena && this.config.bossKind !== "abyss") {
      this.hiveBoss = new HiveBossController(
        this.config.bossArena,
        {
          spawnEnemy: (kind, x, y) => this.spawnBossEnemy(kind, x, y),
          addScore: (points) => this.addScore(points),
          showPopup: (text, ms) => this.showPopup(text, ms),
          onDefeated: () => this.onHiveBossDefeated(),
          spawnCrate: (x, y, kind) => this.spawnBossCrate(x, y, kind),
          fireBullet: (x, y, vx, vy) => this.spawnBossBullet(x, y, vx, vy),
          spewGrenade: (x, y, vx, vy, bounces) => this.spawnBossGrenade(x, y, vx, vy, bounces),
          spawnFinaleGrenade: (x, y, vx, vy) => this.spawnFinaleGrenade(x, y, vx, vy),
          spawnFinaleDrone: (kind, x, y, vx, vy) => this.spawnFinaleDrone(kind, x, y, vx, vy),
          pulseFinaleFx: (shakeMag, redAlpha) => this.pulseFinaleFx(shakeMag, redAlpha),
          clearFinaleChaos: () => this.clearFinaleChaos(),
          getCompleteBanner: () => this.config.completeBanner ?? "FOB THUNDER SECURED",
          getPlayerX: () => this.playerX,
          getPlayerY: () => this.playerY,
          getTimeMs: () => this.timeMs,
          damagePlayer: (amount, cause, knockback) => this.damagePlayer(amount, cause, knockback),
        },
        getBossPressureMult(this.config.difficulty ?? "easy"),
      );
      if (this.config.bossArena.immediate) {
        this.arenaLocked = true;
        this.playerX = 140;
        this.hiveBoss.enterArena(this.config.level.groundY);
      }
    } else {
      this.hiveBoss = null;
    }

    if (this.isAbyssLevel()) {
      this.abyssBoss = new AbyssBossController(
        {
          spawnEnemy: (kind, x, y) => this.spawnBossEnemy(kind, x, y),
          addScore: (points) => this.addScore(points),
          showPopup: (text, ms) => this.showPopup(text, ms),
          onDefeated: () => this.onAbyssBossDefeated(),
          fireBullet: (x, y, vx, vy, laser) => this.spawnAbyssBullet(x, y, vx, vy, laser),
          spawnInk: (x, y) => this.abyssBoss?.addInkCloud(x, y),
          spawnSeaMine: (x, y, tethered) => this.spawnAbyssSeaMine(x, y, tethered),
          countActiveSeaMines: () => this.countActiveSeaMines(),
          damagePlayer: (amount, cause) => this.damagePlayer(amount, cause, 0),
          getTimeMs: () => this.timeMs,
          getPlayer: () => ({ x: this.playerX, y: this.playerY }),
          getCameraY: () => this.cameraY,
          pulseFx: (shakeMag, redAlpha) => this.pulseFinaleFx(shakeMag, redAlpha),
          getCompleteBanner: () => this.config.completeBanner ?? "CAMP POSEIDON SECURED",
        },
        { eyeMinePressureMult: getAbyssEyeMinePressureMult(this.config.difficulty ?? "easy") },
      );
    } else {
      this.abyssBoss = null;
    }

    if (this.isAbyssLevel()) {
      this.sonicCharges = 2;
      this.activeSwimWeapon = "spear";
      this.showPopup("DESCEND — FIND THE ABYSS TO STARBOARD", 2800);
    }
  }

  get scoreMultiplier(): number {
    return this.timeMs < this.rampageUntil ? 2 : 1;
  }

  get isRampage(): boolean {
    return this.timeMs < this.rampageUntil;
  }

  get isBlasterActive(): boolean {
    return this.hasPistol || this.isMachineGunActive || this.bazookaAmmo > 0;
  }

  get isMachineGunActive(): boolean {
    if (this.isHiveBossLevel()) return this.machineGunAmmo > 0;
    return this.timeMs < this.machineGunUntil;
  }

  get activeTimedWeapon(): WeaponKind | null {
    if (this.activeWeapon === "machine_gun" && this.isMachineGunActive) return "machine_gun";
    return null;
  }

  private syncActiveWeapon() {
    if (!this.weaponsEnabled()) return;
    if (this.isHiveBossLevel()) {
      if (this.activeWeapon === "machine_gun" && this.machineGunAmmo <= 0) {
        this.activeWeapon = "pistol";
      }
    } else if (this.activeWeapon === "machine_gun" && !this.isMachineGunActive) {
      this.activeWeapon = "pistol";
    }
    if (this.activeWeapon === "bazooka" && this.bazookaAmmo <= 0) {
      this.activeWeapon = "pistol";
    }
  }

  private weaponsEnabled(): boolean {
    return levelHasWeaponControls(this.config);
  }

  private isBossLevel(): boolean {
    return this.config.level.isBossLevel === true;
  }

  private isHiveBossLevel(): boolean {
    return this.config.level.id === "level-4";
  }

  private difficultySpeed(): number {
    const sm = this.config.difficultySpeedMult ?? 1;
    if (this.isHiveBossLevel() && this.hiveBoss?.active && !this.hiveBoss.defeated) {
      let bossSm = sm * HIVE_BOSS_PRESSURE_MULT;
      if (this.hiveBoss.phase >= 3) {
        bossSm *= PHASE_3_PLUS_EASE_MULT;
      }
      return bossSm;
    }
    return sm;
  }

  get isGassed(): boolean {
    return this.timeMs < this.gassedUntil;
  }

  get isInvincible(): boolean {
    return this.timeMs < this.invincibleUntil || this.isRampage;
  }

  get isDucking(): boolean {
    return this.ducking;
  }

  private mouthPos() {
    const dir = this.facing === "right" ? 1 : -1;
    return {
      x: this.playerX + dir * (PLAYER_W * 0.35),
      y: this.playerY - PLAYER_H * (this.ducking ? 0.48 : 0.55),
    };
  }

  private tongueProgress(): number {
    if (this.timeMs >= this.tongueUntil) return 0;
    const elapsed = this.timeMs - this.tongueStartedMs;
    const t = Math.min(1, elapsed / TONGUE_DURATION_MS);
    return 1 - Math.pow(1 - t, 2.2);
  }

  private tongueCurve() {
    const mouth = this.mouthPos();
    const dir = this.facing === "right" ? 1 : -1;
    const progress = this.tongueProgress();
    const target = this.tongueTarget;
    const end = target
      ? {
          x: mouth.x + (target.x - mouth.x) * progress,
          y: mouth.y + (target.y - mouth.y) * progress,
        }
      : {
          x: mouth.x + dir * TONGUE_LENGTH * progress,
          y: mouth.y + Math.sin(progress * Math.PI) * -12,
        };

    const midX = (mouth.x + end.x) / 2;
    const midY = (mouth.y + end.y) / 2;
    const curvePull = target ? 0.55 : 0.25;
    const control = {
      x: midX + (target ? (target.x - mouth.x) * 0.12 * curvePull : dir * 18),
      y: midY - 22 * curvePull - (target ? Math.abs(target.y - mouth.y) * 0.08 : 0),
    };

    const tip = quadBezier(mouth, control, end, Math.min(1, progress * 1.05));
    return { mouth, control, end, tip, progress };
  }

  private findTongueTarget(): { x: number; y: number } | null {
    const mouth = this.mouthPos();
    const dir = this.facing === "right" ? 1 : -1;
    let bestDist = Infinity;
    let bestX = 0;
    let bestY = 0;
    let found = false;

    const consider = (x: number, y: number) => {
      const dx = x - mouth.x;
      const dy = y - mouth.y;
      if (dir > 0 && dx < -12) return;
      if (dir < 0 && dx > 12) return;
      const dist = Math.hypot(dx, dy);
      if (dist > TONGUE_HOMING_RANGE) return;
      let score = dist;
      if (this.aimingUp) {
        if (dy < -10) score *= 0.7;
        else if (dy > 12) score *= 1.35;
      }
      if (score < bestDist) {
        bestDist = score;
        bestX = x;
        bestY = y;
        found = true;
      }
    };

    for (const enemy of this.enemies) {
      if (!enemy.active) continue;
      if (isBoomBot(enemy.kind)) continue;
      consider(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2);
    }

    for (const pickup of this.pickups) {
      if (!pickup.active) continue;
      consider(pickup.x, pickup.y - PICKUP_SIZE / 2);
    }

    for (const hazard of this.hazards) {
      if (!hazard.active || hazard.kind !== "trash_balloon") continue;
      consider(hazard.x, hazard.y - BALLOON_SIZE.h / 2);
    }

    for (const nest of this.nests) {
      if (!nest.active) continue;
      consider(nest.x, nest.y - NEST_H / 2);
    }

    return found ? { x: bestX, y: bestY } : null;
  }

  private showPopup(text: string, durationMs = 1400) {
    this.popupText = text;
    this.popupUntil = this.timeMs + durationMs;
  }

  private emitAudio(event: UnicornHeroAudioEvent) {
    this.audioEvents.push(event);
  }

  private addScore(base: number) {
    this.score += Math.round(base * this.scoreMultiplier);
  }

  private damagePlayer(amount: number, cause: string, knockX = 0) {
    if (this.isInvincible) return;
    if (this.timeMs < this.hitFlashUntil) return;

    this.hearts = Math.max(0, this.hearts - amount);
    this.damageTaken += amount;
    this.hitFlashUntil = this.timeMs + INVINCIBLE_FLASH_MS;
    this.knockbackVx = knockX;
    this.status = "Ouch!";
    this.deathCause = cause;

    if (this.hearts <= 0) {
      this.phase = "game_over";
      this.status = "Game Over";
      this.emitAudio({ type: "death" });
    } else {
      this.emitAudio({ type: "damage" });
    }
  }

  private applyGas(source: string) {
    this.gassedUntil = this.timeMs + GASSED_DURATION_MS;
    this.emitAudio({ type: "trash_balloon_gas" });
    this.damagePlayer(1, source, -3);
    this.showPopup(getRideBadAttackPopup(this.rideType), 1200);
    this.status = "Gassed!";
  }

  tick(dtMs: number, input: GameInput) {
    if (this.phase === "complete" || this.phase === "game_over") return;

    if (input.pausePressed && this.phase === "playing") {
      this.phase = "paused";
      return;
    }
    if (this.phase === "paused") {
      if (input.pausePressed) this.phase = "playing";
      return;
    }

    this.timeMs += dtMs;
    const dt = dtMs / 16.67;

    if (this.extractionReached) {
      this.levelCompleteHold += dtMs;
      this.playerVx *= 0.9;
      this.status = this.config.completeBanner ?? "Extraction!";
      if (this.levelCompleteHold > 1800) {
        this.phase = "complete";
        this.emitAudio({ type: "level_complete" });
      }
      this.decayFinaleFx();
      if (this.isSwimLevel()) this.updateSwimPhysics(dt);
      else this.updatePhysics(dt);
      this.updateCamera();
      return;
    }

    this.decayFinaleFx();

    this.processSpawns();
    this.processFinalWave();
    this.processRampageWave();
    this.processWarnings();
    this.checkBossArenaEntry();
    this.handleInput(input);
    if (this.isSwimLevel()) {
      this.updateSwimPhysics(dt);
    } else {
      this.updatePhysics(dt);
    }
    this.updateEnemies(dt, dtMs);
    if (this.hiveBoss?.active) {
      this.hiveBoss.tick(dtMs);
    }
    if (this.abyssBoss?.active) {
      this.abyssBoss.tick(dtMs, this.playerY);
      if (this.abyssBoss.isArenaLocked() && !this.arenaLocked) {
        this.arenaLocked = true;
        this.cameraY = ABYSS_ARENA_Y - 60;
        this.playerY = ABYSS_ARENA_Y - 28;
        this.playerX = ABYSS_PLAYER_LANE_X;
        for (const enemy of this.enemies) {
          if (enemy.active) enemy.active = false;
        }
      }
      this.checkAbyssFallDamage(dtMs);
      this.checkAbyssTentacleDamage();
      this.checkAbyssInkDamage();
    }
    this.tickFallingCrates(dt);
    this.updateBlasterProjectiles(dt);
    this.updateSonicWaves(dt);
    this.updateHostileSonicBursts(dt);
    this.updateEnemyBullets(dt);
    this.updateBombs(dt);
    this.updateNests(dtMs);
    this.updateHazards(dt);
    this.updateTongue();
    this.checkCollisions();
    this.checkExtraction();
    this.updateCamera();
    this.updateStatus();
    this.prevPlayerX = this.playerX;
  }

  private updateStatus() {
    this.syncActiveWeapon();
    if (this.timeMs < this.popupUntil && this.popupText) return;
    if (this.isSwimLevel()) {
      if (this.isRampage) this.status = "RAINBOW RAMPAGE";
      else if (this.abyssBoss?.active && !this.abyssBoss.defeated) {
        const st = this.abyssBoss.getState();
        if (!st.engaged) {
          if (st.revealProgress > 0.35) {
            this.status = "THE ABYSS RISES…";
          } else if (st.revealProgress > 0) {
            this.status = "TENTACLES BELOW…";
          } else {
            this.status = "DESCEND — THE ABYSS LURKS TO STARBOARD";
          }
        } else if (st.mode === "ascent") {
          this.status = st.bodyVulnerable
            ? `THE ABYSS · CORE EXPOSED — SPEAR IT`
            : `THE ABYSS · Section ${st.sectionIndex} · SPEAR TENTACLES`;
        } else {
          this.status = st.bodyVulnerable
            ? `THE ABYSS · Phase ${st.phase} · HIT THE EYE`
            : `THE ABYSS · SPEAR TENTACLE JOINTS (${st.tentaclesDestroyed}/${ABYSS_TENTACLE_COUNT})`;
        }
      } else if (this.timeMs < this.tongueUntil || this.timeMs < this.gunCooldownUntil + 80) {
        this.status =
          this.activeSwimWeapon === "sonic" ? "Sonic blast!" : "Spear fired!";
      } else this.status = "Swimming!";
      return;
    }
    if (this.hiveBoss?.active && !this.hiveBoss.defeated) {
      this.status = `THE HIVE · Phase ${this.hiveBoss.getState().phase}${
        this.hiveBoss.getState().vulnerable ? " · HATCH OPEN" : ""
      }`;
      return;
    }
    if (this.isRampage) this.status = "RAINBOW RAMPAGE";
    else if (this.isGassed) this.status = "Gassed…";
    else if (this.ducking && this.grounded) this.status = "Ducking";
    else if (this.timeMs < this.tongueUntil) this.status = getRideStatusAttack(this.rideType);
    else if (this.activeWeapon === "machine_gun" && this.isMachineGunActive) this.status = "MG SPRAY";
    else if (this.activeWeapon === "bazooka" && this.bazookaAmmo > 0)
      this.status = `BAZOOKA x${this.bazookaAmmo}`;
    else if (this.hasPistol) this.status = "PISTOL READY";
    else if (this.grounded) this.status = getRideStatusRiding(this.rideType);
    else this.status = "Airborne";
  }

  private spawnBossEnemy(kind: RainbowCowboyEnemyKind, x: number, y: number) {
    const enemy = this.createEnemyFromSpawn({ kind, y }, x);
    this.enemies.push(enemy);
  }

  private spawnHiveTurretBullet(x: number, y: number, vx: number, vy: number) {
    this.enemyBullets.push({
      id: nextId(),
      x,
      y,
      vx,
      vy,
      active: true,
    });
  }

  private spawnBossCrate(x: number, y: number, forcedKind?: RainbowCowboyPickupKind) {
    const kind = forcedKind ?? "range_beer";
    this.fallingCrates.push({
      id: nextId(),
      kind,
      x,
      y,
      vy: 1.55,
      active: true,
    });
  }

  private tickFallingCrates(dt: number) {
    const groundY = this.config.level.groundY;
    const pr = playerRect(this.playerX, this.playerY, this.ducking);
    for (const crate of this.fallingCrates) {
      if (!crate.active) continue;
      crate.y += crate.vy * dt;
      const cr = {
        x: crate.x - PICKUP_SIZE / 2,
        y: crate.y - PICKUP_SIZE,
        w: PICKUP_SIZE,
        h: PICKUP_SIZE,
      };
      if (rectsOverlap(pr, cr)) {
        crate.active = false;
        this.collectPickup({ id: crate.id, kind: crate.kind, x: crate.x, y: crate.y, active: true });
        continue;
      }
      if (crate.y >= groundY - 10) crate.active = false;
    }
    this.fallingCrates = this.fallingCrates.filter((c) => c.active);
  }

  private checkBossArenaEntry() {
    if (!this.hiveBoss || this.arenaLocked) return;
    const triggerX = this.config.bossArena?.triggerX;
    if (triggerX == null || this.playerX < triggerX) return;
    this.arenaLocked = true;
    this.hiveBoss.enterArena(this.config.level.groundY);
  }

  private onAbyssBossDefeated() {
    for (const enemy of this.enemies) {
      if (enemy.active && !enemy.cosmetic) enemy.active = false;
    }
    this.clearFinaleChaos();
    this.bossVictoryEpilogueComplete = true;
    this.extractionReached = true;
    this.levelCompleteHold = 0;
    this.playerVx = 0;
    this.playerVy = 0;
  }

  private spawnAbyssBullet(x: number, y: number, vx: number, vy: number, laser?: boolean) {
    this.enemyBullets.push({
      id: nextId(),
      x,
      y,
      vx,
      vy,
      active: true,
      laser: laser === true,
      fromAbyss: true,
    });
  }

  private countActiveSeaMines(): number {
    return this.hazards.filter((h) => h.active && this.isSeaMine(h.kind)).length;
  }

  private spawnAbyssSeaMine(x: number, y: number, tethered?: boolean) {
    const kind = tethered ? "sea_mine_tethered" : "sea_mine_floating";
    this.hazards.push({
      id: nextId(),
      kind,
      x,
      y,
      active: true,
      baseY: y,
      bobPhase: Math.random() * Math.PI * 2,
      bobAmp: SEA_MINE_BOB_AMP_MIN + Math.random() * (SEA_MINE_BOB_AMP_MAX - SEA_MINE_BOB_AMP_MIN),
      bobSpeed: 0.016 + Math.random() * 0.048,
    });
  }

  private checkAbyssFallDamage(dtMs: number) {
    if (!this.abyssBoss || this.abyssBoss.isArenaLocked() || !this.abyssBoss.engaged) return;
    if (!this.abyssBoss.isCombatActive()) return;
    if (!this.abyssBoss.shouldApplyFallDamage()) return;
    const lag = this.playerY - (this.cameraY + ABYSS_FALL_DAMAGE_THRESHOLD);
    if (lag > 0) {
      this.abyssFallDamageTimer += dtMs;
      if (this.abyssFallDamageTimer >= ABYSS_FALL_DAMAGE_INTERVAL_MS) {
        this.abyssFallDamageTimer = 0;
        this.damagePlayer(1, "Falling behind The Abyss", 0);
        this.showPopup("TOO SLOW!", 700);
      }
    } else {
      this.abyssFallDamageTimer = 0;
    }
  }

  private checkAbyssTentacleDamage() {
    if (!this.abyssBoss || this.abyssBoss.defeated || !this.abyssBoss.engaged) return;
    if (this.isInvincible || this.isRampage || this.timeMs < this.hitFlashUntil) return;
    if (this.timeMs < this.abyssTentacleDamageUntil) return;
    const pr = swimPlayerRect(this.playerX, this.playerY);
    const arena = this.abyssBoss.isArenaLocked();
    const rects = arena
      ? this.abyssBoss.getArenaTentacleHazards()
      : this.abyssBoss.getAscentTentacleHazards(this.cameraY);
    for (const r of rects) {
      const hr = { x: r.x, y: r.y, w: r.w, h: r.h };
      if (rectsOverlap(pr, hr)) {
        this.abyssTentacleDamageUntil = this.timeMs + 1000;
        this.damagePlayer(1, "Tentacle strike", r.x < this.playerX ? 5 : -5);
        this.showPopup("TENTACLE!", 600);
        return;
      }
    }
  }

  private checkAbyssInkDamage() {
    if (!this.abyssBoss || !this.abyssBoss.isArenaLocked()) return;
    const st = this.abyssBoss.getState();
    const pr = swimPlayerRect(this.playerX, this.playerY);
    for (const cloud of st.inkClouds) {
      const dx = this.playerX - cloud.x;
      const dy = this.playerY - cloud.y;
      if (Math.hypot(dx, dy) < cloud.r && !this.isInvincible && this.timeMs >= this.hitFlashUntil) {
        this.damagePlayer(1, "Ink cloud", 0);
        return;
      }
    }
  }

  private onHiveBossDefeated() {
    for (const enemy of this.enemies) {
      if (enemy.active && !enemy.cosmetic) enemy.active = false;
    }
    this.clearFinaleChaos();
    this.bossVictoryEpilogueComplete = true;
    this.extractionReached = true;
    this.levelCompleteHold = 0;
    this.playerVx = 0;
  }

  private clearFinaleChaos() {
    for (const bomb of this.bombs) {
      if (bomb.harmless) bomb.active = false;
    }
    for (const enemy of this.enemies) {
      if (enemy.cosmetic) enemy.active = false;
    }
    this.finaleShakeMag = 0;
    this.finaleRedFlash = 0;
  }

  private pulseFinaleFx(shakeMag: number, redAlpha: number) {
    this.finaleShakeMag = Math.max(this.finaleShakeMag, shakeMag);
    this.finaleRedFlash = Math.max(this.finaleRedFlash, redAlpha);
  }

  private decayFinaleFx() {
    this.finaleShakeMag *= 0.9;
    if (this.finaleShakeMag < 0.25) this.finaleShakeMag = 0;
    this.finaleRedFlash *= 0.92;
    if (this.finaleRedFlash < 0.03) this.finaleRedFlash = 0;
  }

  private spawnFinaleGrenade(x: number, y: number, vx: number, vy: number) {
    this.bombs.push({
      id: nextId(),
      x,
      y,
      vy,
      vx,
      bounces: Math.random() > 0.45 ? 1 : 0,
      grounded: false,
      fuseMs: 350 + Math.random() * 900,
      active: true,
      cartoon: true,
      harmless: true,
    });
    this.emitAudio({ type: "tongue" });
  }

  private spawnFinaleDrone(
    kind: RainbowCowboyEnemyKind,
    x: number,
    y: number,
    vx: number,
    vy: number,
  ) {
    const enemy = this.createEnemyFromSpawn({ kind, y }, x);
    enemy.cosmetic = true;
    enemy.groundUnit = false;
    enemy.phase = "patrol";
    enemy.vx = vx;
    enemy.vy = vy;
    enemy.y = y;
    enemy.baseY = y;
    enemy.cosmeticFuseMs = 550 + Math.random() * 1500;
    this.enemies.push(enemy);
  }

  private damageHiveBoss(baseAmount: number, bypassCooldown = false) {
    if (!this.hiveBoss?.active || this.hiveBoss.defeated || this.hiveBoss.collapsing) return;
    if (!bypassCooldown && this.timeMs < this.hiveBossHitCooldownUntil) return;
    this.hiveBossHitCooldownUntil = this.timeMs + 75;
    const mult = this.hiveBoss.isVulnerable() ? 1 : HIVE_CLOSED_DAMAGE_MULT;
    this.hiveBoss.damage(baseAmount * mult);
  }

  private hiveGunDamage(weapon: WeaponKind): number {
    if (weapon === "bazooka") return HIVE_BAZOOKA_DAMAGE;
    if (weapon === "machine_gun") return HIVE_MG_DAMAGE;
    return HIVE_PISTOL_DAMAGE;
  }

  private cycleBossWeapon() {
    const options: WeaponKind[] = ["pistol"];
    if (this.machineGunAmmo > 0) options.push("machine_gun");
    if (this.bazookaAmmo > 0) options.push("bazooka");
    if (options.length <= 1) return;
    const idx = options.indexOf(this.activeWeapon);
    this.activeWeapon = options[(idx + 1) % options.length];
    this.showPopup(`WEAPON: ${this.activeWeapon.replace("_", " ").toUpperCase()}`, 700);
  }

  private processWarnings() {
    for (const w of this.warnings) {
      if (w.fired) continue;
      const triggered = this.isVerticalScroll()
        ? w.triggerY != null && this.playerY <= w.triggerY
        : this.playerX >= w.triggerX;
      if (triggered) {
        w.fired = true;
        this.showPopup(w.message, 1800);
      }
    }
  }

  private createEnemyFromSpawn(
    spawn: Pick<SpawnDef, "kind" | "y" | "popupOnSpawn" | "patrolMinX" | "patrolMaxX" | "patrolDir">,
    spawnX: number,
  ): Enemy {
    const groundY = this.config.level.groundY;
    const size = ENEMY_SIZES[spawn.kind];
    const ground = isGroundEnemy(spawn.kind);
    const shark = spawn.kind === "laser_shark";
    const gator = spawn.kind === "laser_gator";
    const enemy: Enemy = {
      id: nextId(),
      kind: spawn.kind,
      x: spawnX,
      y: ground ? groundY - size.h : spawn.y,
      baseY: ground ? groundY - size.h : spawn.y,
      w: size.w,
      h: size.h,
      vx: gator
        ? (spawn.patrolDir ?? 1) * ENEMY_SPEEDS.laser_gator
        : shark
          ? ENEMY_SPEEDS.laser_shark
          : ground
            ? 0
            : ENEMY_SPEEDS[spawn.kind as keyof typeof ENEMY_SPEEDS],
      active: true,
      bobPhase: Math.random() * 6,
      phase: "patrol",
      homingSince: 0,
      groundUnit: ground,
    };

    if (shark) {
      enemy.shootCooldownMs = 900 + Math.random() * 700;
    }

    if (gator) {
      if (spawn.patrolMinX != null) enemy.patrolMinX = spawn.patrolMinX;
      if (spawn.patrolMaxX != null) enemy.patrolMaxX = spawn.patrolMaxX;
    }

    if (ground) {
      const hp = enemyMaxHp(spawn.kind);
      enemy.hp = hp;
      enemy.maxHp = hp;
      enemy.beepPhase = Math.random() * Math.PI * 2;
      if (spawn.kind === "grenade_goblin_bot") {
        enemy.throwCooldownMs = GOBLIN_THROW_INTERVAL_MS * 0.4;
      }
      if (spawn.kind === "armored_boom_bot") {
        enemy.turretAngle = this.playerX >= spawnX ? 0 : Math.PI;
        enemy.shootCooldownMs = TURRET_TRUCK_SHOOT_INTERVAL_MS * 0.6;
      }
    }

    if (spawn.kind === "red_baron") {
      enemy.bombCooldownMs = RED_BARON_BOMB_INTERVAL_MS;
    }

    if (spawn.popupOnSpawn) {
      this.showPopup(spawn.popupOnSpawn, 1600);
    }

    return enemy;
  }

  private processSpawns() {
    for (const spawn of this.spawns) {
      if (spawn.spawned) continue;
      const triggered = this.isVerticalScroll()
        ? spawn.triggerY != null
          ? this.playerY <= spawn.triggerY
          : true
        : this.playerX >= spawn.triggerX;
      if (!triggered) continue;
      if (spawn.triggeredAt == null) spawn.triggeredAt = this.timeMs;
      if (this.timeMs - spawn.triggeredAt < spawn.delayMs) continue;
      spawn.spawned = true;
      const spawnX =
        spawn.kind === "laser_shark" || spawn.kind === "laser_gator"
          ? spawn.fixedX != null
            ? spawn.fixedX
            : this.isVerticalScroll()
              ? 80 + Math.random() * (VIEW_W - 160)
              : this.playerX + VIEW_W * 0.72 + Math.random() * 60
          : spawn.fixedX != null
            ? spawn.fixedX
            : isGroundEnemy(spawn.kind)
              ? this.playerX + VIEW_W * 0.58
              : this.playerX + VIEW_W * 0.65;
      const enemy = this.createEnemyFromSpawn(spawn, spawnX);
      if (spawn.patrolMinX != null) enemy.patrolMinX = spawn.patrolMinX;
      if (spawn.patrolMaxX != null) enemy.patrolMaxX = spawn.patrolMaxX;
      if (spawn.patrolDir != null && spawn.kind === "laser_gator") {
        enemy.vx = spawn.patrolDir * ENEMY_SPEEDS.laser_gator;
      }
      this.enemies.push(enemy);
    }
  }

  private spawnFinalWaveEnemy(spawn: SpawnDef) {
    const spawnX = isGroundEnemy(spawn.kind)
      ? this.playerX + VIEW_W * 0.52 + spawn.delayMs * 0.02
      : this.playerX + VIEW_W * 0.6;
    const enemy = this.createEnemyFromSpawn(spawn, spawnX);
    enemy.fromFinalWave = true;
    this.enemies.push(enemy);
  }

  private spawnRampageWaveEnemy(spawn: SpawnDef) {
    const spawnX =
      spawn.kind === "laser_shark" || spawn.kind === "laser_gator"
        ? this.playerX + VIEW_W * 0.68 + Math.random() * 100
        : this.playerX + VIEW_W * 0.6;
    this.enemies.push(this.createEnemyFromSpawn(spawn, spawnX));
  }

  private triggerRampageWave() {
    const wave = this.config.rampageWave;
    if (!wave || this.rampageWaveTriggered) return;
    this.rampageWaveTriggered = true;
    const now = this.timeMs;
    for (const spawn of this.rampageWaveSpawns) {
      spawn.triggeredAt = now;
    }
    this.showPopup(wave.message ?? "SHARK SWARM!", 2200);
  }

  private processRampageWave() {
    if (!this.rampageWaveTriggered) return;

    for (const spawn of this.rampageWaveSpawns) {
      if (spawn.spawned) continue;
      if (spawn.triggeredAt == null) spawn.triggeredAt = this.timeMs;
      if (this.timeMs - spawn.triggeredAt < spawn.delayMs) continue;
      spawn.spawned = true;
      this.spawnRampageWaveEnemy(spawn);
    }
  }

  private processFinalWave() {
    const wave = this.config.finalWave;
    if (!wave || this.finalWaveSurvived) return;

    if (!this.finalWaveTriggered && this.playerX >= wave.triggerX) {
      this.finalWaveTriggered = true;
      for (const spawn of this.finalWaveSpawns) {
        spawn.triggeredAt = this.timeMs;
      }
      this.showPopup(wave.message ?? "FINAL WAVE INBOUND", 1800);
    }

    if (!this.finalWaveTriggered) return;

    for (const spawn of this.finalWaveSpawns) {
      if (spawn.spawned) continue;
      if (spawn.triggeredAt == null) spawn.triggeredAt = this.timeMs;
      if (this.timeMs - spawn.triggeredAt < spawn.delayMs) continue;
      spawn.spawned = true;
      this.spawnFinalWaveEnemy(spawn);
    }

    const allSpawned = this.finalWaveSpawns.every((s) => s.spawned);
    const waveEnemiesDone = allSpawned && !this.enemies.some((e) => e.active && e.fromFinalWave);

    if (allSpawned && waveEnemiesDone && !this.finalWaveSurvived) {
      this.finalWaveSurvived = true;
      this.addScore(wave.bonusScore ?? LEVEL_3_FINAL_WAVE_BONUS);
      this.showPopup("FINAL WAVE SURVIVED!", 1600);
    }
  }

  private isExtractionUnlocked(): boolean {
    const gate = this.config.extractionGate;
    if (!gate || gate.length === 0) return true;

    const nestsCleared = this.nests.every((n) => !n.active);
    if (gate.includes("nests_cleared") && nestsCleared) return true;
    if (gate.includes("final_wave_survived") && this.finalWaveSurvived) return true;
    return false;
  }

  private enemyCollisionDamage(kind: RainbowCowboyEnemyKind): number {
    if (isBoomBot(kind)) return 2;
    if (kind === "laser_gator") return 2;
    return 1;
  }

  private destroyEnemy(
    enemy: Enemy,
    cause: "tongue" | "rainbow" | "rampage" | "collision" | "blaster",
  ) {
    if (!enemy.active) return;
    const wasTruck = isBoomBot(enemy.kind);
    const cx = enemy.x + enemy.w / 2;
    const cy = enemy.y + enemy.h / 2;
    enemy.active = false;

    if (enemy.kind === "red_baron") {
      this.redBaronsDestroyed += 1;
    }

    this.dronesEaten += 1;
    const bonus = cause === "rainbow" ? RAINBOW_BLAST_BONUS : 0;
    this.addScore(DRONE_SCORES[enemy.kind] + bonus);

    if (enemy.kind === "cargo") {
      this.spawnCargoDrop(cx, cy);
    }

    if (wasTruck && cause !== "collision") {
      this.explodeMonsterTruckAt(cx, cy, enemy.kind);
    }

    if (cause === "tongue") {
      this.showPopup("CHOMP!", 600);
      this.emitAudio({ type: "drone_eat" });
    } else if (cause === "rampage") {
      this.emitAudio({ type: "drone_eat" });
    } else if (cause === "blaster") {
      this.showPopup("KABOOM!", 500);
    }
  }

  private explodeMonsterTruckAt(x: number, y: number, kind: RainbowCowboyEnemyKind) {
    const radius = enemyExplosionRadius(kind);
    this.emitAudio({ type: "explosion" });
    this.landmineExplosionEvents.push({
      x,
      groundY: this.config.level.groundY,
    });
    this.triggerExplosion(x, y, radius, 2, "RC truck detonation");
  }

  private damageEnemyWithGun(enemy: Enemy, weapon: WeaponKind): boolean {
    if (!enemy.active) return false;
    if (weapon === "bazooka") {
      this.destroyEnemy(enemy, "blaster");
      return true;
    }
    if (isBoomBot(enemy.kind)) {
      enemy.hp = (enemy.hp ?? 1) - 1;
      if (enemy.hp > 0) {
        enemy.beepPhase = (enemy.beepPhase ?? 0) + 0.8;
        return false;
      }
    }
    this.destroyEnemy(enemy, "blaster");
    return true;
  }

  private hazardGunRect(hazard: Hazard): Rect | null {
    const groundY = this.config.level.groundY;
    if (hazard.kind === "landmine") return landmineBodyRect(hazard, groundY);
    if (hazard.kind === "dynamite") {
      const s = DYNAMITE_SIZE;
      return { x: hazard.x - s / 2, y: hazard.y - s, w: s, h: s };
    }
    if (hazard.kind === "trash_balloon") {
      return {
        x: hazard.x - BALLOON_SIZE.w / 2,
        y: hazard.y - BALLOON_SIZE.h,
        w: BALLOON_SIZE.w,
        h: BALLOON_SIZE.h,
      };
    }
    if (hazard.kind === "sea_mine_tethered" || hazard.kind === "sea_mine_floating") {
      const s = SEA_MINE_SIZE;
      return { x: hazard.x - s / 2, y: hazard.y - s / 2, w: s, h: s };
    }
    if (hazard.kind === "creeper_mine") {
      return {
        x: hazard.x - CREEPER_MINE_W / 2,
        y: hazard.y - CREEPER_MINE_H / 2,
        w: CREEPER_MINE_W,
        h: CREEPER_MINE_H,
      };
    }
    return null;
  }

  private isSwimExplosiveHazard(kind: RainbowCowboyHazardKind): boolean {
    return kind === "sea_mine_tethered" || kind === "sea_mine_floating";
  }

  private isSeaMine(kind: RainbowCowboyHazardKind): boolean {
    return this.isSwimExplosiveHazard(kind);
  }

  private destroyCreeperMine(hazard: Hazard, cause: string, fromShot = false) {
    if (!hazard.active) return;
    hazard.active = false;
    this.addScore(CREEPER_MINE_SCORE);
    if (fromShot) this.showPopup("CREEPER DOWN", 700);
    this.emitAudio({ type: "explosion" });
  }

  private detonateSeaMine(hazard: Hazard, cause: string, fromShot = false) {
    if (!hazard.active) return;
    hazard.active = false;
    hazard.exploded = true;
    hazard.explodeUntil = this.timeMs + LANDMINE_EXPLODE_MS;
    this.emitAudio({ type: "explosion" });
    this.landmineExplosionEvents.push({
      x: hazard.x,
      groundY: hazard.y,
    });
    if (fromShot) {
      this.addScore(SEA_MINE_SCORE);
      this.showPopup("MINE DOWN!", 500);
    }
    const dist = Math.hypot(this.playerX - hazard.x, this.playerY - hazard.y);
    if (dist < SEA_MINE_BLAST_RADIUS && !this.isInvincible && !this.isRampage) {
      const knock = this.playerX < hazard.x ? -8 : 8;
      this.damagePlayer(1, cause, knock);
      if (!fromShot) this.showPopup("MINE BLAST!", 800);
    }
  }

  private hitHazardWithGun(hazard: Hazard, weapon: WeaponKind) {
    if (!hazard.active) return;
    const groundY = this.config.level.groundY;

    if (this.isSeaMine(hazard.kind)) {
      this.detonateSeaMine(hazard, "Shot a sea mine", true);
      return;
    }

    if (hazard.kind === "creeper_mine") {
      this.destroyCreeperMine(hazard, "Shot a creeper mine", true);
      return;
    }

    if (hazard.kind === "landmine") {
      const knock = this.playerX < hazard.x ? -4 : 4;
      this.detonateLandmine(hazard, "Shot a landmine", knock);
      return;
    }

    if (hazard.kind === "dynamite") {
      hazard.exploded = true;
      hazard.active = false;
      this.emitAudio({ type: "explosion" });
      this.landmineExplosionEvents.push({ x: hazard.x, groundY });
      this.triggerExplosion(hazard.x, hazard.y, DYNAMITE_RADIUS, weapon === "bazooka" ? 2 : 1, "Shot dynamite");
      this.showPopup("KABOOM!", 600);
      return;
    }

    if (hazard.kind === "trash_balloon") {
      hazard.active = false;
      this.emitAudio({ type: "explosion" });
      this.showPopup("POP!", 400);
    }
  }

  private hitBombWithGun(bomb: Bomb, weapon: WeaponKind) {
    if (!bomb.active) return;
    bomb.active = false;
    this.emitAudio({ type: "explosion" });
    const groundY = this.config.level.groundY;
    this.landmineExplosionEvents.push({ x: bomb.x, groundY });

    if (bomb.grounded || weapon === "bazooka") {
      const dist = Math.hypot(this.playerX - bomb.x, this.playerY - bomb.y);
      if (dist < BOMB_RADIUS) {
        const knock = this.playerX < bomb.x ? -6 : 6;
        this.damagePlayer(1, "Shot a bomb", knock);
      }
    } else {
      this.showPopup("POP!", 400);
    }
  }

  private projectileHitRect(shot: BlasterProjectile): Rect {
    if (shot.weapon === "spear") {
      const dir = shot.vx >= 0 ? 1 : -1;
      return {
        x: shot.x - (dir > 0 ? 0 : 18),
        y: shot.y - 3,
        w: 18,
        h: 6,
      };
    }
    const pw = shot.weapon === "bazooka" ? BAZOOKA_PROJECTILE_W : BLASTER_PROJECTILE_W;
    const ph = shot.weapon === "bazooka" ? BAZOOKA_PROJECTILE_H : BLASTER_PROJECTILE_H;
    const dir = shot.vx >= 0 ? 1 : -1;
    if (shot.weapon === "bazooka") {
      return {
        x: dir > 0 ? shot.x - 4 : shot.x - pw + 4,
        y: shot.y - ph / 2,
        w: pw,
        h: ph,
      };
    }
    return {
      x: shot.x - pw / 2,
      y: shot.y - ph / 2,
      w: pw,
      h: ph,
    };
  }

  private fireWeapon(weapon: WeaponKind) {
    const mouth = this.mouthPos();
    const dir = this.facing === "right" ? 1 : -1;
    const isBazooka = weapon === "bazooka";
    const speed = isBazooka ? BAZOOKA_PROJECTILE_SPEED : BLASTER_PROJECTILE_SPEED;
    const yOffset = isBazooka ? 2 : 0;

    this.blasterProjectiles.push({
      id: nextId(),
      x: mouth.x + dir * (isBazooka ? 12 : 8),
      y: mouth.y + yOffset,
      vx: dir * speed,
      active: true,
      weapon,
    });

    const cooldown =
      weapon === "machine_gun"
        ? MACHINE_GUN_FIRE_COOLDOWN_MS
        : weapon === "bazooka"
          ? BAZOOKA_FIRE_COOLDOWN_MS
          : BLASTER_FIRE_COOLDOWN_MS;
    this.gunCooldownUntil = this.timeMs + cooldown;
    this.lastGunFireMs = this.timeMs;
    this.lastGunWeapon = weapon;
    this.emitAudio({ type: weapon === "bazooka" ? "explosion" : "tongue" });
  }

  private tryFireGun(fromEdge: boolean, held: boolean) {
    if (this.isSwimLevel()) {
      this.tryFireSwimWeapon(fromEdge);
      return;
    }
    if (!this.weaponsEnabled()) return;
    if (this.timeMs < this.gunCooldownUntil) return;

    this.syncActiveWeapon();

    let weapon = this.activeWeapon;

    if (weapon === "machine_gun") {
      if (this.isHiveBossLevel()) {
        if (this.machineGunAmmo <= 0) {
          this.activeWeapon = "pistol";
          weapon = "pistol";
        } else if (!held && !fromEdge) {
          return;
        }
      } else if (!this.isMachineGunActive) {
        this.activeWeapon = "pistol";
        weapon = "pistol";
      } else if (!held && !fromEdge) {
        return;
      }
    } else if (weapon === "bazooka") {
      if (this.bazookaAmmo <= 0) {
        this.activeWeapon = "pistol";
        weapon = "pistol";
      } else if (!fromEdge) {
        return;
      }
    } else if (!fromEdge || !this.hasPistol) {
      return;
    }

    if (weapon === "bazooka") {
      this.bazookaAmmo -= 1;
      if (this.bazookaAmmo <= 0) {
        this.activeWeapon = "pistol";
      }
    } else if (weapon === "machine_gun" && this.isHiveBossLevel()) {
      this.machineGunAmmo -= 1;
      if (this.machineGunAmmo <= 0) {
        this.activeWeapon = "pistol";
      }
    }

    this.fireWeapon(weapon);
  }

  private boomBotContactExplode(enemy: Enemy) {
    if (!enemy.active) return;
    const cx = enemy.x + enemy.w / 2;
    const cy = enemy.y + enemy.h / 2;
    enemy.active = false;
    this.dronesEaten += 1;
    this.addScore(DRONE_SCORES[enemy.kind]);
    this.explodeMonsterTruckAt(cx, cy, enemy.kind);
  }

  private fireLaserShark(enemy: Enemy) {
    const facingRight = enemy.vx >= 0;
    const muzzleX = facingRight ? enemy.x + enemy.w - 8 : enemy.x + 6;
    const muzzleY = enemy.y + 8;
    const targetY = this.playerY - (this.isSwimLevel() ? PLAYER_H * 0.55 : PLAYER_H * 0.45);
    const dx = this.playerX - muzzleX;
    const dy = targetY - muzzleY;
    const dist = Math.hypot(dx, dy) || 1;
    const speed = LASER_SHARK_BULLET_SPEED;
    this.enemyBullets.push({
      id: nextId(),
      x: muzzleX,
      y: muzzleY,
      vx: (dx / dist) * speed,
      vy: (dy / dist) * speed,
      active: true,
      laser: true,
    });
    this.emitAudio({ type: "tongue" });
  }

  private fireTruckTurret(enemy: Enemy) {
    const ecx = enemy.x + enemy.w / 2;
    const dir = this.playerX >= ecx ? 1 : -1;
    const barrelLen = enemy.w * 0.38;
    const muzzleX = ecx + Math.cos(enemy.turretAngle ?? 0) * barrelLen;
    const muzzleY = enemy.y + 10 + Math.sin(enemy.turretAngle ?? 0) * barrelLen * 0.15;
    this.enemyBullets.push({
      id: nextId(),
      x: muzzleX,
      y: muzzleY,
      vx: dir * TURRET_BULLET_SPEED,
      vy: 0,
      active: true,
    });
    this.emitAudio({ type: "tongue" });
  }

  private spawnBossBullet(x: number, y: number, vx: number, vy: number) {
    this.enemyBullets.push({
      id: nextId(),
      x,
      y,
      vx,
      vy,
      active: true,
    });
    this.emitAudio({ type: "tongue" });
  }

  private spawnBossGrenade(x: number, y: number, vx: number, vy: number, bounces = 1) {
    this.bombs.push({
      id: nextId(),
      x,
      y,
      vy,
      vx,
      bounces,
      grounded: false,
      fuseMs: BOMB_FUSE_MS + 350 + Math.random() * 450,
      active: true,
      cartoon: true,
    });
    this.emitAudio({ type: "tongue" });
  }

  private updateEnemyBullets(dt: number) {
    const cam = this.cameraX;
    const camY = this.cameraY;
    const groundY = this.config.level.groundY;
    const pr = this.isSwimLevel()
      ? swimPlayerRect(this.playerX, this.playerY)
      : playerRect(this.playerX, this.playerY, this.ducking);

    for (const bullet of this.enemyBullets) {
      if (!bullet.active) continue;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;

      if (this.isVerticalScroll()) {
        const offY = bullet.y < camY - 140 || bullet.y > camY + VIEW_H + 140;
        const offX = bullet.x < -140 || bullet.x > VIEW_W + 140;
        if (offY || offX) {
          bullet.active = false;
          continue;
        }
      } else if (bullet.laser) {
        const offLeft = bullet.x < cam - 280;
        const offRight = bullet.x > cam + VIEW_W + 280;
        const offVertical = bullet.y < WATER_SURFACE_Y - 20 || bullet.y > groundY + 20;
        if (offLeft || offRight || offVertical) {
          bullet.active = false;
          continue;
        }
      } else if (bullet.x < cam - 60 || bullet.x > cam + VIEW_W + 60) {
        bullet.active = false;
        continue;
      }

      const hitR = bullet.fromAbyss ? 7 : ENEMY_BULLET_RADIUS;
      const br: Rect = {
        x: bullet.x - hitR,
        y: bullet.y - hitR,
        w: hitR * 2,
        h: hitR * 2,
      };
      if (rectsOverlap(pr, br) && !this.isInvincible && this.timeMs >= this.hitFlashUntil) {
        bullet.active = false;
        const knock = bullet.vx > 0 ? 5 : -5;
        const cause = bullet.fromAbyss
          ? bullet.laser
            ? "Abyss laser"
            : "Abyss bolt"
          : bullet.laser
            ? "Shark laser"
            : "Turret truck shot";
        this.damagePlayer(1, cause, knock);
        if (bullet.fromAbyss) {
          this.showPopup(bullet.laser ? "LASER!" : "BOLT!", 500);
        }
      }
    }

    this.enemyBullets = this.enemyBullets.filter((b) => b.active);
  }

  private enemyBulletHitRect(bullet: EnemyBullet): Rect {
    const r = bullet.fromAbyss ? 9 : ENEMY_BULLET_RADIUS;
    return { x: bullet.x - r, y: bullet.y - r, w: r * 2, h: r * 2 };
  }

  private destroyAbyssBullet(bullet: EnemyBullet) {
    bullet.active = false;
    this.emitAudio({ type: "tongue" });
  }

  private updateBlasterProjectiles(dt: number) {
    const cam = this.cameraX;
    const viewLeft = cam - 40;
    const viewRight = cam + VIEW_W + 40;

    for (const shot of this.blasterProjectiles) {
      if (!shot.active) continue;
      shot.x += shot.vx * dt;
      if (shot.x < viewLeft - 80 || shot.x > viewRight + 80) {
        shot.active = false;
        continue;
      }

      const sr = this.projectileHitRect(shot);

      for (const enemy of this.enemies) {
        if (!enemy.active) continue;
        const er = enemyAttackHitRect(enemy);
        if (rectsOverlap(sr, er)) {
          this.damageEnemyWithGun(enemy, shot.weapon);
          shot.active = false;
          break;
        }
      }

      if (!shot.active) continue;

      for (const hazard of this.hazards) {
        if (!hazard.active) continue;
        const hr = this.hazardGunRect(hazard);
        if (!hr) continue;
        if (rectsOverlap(sr, hr)) {
          this.hitHazardWithGun(hazard, shot.weapon);
          shot.active = false;
          break;
        }
      }

      if (!shot.active) continue;

      for (const bomb of this.bombs) {
        if (!bomb.active) continue;
        const br: Rect = { x: bomb.x - 14, y: bomb.y - 14, w: 28, h: 28 };
        if (rectsOverlap(sr, br)) {
          this.hitBombWithGun(bomb, shot.weapon);
          shot.active = false;
          break;
        }
      }

      if (!shot.active) continue;

      for (const nest of this.nests) {
        if (!nest.active) continue;
        if (rectsOverlap(sr, this.nestRect(nest))) {
          this.destroyNest(nest);
          shot.active = false;
          break;
        }
      }

      if (!shot.active) continue;

      if (this.hiveBoss?.active && !this.hiveBoss.defeated) {
        const hiveRect = this.hiveBoss.hiveHitRect();
        if (rectsOverlap(sr, hiveRect)) {
          this.damageHiveBoss(this.hiveGunDamage(shot.weapon));
          if (shot.weapon === "bazooka") {
            this.damageNearbyBossDrones(shot.x, shot.y, 120);
          }
          shot.active = false;
        }
      }

      if (!shot.active) continue;

      if (this.abyssBoss?.engaged) {
        for (const bullet of this.enemyBullets) {
          if (!bullet.active || !bullet.fromAbyss) continue;
          if (rectsOverlap(sr, this.enemyBulletHitRect(bullet))) {
            this.destroyAbyssBullet(bullet);
            shot.active = false;
            break;
          }
        }
      }

      if (!shot.active) continue;

      if (this.abyssBoss?.active && !this.abyssBoss.defeated && shot.weapon === "spear") {
        const leadX = shot.vx >= 0 ? sr.x + sr.w : sr.x;
        const leadY = sr.y + sr.h / 2;
        if (
          this.abyssBoss.tryHitSpear(sr, this.abyssBoss.getSpearDamage(), {
            x: leadX,
            y: leadY,
          })
        ) {
          shot.active = false;
        }
      }
    }

    this.blasterProjectiles = this.blasterProjectiles.filter((s) => s.active);
  }

  private throwGoblinBomb(enemy: Enemy) {
    const px = enemy.x + enemy.w / 2;
    const dir = this.playerX >= px ? 1 : -1;
    const burst = 1 + (Math.random() > 0.55 ? 1 : 0);

    for (let i = 0; i < burst; i++) {
      const spread = (Math.random() - 0.5) * 3.6;
      const loft = 4 + Math.random() * 7 + i * 1.5;
      const speed = 2 + Math.random() * 3.2;
      this.bombs.push({
        id: nextId(),
        x: px + dir * (6 + i * 8) + spread * 4,
        y: enemy.y + 4,
        vy: -loft,
        vx: dir * (speed + spread),
        bounces: 1 + Math.floor(Math.random() * 3),
        grounded: false,
        fuseMs: BOMB_FUSE_MS + 150 + Math.random() * 700,
        active: true,
        cartoon: true,
      });
    }
  }

  private spawnCargoDrop(x: number, y: number) {
    const kinds: RainbowCowboyPickupKind[] = [
      "range_beer",
      "white_energy_drink",
      "nicotine_pouch",
      "rainbow",
    ];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    this.pickups.push({
      id: nextId(),
      kind,
      x,
      y: y - 8,
      active: true,
    });
    this.showPopup("CARGO DROP!", 700);
  }

  private destroyNest(nest: Nest) {
    if (!nest.active) return;
    nest.active = false;
    this.nestsDestroyed += 1;
    this.addScore(NEST_DESTROY_SCORE);
    this.showPopup("DRONE NEST DESTROYED", 1400);
  }

  private nestRect(nest: Nest): Rect {
    return {
      x: nest.x - NEST_W / 2,
      y: nest.y - NEST_H,
      w: NEST_W,
      h: NEST_H,
    };
  }

  private spawnBomb(x: number, y: number) {
    this.bombs.push({
      id: nextId(),
      x,
      y,
      vy: 0,
      grounded: false,
      fuseMs: BOMB_FUSE_MS,
      active: true,
    });
  }

  private spawnNestDrone(nest: Nest) {
    const kind = nest.spawnKinds[nest.spawnIndex % nest.spawnKinds.length];
    nest.spawnIndex += 1;
    const spawnX = isGroundEnemy(kind) ? nest.x + 36 : nest.x + 40;
    const spawnY = isGroundEnemy(kind) ? this.config.level.groundY : nest.y - 80;
    const enemy = this.createEnemyFromSpawn({ kind, y: spawnY }, spawnX);
    if (!isGroundEnemy(kind)) {
      enemy.y = nest.y - 80;
      enemy.baseY = nest.y - 80;
    }
    this.enemies.push(enemy);
  }

  private handleInput(input: GameInput) {
    if (this.phase !== "playing") return;
    if (this.isSwimLevel()) {
      this.handleSwimInput(input);
      return;
    }

    let speed = MOVE_SPEED;
    if (this.isGassed) speed *= GASSED_MOVE_MULT;
    if (this.isRampage) speed *= RAMPAGE_SPEED_MULT;
    if (this.timeMs < this.speedBoostUntil) speed *= BOOST_SPEED_MULT;

    this.ducking = input.down && this.grounded;
    this.aimingUp = input.up;

    if (input.left) {
      this.playerVx = -speed * (this.ducking ? DUCK_SPEED_MULT : 1);
      this.facing = "left";
    } else if (input.right) {
      this.playerVx = speed * (this.ducking ? DUCK_SPEED_MULT : 1);
      this.facing = "right";
    } else {
      this.playerVx *= 0.82;
    }

    this.playerVx += this.knockbackVx;
    this.knockbackVx *= KNOCKBACK_DECAY;

    if (input.jumpPressed) {
      this.jumpBufferUntil = Math.max(this.jumpBufferUntil, this.timeMs + JUMP_BUFFER_MS);
    }

    const coyoteOk =
      this.grounded || this.timeMs - this.lastGroundedAtMs <= COYOTE_TIME_MS;
    const jumpBuffered = this.timeMs < this.jumpBufferUntil;
    if (jumpBuffered && coyoteOk && !this.ducking) {
      this.playerVy = JUMP_VEL;
      this.grounded = false;
      this.jumpBufferUntil = 0;
      this.emitAudio({ type: "jump" });
    }

    if (input.tonguePressed && this.timeMs >= this.tongueCooldownUntil) {
      this.tongueStartedMs = this.timeMs;
      this.tongueUntil = this.timeMs + TONGUE_DURATION_MS;
      this.tongueCooldownUntil = this.timeMs + TONGUE_COOLDOWN_MS;
      this.tongueTarget = this.findTongueTarget();
      this.emitAudio({ type: "tongue" });
    }

    if (input.gunPressed || input.gunHeld) {
      this.tryFireGun(input.gunPressed, input.gunHeld);
    }

    if (input.rainbowPressed) {
      this.tryRainbowBlast();
    }

    if (input.weaponSwapPressed && this.isHiveBossLevel()) {
      this.cycleBossWeapon();
    }
  }

  private handleSwimInput(input: GameInput) {
    let speed = SWIM_SPEED;
    if (this.isGassed) speed *= GASSED_MOVE_MULT;
    if (this.isRampage) speed *= RAMPAGE_SPEED_MULT;
    if (this.timeMs < this.speedBoostUntil) speed *= BOOST_SPEED_MULT;

    let vx = 0;
    let vy = 0;
    if (input.left) {
      vx -= speed;
      this.facing = "left";
    }
    if (input.right) {
      vx += speed;
      this.facing = "right";
    }
    if (input.up) vy -= speed * 0.88;
    if (input.down) vy += speed * 0.88;
    if (vx !== 0 && vy !== 0) {
      vx *= 0.707;
      vy *= 0.707;
    }
    this.playerVx = vx + this.knockbackVx;
    this.playerVy = vy;
    this.knockbackVx *= KNOCKBACK_DECAY;

    if (input.gunPressed || input.tonguePressed) {
      this.tryFireSwimWeapon(true);
    }
    if (input.rainbowPressed) {
      this.tryRainbowBlast();
    }
    if (input.weaponSwapPressed) {
      this.cycleSwimWeapon();
    }
  }

  private cycleSwimWeapon() {
    if (this.sonicCharges <= 0) {
      if (this.activeSwimWeapon !== "spear") {
        this.activeSwimWeapon = "spear";
        this.showPopup("HARPOON", 600);
      }
      return;
    }
    this.activeSwimWeapon = this.activeSwimWeapon === "spear" ? "sonic" : "spear";
    this.showPopup(this.activeSwimWeapon === "sonic" ? "SONIC BLAST" : "HARPOON ∞", 700);
  }

  private tryFireSwimWeapon(fromEdge: boolean) {
    if (!fromEdge) return;
    if (this.timeMs < this.gunCooldownUntil) return;
    if (this.activeSwimWeapon === "sonic") {
      this.tryFireSonic();
      return;
    }
    this.tryFireSpear();
  }

  private tryFireSpear() {
    const dir = this.facing === "right" ? 1 : -1;
    this.blasterProjectiles.push({
      id: nextId(),
      x: this.playerX + dir * 34,
      y: this.playerY - PLAYER_H * 0.55,
      vx: dir * SPEAR_PROJECTILE_SPEED,
      active: true,
      weapon: "spear",
    });
    this.gunCooldownUntil = this.timeMs + SPEAR_FIRE_COOLDOWN_MS;
    this.lastGunFireMs = this.timeMs;
    this.lastGunWeapon = "spear";
    this.emitAudio({ type: "tongue" });
  }

  private tryFireSonic() {
    if (this.sonicCharges <= 0) {
      this.activeSwimWeapon = "spear";
      this.showPopup("NO SONIC CHARGES", 600);
      return;
    }

    const dir = (this.facing === "right" ? 1 : -1) as 1 | -1;
    this.sonicWaves.push({
      id: nextId(),
      x: this.playerX + dir * 42,
      y: this.playerY - PLAYER_H * 0.55,
      dir,
      radius: 24,
      bornMs: this.timeMs,
      active: true,
      hitEnemyIds: [],
      hitHazardIds: [],
    });
    this.sonicCharges -= 1;
    if (this.sonicCharges <= 0) {
      this.activeSwimWeapon = "spear";
    }
    this.gunCooldownUntil = this.timeMs + SONIC_FIRE_COOLDOWN_MS;
    this.lastGunFireMs = this.timeMs;
    this.lastGunWeapon = "sonic";
    this.emitAudio({ type: "rainbow_blast" });
  }

  private updateSonicWaves(dt: number) {
    if (!this.isSwimLevel()) return;
    const cam = this.cameraX;
    const viewLeft = cam - 120;
    const viewRight = cam + VIEW_W + 120;

    for (const wave of this.sonicWaves) {
      if (!wave.active) continue;
      wave.x += wave.dir * SONIC_WAVE_SPEED * dt;
      wave.radius += SONIC_WAVE_GROW * dt * 16;

      const expired =
        this.timeMs - wave.bornMs > SONIC_WAVE_DURATION_MS ||
        wave.radius >= SONIC_WAVE_MAX_RADIUS;
      if (expired || wave.x < viewLeft - wave.radius || wave.x > viewRight + wave.radius) {
        wave.active = false;
        continue;
      }

      for (const enemy of this.enemies) {
        if (!enemy.active || wave.hitEnemyIds.includes(enemy.id)) continue;
        const er = enemyAttackHitRect(enemy);
        if (rectIntersectsSonicCone(wave, er)) {
          wave.hitEnemyIds.push(enemy.id);
          this.destroyEnemy(enemy, "blaster");
        }
      }

      for (const hazard of this.hazards) {
        if (!hazard.active || wave.hitHazardIds.includes(hazard.id)) continue;
        const hr = this.hazardGunRect(hazard);
        if (!hr || !rectIntersectsSonicCone(wave, hr)) continue;
        wave.hitHazardIds.push(hazard.id);
        if (this.isSeaMine(hazard.kind)) {
          this.detonateSeaMine(hazard, "Sonic blast", true);
        } else if (hazard.kind === "creeper_mine") {
          this.destroyCreeperMine(hazard, "Sonic blast", true);
        }
      }

      if (this.abyssBoss?.active && !this.abyssBoss.defeated && this.abyssBoss.engaged) {
        for (const bullet of this.enemyBullets) {
          if (!bullet.active || !bullet.fromAbyss) continue;
          if (rectIntersectsSonicCone(wave, this.enemyBulletHitRect(bullet))) {
            this.destroyAbyssBullet(bullet);
          }
        }

        for (const layout of this.abyssBoss.getTentacleLayouts(this.timeMs)) {
          const key = `abyss-t${layout.id}`;
          if (layout.dying || wave.hitEnemyIds.includes(key)) continue;
          if (!rectIntersectsSonicCone(wave, layout.hitRect)) continue;
          wave.hitEnemyIds.push(key);
          this.abyssBoss.tryHitSpear(layout.hitRect, this.abyssBoss.getSonicTentacleDamage());
        }
        const body = this.abyssBoss.getBodyHitRect();
        if (body && !wave.hitEnemyIds.includes("abyss-body") && rectIntersectsSonicCone(wave, body)) {
          wave.hitEnemyIds.push("abyss-body");
          this.abyssBoss.damageEye(this.abyssBoss.getSonicTentacleDamage());
        }
      }
    }

    this.sonicWaves = this.sonicWaves.filter((w) => w.active);
  }

  private fireCreeperMineBurst(hazard: Hazard) {
    const originY = hazard.y - CREEPER_MINE_H / 2 - 2;
    const groupId = nextId();
    for (const { dirX, dirY } of creeperBurstDirections()) {
      this.hostileSonicBursts.push({
        id: nextId(),
        groupId,
        x: hazard.x,
        y: originY,
        dirX,
        dirY,
        length: 10,
        maxLength: creeperBurstMaxLength(originY, dirX, dirY),
        bornMs: this.timeMs,
        active: true,
      });
    }
    this.emitAudio({ type: "rainbow_blast" });
  }

  private updateHostileSonicBursts(dt: number) {
    if (!this.isSwimLevel()) return;
    const pr = swimPlayerRect(this.playerX, this.playerY);

    for (const burst of this.hostileSonicBursts) {
      if (!burst.active) continue;
      if (burst.length < burst.maxLength) {
        burst.length = Math.min(
          burst.maxLength,
          burst.length + CREEPER_BURST_GROW * dt * 16,
        );
      }

      const expired = this.timeMs - burst.bornMs > CREEPER_BURST_DURATION_MS;
      if (expired) {
        burst.active = false;
        continue;
      }

      if (
        !this.isInvincible &&
        !this.isRampage &&
        this.timeMs >= this.hitFlashUntil &&
        rectIntersectsHostileBurst(burst, pr)
      ) {
        const groupId = burst.groupId;
        for (const b of this.hostileSonicBursts) {
          if (b.groupId === groupId) b.active = false;
        }
        this.damagePlayer(1, "Creeper sonic burst", 0);
        this.showPopup("SONIC HIT!", 900);
      }
    }

    this.hostileSonicBursts = this.hostileSonicBursts.filter((b) => b.active);
  }

  private updateSwimPhysics(dt: number) {
    const levelW = this.isVerticalScroll() ? VIEW_W : this.config.level.levelWidth;
    let minY: number;
    let maxY: number;

    if (this.isVerticalScroll() && this.abyssBoss?.isArenaLocked()) {
      minY = ABYSS_ARENA_Y - 36;
      maxY = ABYSS_ARENA_Y + 80;
    } else if (this.isVerticalScroll() && this.abyssBoss?.engaged && !this.abyssBoss.isArenaLocked()) {
      const bandTop = this.abyssBoss.getEffectiveCameraY(this.playerY);
      minY = bandTop + 36;
      maxY = Math.min(bandTop + VIEW_H - 36, ABYSS_FLOOR_Y - 8);
    } else if (this.isVerticalScroll()) {
      minY = this.cameraY + 36;
      maxY = ABYSS_ENGAGE_Y + 48;
    } else {
      minY = WATER_SURFACE_Y + 36;
      maxY = this.config.level.groundY - 8;
    }

    this.playerX += this.playerVx * dt;
    this.playerY += this.playerVy * dt;
    this.playerX = Math.max(FROGMAN_W / 2, Math.min(levelW - FROGMAN_W / 2, this.playerX));
    this.playerY = Math.max(minY, Math.min(maxY, this.playerY));

    const pr = swimPlayerRect(this.playerX, this.playerY);
    const obstacles = [...this.config.walls, ...this.config.platforms];
    for (const hazard of this.hazards) {
      if (!hazard.active || hazard.kind !== "floating_log") continue;
      const lw = hazard.w ?? FLOATING_LOG_W;
      const lh = hazard.h ?? FLOATING_LOG_H;
      obstacles.push({ x: hazard.x - lw / 2, y: hazard.y - lh / 2, w: lw, h: lh });
    }
    for (const obstacle of obstacles) {
      const ob = { x: obstacle.x, y: obstacle.y, w: obstacle.w, h: obstacle.h };
      if (!rectsOverlap(pr, ob)) continue;
      const overlapLeft = pr.x + pr.w - ob.x;
      const overlapRight = ob.x + ob.w - pr.x;
      const overlapTop = pr.y + pr.h - ob.y;
      const overlapBottom = ob.y + ob.h - pr.y;
      const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
      if (minOverlap === overlapLeft) this.playerX -= overlapLeft;
      else if (minOverlap === overlapRight) this.playerX += overlapRight;
      else if (minOverlap === overlapTop) this.playerY -= overlapTop;
      else this.playerY += overlapBottom;
    }

    this.grounded = false;
  }

  private tryRainbowBlast() {
    if (this.rainbowCharges <= 0) {
      this.showPopup("NO RAINBOW", 700);
      return;
    }
    this.rainbowCharges -= 1;
    this.rainbowBlastsUsed += 1;
    this.rainbowBlastUntil = this.timeMs + 900;
    this.emitAudio({ type: "rainbow_blast" });
    const remaining = this.rainbowCharges;
    this.showPopup(
      remaining > 0 ? `RAINBOW BLAST! (${remaining})` : "RAINBOW BLAST!",
      900,
    );

    const cam = this.cameraX;
    const viewLeft = cam - 40;
    const viewRight = cam + VIEW_W + 40;

    for (const enemy of this.enemies) {
      if (!enemy.active) continue;
      if (enemy.x + enemy.w < viewLeft || enemy.x > viewRight) continue;
      this.destroyEnemy(enemy, "rainbow");
    }

    for (const nest of this.nests) {
      if (!nest.active) continue;
      if (nest.x >= viewLeft && nest.x <= viewRight) {
        this.destroyNest(nest);
      }
    }

    for (const hazard of this.hazards) {
      if (!hazard.active) continue;
      if (hazard.kind === "trash_balloon") {
        if (hazard.x >= viewLeft && hazard.x <= viewRight) {
          hazard.active = false;
          this.addScore(25 + RAINBOW_BLAST_BONUS);
        }
      }
      if (hazard.kind === "landmine" || hazard.kind === "dynamite") {
        const dist = Math.hypot(hazard.x - this.playerX, hazard.y - this.playerY);
        if (dist < RAINBOW_BLAST_RADIUS) {
          hazard.active = false;
          if (hazard.kind === "dynamite") hazard.exploded = true;
        }
      }
      if (hazard.kind === "sea_mine_tethered" || hazard.kind === "sea_mine_floating") {
        const dist = Math.hypot(hazard.x - this.playerX, hazard.y - this.playerY);
        if (dist < RAINBOW_BLAST_RADIUS) {
          hazard.active = false;
          this.addScore(SEA_MINE_SCORE + RAINBOW_BLAST_BONUS);
        }
      }
    }

    if (this.hiveBoss?.active && !this.hiveBoss.defeated) {
      const hiveRect = this.hiveBoss.hiveHitRect();
      if (hiveRect.x + hiveRect.w >= viewLeft && hiveRect.x <= viewRight) {
        this.hiveBossHitCooldownUntil = 0;
        this.damageHiveBoss(HIVE_RAINBOW_DAMAGE, true);
      }
    }

    if (this.abyssBoss?.active && !this.abyssBoss.defeated) {
      this.abyssBoss.damageRainbow();
    }
  }

  private damageNearbyBossDrones(x: number, y: number, radius: number) {
    for (const enemy of this.enemies) {
      if (!enemy.active) continue;
      const cx = enemy.x + enemy.w / 2;
      const cy = enemy.y + enemy.h / 2;
      if (Math.hypot(cx - x, cy - y) < radius) {
        this.destroyEnemy(enemy, "blaster");
      }
    }
  }

  private updatePhysics(dt: number) {
    const groundY = this.config.level.groundY;
    const levelW = this.config.level.levelWidth;

    this.playerVy += GRAVITY * dt;
    this.playerX += this.playerVx * dt;
    this.playerY += this.playerVy * dt;

    this.playerX = Math.max(FROGMAN_W / 2, Math.min(levelW - FROGMAN_W / 2, this.playerX));

    if (this.arenaLocked && this.hiveBoss?.active) {
      const bounds = this.hiveBoss.getArenaBounds();
      const minX = bounds.startX + PLAYER_W / 2 + 24;
      const maxX = bounds.endX - PLAYER_W / 2 - 24;
      this.playerX = Math.max(minX, Math.min(maxX, this.playerX));
    }

    const pr = playerRect(this.playerX, this.playerY, this.ducking);
    this.grounded = false;

    if (this.playerY >= groundY) {
      this.playerY = groundY;
      this.playerVy = 0;
      this.grounded = true;
    }

    if (this.grounded) {
      this.lastGroundedAtMs = this.timeMs;
    }

    for (const wall of this.config.walls) {
      const wr = { x: wall.x, y: wall.y, w: wall.w, h: wall.h };
      if (rectsOverlap(pr, wr)) {
        if (this.playerVy > 0 && pr.y + pr.h - this.playerVy * dt <= wr.y + 4) {
          this.playerY = wr.y;
          this.playerVy = 0;
          this.grounded = true;
          this.lastGroundedAtMs = this.timeMs;
        } else if (this.playerVx > 0 && pr.x < wr.x) {
          this.playerX = wr.x - PLAYER_W / 2 - 1;
        } else if (this.playerVx < 0 && pr.x + pr.w > wr.x + wr.w) {
          this.playerX = wr.x + wr.w + PLAYER_W / 2 + 1;
        }
      }
    }

    for (const plat of this.getActivePlatforms()) {
      const pl = { x: plat.x, y: plat.y, w: plat.w, h: plat.h };
      if (rectsOverlap(pr, pl)) {
        if (this.playerVy > 0 && pr.y + pr.h - this.playerVy * dt <= pl.y + 6) {
          this.playerY = pl.y;
          this.playerVy = 0;
          this.grounded = true;
          this.lastGroundedAtMs = this.timeMs;
        }
      }
    }
  }

  private getActivePlatforms() {
    if (this.hiveBoss?.active) {
      return this.hiveBoss.getPlankPlatforms();
    }
    return this.config.platforms;
  }

  private updateEnemies(dt: number, dtMs: number) {
    const targetX = this.playerX;
    const targetY = this.playerY - (this.isSwimLevel() ? PLAYER_H * 0.55 : PLAYER_H * 0.45);
    const groundY = this.config.level.groundY;
    const sm = this.difficultySpeed();

    for (const e of this.enemies) {
      if (!e.active) continue;

      if (e.cosmetic) {
        e.x += e.vx * dt;
        e.y += (e.vy ?? 0) * dt;
        e.vy = (e.vy ?? 0) + 0.18 * dt;
        e.bobPhase += 0.08 * dt;
        e.y += Math.sin(e.bobPhase) * 0.35 * dt;
        e.cosmeticFuseMs = (e.cosmeticFuseMs ?? 0) - dtMs;
        if ((e.cosmeticFuseMs ?? 0) <= 0) {
          e.active = false;
          this.emitAudio({ type: "explosion" });
          this.landmineExplosionEvents.push({ x: e.x + e.w / 2, groundY });
        }
        continue;
      }

      if (e.groundUnit) {
        e.beepPhase = (e.beepPhase ?? 0) + 0.06 * dt;
        const ecx = e.x + e.w / 2;
        const dir = this.playerX >= ecx ? 1 : -1;
        const speed = groundEnemySpeed(e.kind);
        e.x += dir * speed * dt * sm;
        e.y = groundY - e.h;

        if (e.kind === "grenade_goblin_bot") {
          e.throwCooldownMs = (e.throwCooldownMs ?? GOBLIN_THROW_INTERVAL_MS) - dtMs;
          if ((e.throwCooldownMs ?? 0) <= 0) {
            this.throwGoblinBomb(e);
            e.throwCooldownMs = GOBLIN_THROW_INTERVAL_MS + Math.random() * 800;
          }
        }

        if (e.kind === "armored_boom_bot") {
          const targetAngle = this.playerX >= ecx ? 0 : Math.PI;
          let angle = e.turretAngle ?? targetAngle;
          let diff = targetAngle - angle;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          angle += diff * TURRET_TRUCK_TURN_SPEED * dt;
          e.turretAngle = angle;

          e.shootCooldownMs = (e.shootCooldownMs ?? TURRET_TRUCK_SHOOT_INTERVAL_MS) - dtMs;
          if ((e.shootCooldownMs ?? 0) <= 0 && Math.abs(diff) < 0.45) {
            this.fireTruckTurret(e);
            e.shootCooldownMs = TURRET_TRUCK_SHOOT_INTERVAL_MS;
          }
        }

        if (e.x + e.w < this.cameraX - 180) {
          e.active = false;
        }
        continue;
      }

      if (e.kind === "red_baron") {
        e.x += e.vx * dt * sm;
        e.bobPhase += 0.03 * dt;
        e.y = e.baseY + Math.sin(e.bobPhase) * 8;

        e.bombCooldownMs = (e.bombCooldownMs ?? RED_BARON_BOMB_INTERVAL_MS) - dtMs;
        e.bombWarning = (e.bombCooldownMs ?? 0) <= RED_BARON_BOMB_WARNING_MS && (e.bombCooldownMs ?? 0) > 0;

        if ((e.bombCooldownMs ?? 0) <= 0) {
          this.spawnBomb(e.x + e.w / 2, e.y + e.h);
          e.bombCooldownMs = RED_BARON_BOMB_INTERVAL_MS;
          e.bombWarning = false;
        }

        if (e.x + e.w < this.cameraX - 120) {
          e.active = false;
        }
        continue;
      }

      if (e.kind === "laser_shark") {
        const minY = WATER_SURFACE_Y + 36;
        const maxY = groundY - e.h - 8;
        e.bobPhase += 0.05 * dt;

        if (e.phase === "patrol") {
          e.x += e.vx * dt * sm;
          e.y = e.baseY + Math.sin(e.bobPhase) * 8;

          const centerX = e.x + e.w / 2;
          const passedPlayer = centerX < targetX - 18;
          if (passedPlayer) {
            e.phase = "homing";
            e.homingSince = this.timeMs;
          } else if (e.x + e.w < this.cameraX - 100) {
            e.active = false;
          }
        } else {
          const cfg = SHARK_HOMING;
          const ecx = e.x + e.w / 2;
          const ecy = e.y + e.h / 2;
          const dx = targetX - ecx;
          const dy = targetY - ecy;
          const dist = Math.hypot(dx, dy) || 1;
          const nx = dx / dist;
          const ny = dy / dist;

          const ramp = Math.min(1, (this.timeMs - e.homingSince) / 550);
          const steer = cfg.steer * (0.6 + ramp * 0.4);
          const speed = cfg.speed * (0.85 + ramp * 0.35) * sm;

          e.x += nx * speed * steer * dt * 16;
          e.y += ny * speed * steer * dt * 16;
          e.bobPhase += 0.05 * dt;
          e.y += Math.sin(e.bobPhase) * cfg.bob * 0.06 * dt;
          e.y = Math.max(minY, Math.min(maxY, e.y));
          e.vx = nx * Math.abs(ENEMY_SPEEDS.laser_shark);

          const offLeft = e.x + e.w < this.cameraX - 180;
          const lostChase = this.timeMs - e.homingSince > 8500 && dist > 400;
          if (offLeft && lostChase) {
            e.active = false;
          }
        }

        e.shootCooldownMs = (e.shootCooldownMs ?? LASER_SHARK_SHOOT_INTERVAL_MS) - dtMs;
        const ecx = e.x + e.w / 2;
        const playerAhead = this.playerX < ecx + 40;
        const inLaserRange = Math.abs(this.playerX - ecx) < 620;
        if (
          (e.shootCooldownMs ?? 0) <= 0 &&
          playerAhead &&
          inLaserRange &&
          e.x < this.cameraX + VIEW_W + 40
        ) {
          this.fireLaserShark(e);
          e.shootCooldownMs = LASER_SHARK_SHOOT_INTERVAL_MS + Math.random() * 600;
        }

        continue;
      }

      if (e.kind === "laser_gator") {
        const minY = WATER_SURFACE_Y + 24;
        const maxY = groundY - e.h - 8;
        e.bobPhase += 0.06 * dt;
        const targetX = this.playerX;
        const targetY = this.playerY - PLAYER_H * 0.55;

        if (e.phase === "patrol") {
          e.x += e.vx * dt * sm;
          e.y = e.baseY + Math.sin(e.bobPhase) * 6;

          if (e.patrolMinX != null && e.x < e.patrolMinX) {
            e.x = e.patrolMinX;
            e.vx = Math.abs(e.vx);
          }
          if (e.patrolMaxX != null && e.x + e.w > e.patrolMaxX) {
            e.x = e.patrolMaxX - e.w;
            e.vx = -Math.abs(e.vx);
          }

          const lane = gatorPatrolLane(e.baseY, groundY);
          const ecx = e.x + e.w / 2;
          const ecy = e.y + e.h * 0.45;
          const hDist = Math.abs(targetX - ecx);
          const vDist = Math.abs(targetY - ecy);
          const playerBelow = targetY > e.y + 16;

          const triggerKamikaze =
            lane === "surface"
              ? hDist < 440 && playerBelow
              : hDist < 460 && vDist < 155;

          if (triggerKamikaze) {
            e.phase = "swoop";
            e.homingSince = this.timeMs;
          } else if (e.x + e.w < this.cameraX - 120 || e.x > this.cameraX + VIEW_W + 160) {
            if (e.x + e.w < this.cameraX - 120) e.active = false;
          }
        } else {
          const cfg = GATOR_KAMIKAZE;
          const ecx = e.x + e.w / 2;
          const ecy = e.y + e.h / 2;
          const dx = targetX - ecx;
          const dy = targetY - ecy;
          const dist = Math.hypot(dx, dy) || 1;
          const nx = dx / dist;
          const ny = dy / dist;
          const ramp = Math.min(1, (this.timeMs - e.homingSince) / 320);
          const steer = cfg.steer * (0.8 + ramp * 0.6);
          const speed = cfg.speed * (1.0 + ramp * 0.55) * sm;

          e.x += nx * speed * steer * dt * 16;
          e.y += ny * speed * steer * dt * 16;
          e.y = Math.max(minY, Math.min(maxY, e.y));
          e.vx = nx * Math.abs(ENEMY_SPEEDS.laser_gator);

          const missed =
            this.timeMs - e.homingSince > 900 &&
            (targetY < e.y - 64 || Math.abs(targetX - ecx) > 120);
          const offScreen = e.y >= maxY || e.x + e.w < this.cameraX - 80;
          if (missed || offScreen || this.timeMs - e.homingSince > 5500) {
            e.active = false;
          }
        }

        continue;
      }

      const centerX = e.x + e.w / 2;
      if (e.kind === "fixed_wing") {
        e.bobPhase += 0.04 * dt;

        if (e.phase === "patrol") {
          e.x += e.vx * dt * sm;
          e.y = e.baseY + Math.sin(e.bobPhase * 0.6) * 6;

          const wingCenterX = e.x + e.w / 2;
          const passedPlayer = wingCenterX <= targetX - 12;
          if (passedPlayer) {
            e.phase = "homing";
            e.homingSince = this.timeMs;
          } else if (e.x + e.w < this.cameraX - 100) {
            e.active = false;
          }
        } else {
          const cfg = DRONE_HOMING.fixed_wing;
          const ecx = e.x + e.w / 2;
          const ecy = e.y + e.h / 2;
          const dx = targetX - ecx;
          const dy = targetY - ecy;
          const dist = Math.hypot(dx, dy) || 1;
          const nx = dx / dist;
          const ny = dy / dist;

          const ramp = Math.min(1, (this.timeMs - e.homingSince) / 400);
          const steer = cfg.steer * (0.9 + ramp * 0.5);
          const speed = cfg.speed * (1.1 + ramp * 0.6) * sm;

          e.x += nx * speed * steer * dt * 16;
          e.y += ny * speed * steer * dt * 16;
          e.y += Math.sin(e.bobPhase) * cfg.bob * 0.05 * dt;
          e.y = Math.max(48, Math.min(groundY - e.h - 8, e.y));

          const offLeft = e.x + e.w < this.cameraX - 180;
          const offRight = e.x > this.cameraX + VIEW_W + 180;
          const lostChase = this.timeMs - e.homingSince > 7000 && dist > 360;
          if ((offLeft || offRight) && lostChase) {
            e.active = false;
          }
        }
        continue;
      }

      const skipHoming = e.kind === "cargo";

      if (e.phase === "patrol") {
        e.x += e.vx * dt * sm;
        e.bobPhase += 0.04 * dt;

        if (e.kind === "quad" || e.kind === "recon") {
          e.y = e.baseY + Math.sin(e.bobPhase) * (e.kind === "recon" ? 8 : 12);
        } else if (e.kind === "fpv") {
          e.y = e.baseY + Math.sin(e.bobPhase * 1.4) * 14;
        } else if (e.kind === "cargo") {
          e.y = e.baseY + Math.sin(e.bobPhase * 0.5) * 4;
        } else {
          e.y = e.baseY + Math.sin(e.bobPhase * 0.6) * 6;
        }

        if (!skipHoming && centerX < targetX - 16) {
          e.phase = "homing";
          e.homingSince = this.timeMs;
        } else if (e.x + e.w < this.cameraX - 80) {
          e.active = false;
        }
        continue;
      }

      const cfg = DRONE_HOMING[e.kind as keyof typeof DRONE_HOMING];
      const ecx = e.x + e.w / 2;
      const ecy = e.y + e.h / 2;
      const dx = targetX - ecx;
      const dy = targetY - ecy;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = dx / dist;
      const ny = dy / dist;

      const ramp = Math.min(1, (this.timeMs - e.homingSince) / 600);
      const steer = cfg.steer * (0.55 + ramp * 0.45);
      const speed = cfg.speed * (0.75 + ramp * 0.35) * sm;

      e.x += nx * speed * steer * dt * 16;
      e.y += ny * speed * steer * dt * 16;
      e.bobPhase += 0.06 * dt;
      e.y += Math.sin(e.bobPhase) * cfg.bob * 0.08 * dt;

      e.y = Math.max(48, Math.min(groundY - e.h - 8, e.y));

      const offLeft = e.x + e.w < this.cameraX - 160;
      const offRight = e.x > this.cameraX + VIEW_W + 160;
      const offScreen = offLeft || offRight;
      const lostChase = this.timeMs - e.homingSince > 9000 && dist > 420;
      if (offScreen && (lostChase || (offLeft && dist > 280))) {
        e.active = false;
      }
    }
  }

  private updateBombs(dt: number) {
    const groundY = this.config.level.groundY;

    for (const bomb of this.bombs) {
      if (!bomb.active) continue;

      if (!bomb.grounded) {
        if (bomb.vx) bomb.x += bomb.vx * dt;
        bomb.vy += BOMB_GRAVITY * dt;
        bomb.y += bomb.vy * dt;

        let landed = false;
        if (bomb.y >= groundY - 4) {
          if (bomb.cartoon && (bomb.bounces ?? 0) > 0) {
            bomb.y = groundY - 4;
            bomb.vy = -Math.abs(bomb.vy) * 0.55;
            bomb.bounces = (bomb.bounces ?? 0) - 1;
            if (bomb.vx) bomb.vx *= 0.92;
          } else {
            bomb.y = groundY - 4;
            landed = true;
          }
        }

        for (const plat of this.getActivePlatforms()) {
          if (
            bomb.x >= plat.x &&
            bomb.x <= plat.x + plat.w &&
            bomb.y >= plat.y - 4 &&
            bomb.y <= plat.y + 8 &&
            bomb.vy > 0
          ) {
            bomb.y = plat.y - 4;
            landed = true;
          }
        }

        if (landed) {
          bomb.grounded = true;
          bomb.vy = 0;
          bomb.fuseMs = BOMB_FUSE_MS;
        }
      } else {
        bomb.fuseMs -= dt * 16.67;
        if (bomb.fuseMs <= 0) {
          bomb.active = false;
          if (!bomb.harmless) {
            const dist = Math.hypot(this.playerX - bomb.x, this.playerY - bomb.y);
            if (dist < BOMB_RADIUS) {
              const knock = this.playerX < bomb.x ? -6 : 6;
              this.damagePlayer(1, "Red Baron bomb", knock);
            } else {
              this.bombsDodged += 1;
            }
          }
          this.emitAudio({ type: "explosion" });
          this.landmineExplosionEvents.push({
            x: bomb.x,
            groundY,
          });
        }
      }
    }

    this.bombs = this.bombs.filter((b) => b.active);
  }

  private updateNests(dtMs: number) {
    for (const nest of this.nests) {
      if (!nest.active) continue;
      if (nest.x < this.cameraX - 200 || nest.x > this.cameraX + VIEW_W + 200) continue;

      nest.spawnTimerMs -= dtMs;
      if (nest.spawnTimerMs <= 0) {
        this.spawnNestDrone(nest);
        nest.spawnTimerMs = nest.spawnIntervalMs;
      }
    }
  }

  private updateHazards(dt: number) {
    for (const h of this.hazards) {
      if (!h.active) continue;

      if (h.kind === "trash_balloon" && h.vx != null && h.baseY != null) {
        h.x += h.vx * dt;
        h.bobPhase = (h.bobPhase ?? 0) + 0.03 * dt;
        h.y = h.baseY + Math.sin(h.bobPhase) * (h.bobAmp ?? 16);
        if (h.x < this.cameraX - 80) {
          h.active = false;
          this.balloonsSurvived += 1;
        }
      }

      if (h.kind === "floating_log" && h.vx != null) {
        h.x += h.vx * dt;
        if (h.baseY != null) {
          h.bobPhase = (h.bobPhase ?? 0) + 0.024 * dt;
          h.y = h.baseY + Math.sin(h.bobPhase) * (h.bobAmp ?? 4);
        }
        const halfW = (h.w ?? FLOATING_LOG_W) / 2;
        if (h.x + halfW < this.cameraX - 100) {
          h.active = false;
        }
      }

      if (h.kind === "dynamite" && h.timerMs != null && !h.exploded) {
        h.timerMs -= dt * 16.67;
        if (h.timerMs <= 0) {
          h.exploded = true;
          h.active = false;
          this.emitAudio({ type: "explosion" });
          this.triggerExplosion(h.x, h.y, DYNAMITE_RADIUS, 2, "Dynamite blast");
        }
      }

      if (this.isSeaMine(h.kind) && h.baseY != null) {
        h.bobPhase = (h.bobPhase ?? 0) + (h.bobSpeed ?? 0.03) * dt;
        h.y = h.baseY + Math.sin(h.bobPhase) * (h.bobAmp ?? 22);

        const dist = Math.hypot(this.playerX - h.x, this.playerY - h.y);
        if (dist < SEA_MINE_SENSE_RADIUS && !this.isInvincible && !this.isRampage) {
          if (h.mineArmMs == null) h.mineArmMs = SEA_MINE_ARM_MS;
          h.mineArmMs -= dt * 16.67;
          if (h.mineArmMs <= 0) {
            this.detonateSeaMine(h, "Sea mine armed");
          }
        } else {
          h.mineArmMs = undefined;
        }
      }

      if (h.kind === "creeper_mine") {
        if (!this.isVerticalScroll()) {
          const groundY = this.config.level.groundY;
          h.y = groundY - CREEPER_MINE_H / 2 - 4;
        }

        if ((h.fireCooldownMs ?? 0) > 0) {
          h.fireCooldownMs = (h.fireCooldownMs ?? 0) - dt * 16.67;
        }

        const charging = h.chargeMs != null && h.chargeMs > 0;
        const playerAbove = this.playerY < h.y - CREEPER_MIN_Y_ABOVE;
        const playerDx = Math.abs(this.playerX - h.x);

        if (!charging) {
          h.x += (h.vx ?? -CREEPER_MINE_SPEED) * dt;
        } else {
          h.x += (h.vx ?? -CREEPER_MINE_SPEED) * dt * CREEPER_CHARGE_CRAWL_MULT;
          const stillOverhead =
            playerAbove && playerDx < CREEPER_OVERHEAD_CANCEL_HALF_W;
          if (!stillOverhead) {
            h.chargeMs = undefined;
            h.chargeMaxMs = undefined;
          } else {
            h.chargeMs = (h.chargeMs ?? 0) - dt * 16.67;
            if ((h.chargeMs ?? 0) <= 0) {
              this.fireCreeperMineBurst(h);
              h.fireCooldownMs = CREEPER_FIRE_COOLDOWN_MS;
              h.chargeMs = undefined;
              h.chargeMaxMs = undefined;
            }
          }
        }

        if (
          !charging &&
          (h.fireCooldownMs ?? 0) <= 0 &&
          playerAbove &&
          playerDx < CREEPER_OVERHEAD_HALF_W &&
          !this.isInvincible &&
          !this.isRampage
        ) {
          h.chargeMs = CREEPER_CHARGE_MS;
          h.chargeMaxMs = CREEPER_CHARGE_MS;
        }

        if (!this.isVerticalScroll() && h.x < this.cameraX - 160) {
          h.active = false;
        }
      }
    }
  }

  private triggerExplosion(x: number, y: number, radius: number, damage: number, cause: string) {
    const dist = Math.hypot(this.playerX - x, this.playerY - y);
    if (dist < radius) {
      const knock = this.playerX < x ? -6 : 6;
      this.damagePlayer(damage, cause, knock);
    }
  }

  private detonateLandmine(
    hazard: Hazard,
    cause: string,
    knockX: number,
    popupText = "BOOM!",
  ) {
    if (!hazard.active) return;
    hazard.active = false;
    hazard.exploded = true;
    hazard.explodeUntil = this.timeMs + LANDMINE_EXPLODE_MS;
    this.emitAudio({ type: "explosion" });
    this.landmineExplosionEvents.push({
      x: hazard.x,
      groundY: this.config.level.groundY,
    });

    if (this.isRampage) {
      this.showPopup("STOMP!", 500);
      return;
    }

    this.damagePlayer(1, cause, knockX);
    this.showPopup(popupText, popupText === "BAD CHOMP!" ? 1200 : 900);
  }

  private updateTongue() {
    if (this.timeMs >= this.tongueUntil) {
      this.tongueTarget = null;
      return;
    }

    const { tip } = this.tongueCurve();
    const tipRect: Rect = {
      x: tip.x - TONGUE_TIP_RADIUS,
      y: tip.y - TONGUE_TIP_RADIUS,
      w: TONGUE_TIP_RADIUS * 2,
      h: TONGUE_TIP_RADIUS * 2,
    };

    for (const enemy of this.enemies) {
      if (!enemy.active) continue;
      if (isBoomBot(enemy.kind)) continue;
      const er = enemyAttackHitRect(enemy);
      if (rectsOverlap(tipRect, er)) {
        this.destroyEnemy(enemy, "tongue");
        this.tongueUntil = this.timeMs;
        this.tongueTarget = null;
      }
    }

    for (const nest of this.nests) {
      if (!nest.active) continue;
      if (rectsOverlap(tipRect, this.nestRect(nest))) {
        this.destroyNest(nest);
        this.tongueUntil = this.timeMs;
        this.tongueTarget = null;
      }
    }

    for (const pickup of this.pickups) {
      if (!pickup.active) continue;
      const pr = {
        x: pickup.x - PICKUP_SIZE / 2,
        y: pickup.y - PICKUP_SIZE,
        w: PICKUP_SIZE,
        h: PICKUP_SIZE,
      };
      if (rectsOverlap(tipRect, pr)) {
        this.collectPickup(pickup);
        this.tongueUntil = this.timeMs;
        this.tongueTarget = null;
      }
    }

    for (const hazard of this.hazards) {
      if (!hazard.active) continue;
      const groundY = this.config.level.groundY;

      if (hazard.kind === "landmine" && rectsOverlap(tipRect, landmineBodyRect(hazard, groundY))) {
        const knock = this.facing === "right" ? -4 : 4;
        this.detonateLandmine(hazard, "Tongued a landmine", knock, "BAD CHOMP!");
        this.tongueUntil = this.timeMs;
        this.tongueTarget = null;
        continue;
      }

      if (hazard.kind === "trash_balloon") {
        const br = {
          x: hazard.x - BALLOON_SIZE.w / 2,
          y: hazard.y - BALLOON_SIZE.h,
          w: BALLOON_SIZE.w,
          h: BALLOON_SIZE.h,
        };
        if (rectsOverlap(tipRect, br)) {
          hazard.active = false;
          this.applyGas("Slurped a trash balloon");
          this.tongueUntil = this.timeMs;
          this.tongueTarget = null;
        }
      }
    }
  }

  private collectPickup(pickup: Pickup) {
    pickup.active = false;
    this.addScore(PICKUP_SCORES[pickup.kind]);

    switch (pickup.kind) {
      case "range_beer":
        this.hearts = Math.min(MAX_HEARTS, this.hearts + 1);
        this.emitAudio({ type: "health_pickup", pickup: "range_beer" });
        this.showPopup("RANGE BEER +1");
        break;
      case "white_energy_drink":
        if (this.isGassed) this.gassedUntil = 0;
        this.hearts = Math.min(MAX_HEARTS, this.hearts + 1);
        this.gassedUntil = 0;
        this.speedBoostUntil = this.timeMs + SPEED_BOOST_MS;
        this.emitAudio({ type: "health_pickup", pickup: "white_energy_drink" });
        this.showPopup("WHITE ENERGY DRINK");
        break;
      case "nicotine_pouch":
        this.hearts = Math.min(MAX_HEARTS, this.hearts + 2);
        this.speedBoostUntil = this.timeMs + SPEED_BOOST_MS;
        this.emitAudio({ type: "health_pickup", pickup: "nicotine_pouch" });
        this.showPopup("NICOTINE POUCH +2");
        break;
      case "rainbow":
        this.rainbowCharges = Math.min(MAX_RAINBOW_CHARGES, this.rainbowCharges + 1);
        this.emitAudio({ type: "rainbow_pickup" });
        this.showPopup(
          this.isAbyssLevel()
            ? `UNICORN BOMB (${this.rainbowCharges})`
            : `RAINBOW (${this.rainbowCharges})`,
        );
        break;
      case "unicorn_treat":
        if (this.isHiveBossLevel()) {
          this.rainbowCharges = Math.min(MAX_RAINBOW_CHARGES, this.rainbowCharges + 1);
          this.emitAudio({ type: "rainbow_pickup" });
          this.showPopup(`RAINBOW (${this.rainbowCharges})`);
          break;
        }
        this.rampageUntil = this.timeMs + RAMPAGE_DURATION_MS;
        this.invincibleUntil = this.rampageUntil;
        this.speedBoostUntil = this.rampageUntil;
        this.triggerRampageWave();
        this.emitAudio({ type: "unicorn_treat" });
        this.showPopup("RAINBOW RAMPAGE", 2000);
        break;
      case "weapon_pistol":
        this.hasPistol = true;
        this.activeWeapon = "pistol";
        this.showPopup("PISTOL — active weapon (T / GUN to fire)", 1200);
        break;
      case "weapon_machine_gun":
        if (this.isHiveBossLevel()) {
          this.machineGunAmmo = HIVE_MG_AMMO;
          this.showPopup(`MACHINE GUN — ${HIVE_MG_AMMO} rounds`, 1400);
        } else {
          this.machineGunUntil = this.timeMs + BLASTER_DURATION_MS;
          this.showPopup("MACHINE GUN — active until you pick up another", 1400);
        }
        this.activeWeapon = "machine_gun";
        break;
      case "weapon_bazooka":
        if (this.isHiveBossLevel()) {
          this.bazookaAmmo = HIVE_BAZOOKA_AMMO;
          this.showPopup(`BAZOOKA — ${HIVE_BAZOOKA_AMMO} rockets`, 1400);
        } else {
          this.bazookaAmmo += BAZOOKA_ROCKETS_PER_PICKUP;
          this.showPopup(`BAZOOKA — ${this.bazookaAmmo} rockets, active until another pickup`, 1400);
        }
        this.activeWeapon = "bazooka";
        break;
      case "weapon_sonic":
        this.sonicCharges += SONIC_PICKUP_CHARGES;
        this.activeSwimWeapon = "sonic";
        this.showPopup(
          this.isAbyssLevel()
            ? `SONIC BOOM — ${this.sonicCharges} charges (Q to swap)`
            : `SONIC BLAST — ${this.sonicCharges} charges (Q to swap)`,
          1400,
        );
        break;
    }
  }

  private getWeaponHudLabel(): string | null {
    if (this.isSwimLevel()) {
      if (this.activeSwimWeapon === "sonic" && this.sonicCharges > 0) {
        return `SONIC x${this.sonicCharges}`;
      }
      return "HARPOON ∞";
    }
    if (!this.weaponsEnabled()) return null;
    this.syncActiveWeapon();
    if (this.isHiveBossLevel()) {
      if (this.activeWeapon === "machine_gun" && this.machineGunAmmo > 0) {
        return `MG x${this.machineGunAmmo}`;
      }
      if (this.activeWeapon === "bazooka" && this.bazookaAmmo > 0) return `BAZOOKA x${this.bazookaAmmo}`;
      if (this.hasPistol) return "PISTOL ∞";
      return null;
    }
    if (this.activeWeapon === "machine_gun" && this.isMachineGunActive) {
      const sec = Math.max(0, Math.ceil((this.machineGunUntil - this.timeMs) / 1000));
      return `MG ${sec}s`;
    }
    if (this.activeWeapon === "bazooka" && this.bazookaAmmo > 0) return `BAZOOKA x${this.bazookaAmmo}`;
    if (this.hasPistol) return "PISTOL";
    return null;
  }

  private checkCollisions() {
    const pr = this.isSwimLevel()
      ? swimPlayerRect(this.playerX, this.playerY)
      : playerRect(this.playerX, this.playerY, this.ducking);

    for (const pickup of this.pickups) {
      if (!pickup.active) continue;
      const pkr = {
        x: pickup.x - PICKUP_SIZE / 2,
        y: pickup.y - PICKUP_SIZE,
        w: PICKUP_SIZE,
        h: PICKUP_SIZE,
      };
      if (rectsOverlap(pr, pkr)) this.collectPickup(pickup);
    }

    for (const enemy of this.enemies) {
      if (!enemy.active || enemy.cosmetic) continue;
      const er = { x: enemy.x, y: enemy.y, w: enemy.w, h: enemy.h };
      if (rectsOverlap(pr, er)) {
        if (this.isRampage) {
          this.destroyEnemy(enemy, "rampage");
        } else if (isBoomBot(enemy.kind)) {
          if (!this.isInvincible && this.timeMs >= this.hitFlashUntil) {
            this.emitAudio({ type: "explosion" });
          }
          this.boomBotContactExplode(enemy);
        } else {
          if (!this.isInvincible && this.timeMs >= this.hitFlashUntil) {
            this.emitAudio({ type: "explosion" });
          }
          this.damagePlayer(
            this.enemyCollisionDamage(enemy.kind),
            enemy.kind === "laser_shark"
              ? "Laser shark ram"
              : enemy.kind === "laser_gator"
                ? "Kamikaze gator"
                : `${enemy.kind} drone collision`,
            enemy.vx > 0 ? 4 : -4,
          );
          enemy.active = false;
        }
      }
    }

    for (const nest of this.nests) {
      if (!nest.active) continue;
      if (rectsOverlap(pr, this.nestRect(nest)) && this.isRampage) {
        this.destroyNest(nest);
      }
    }

    for (const hazard of this.hazards) {
      if (!hazard.active) continue;

      if (hazard.kind === "landmine") {
        const groundY = this.config.level.groundY;
        if (
          playerOverlapsLandmine(
            this.playerX,
            this.playerY,
            this.prevPlayerX,
            groundY,
            hazard,
            this.ducking,
          )
        ) {
          const knock = this.playerX < hazard.x ? -8 : 8;
          this.detonateLandmine(hazard, "Landmine", knock);
        }
      }

      if (hazard.kind === "trash_balloon") {
        const br = {
          x: hazard.x - BALLOON_SIZE.w / 2,
          y: hazard.y - BALLOON_SIZE.h,
          w: BALLOON_SIZE.w,
          h: BALLOON_SIZE.h,
        };
        if (rectsOverlap(pr, br)) {
          hazard.active = false;
          this.applyGas("Trash balloon collision");
        }
      }

      if (hazard.kind === "creeper_mine") {
        const cr = this.hazardGunRect(hazard);
        if (cr && rectsOverlap(pr, cr)) {
          if (this.isRampage) {
            this.destroyCreeperMine(hazard, "Rampage stomp");
            this.showPopup("CRUSHED!", 600);
          } else if (!this.isInvincible && this.timeMs >= this.hitFlashUntil) {
            this.damagePlayer(1, "Creeper mine collision", hazard.vx && hazard.vx > 0 ? 4 : -4);
          }
        }
      }
    }
  }

  private checkExtraction() {
    if (this.config.victoryCondition === "boss_defeated") return;
    if (this.playerX < this.config.extractionX) return;
    if (!this.isExtractionUnlocked()) {
      if (this.timeMs >= this.extractionBlockedPopupUntil) {
        this.showPopup("Hold the line — clear the nests or survive the final wave!", 1500);
        this.extractionBlockedPopupUntil = this.timeMs + 3200;
      }
      return;
    }
    this.extractionReached = true;
    this.playerVx = 0;
  }

  private updateCamera() {
    if (this.finaleShakeMag > 0) {
      this.cameraShakeX = (Math.random() - 0.5) * this.finaleShakeMag * 2.4;
      this.cameraShakeY = (Math.random() - 0.5) * this.finaleShakeMag * 1.6;
    } else {
      this.cameraShakeX = 0;
      this.cameraShakeY = 0;
    }

    if (this.isVerticalScroll()) {
      if (this.arenaLocked && this.abyssBoss?.isArenaLocked()) {
        this.cameraY = ABYSS_ARENA_Y - 60;
        this.cameraX = 0;
        return;
      }
      const targetCam = this.playerY - VIEW_H * 0.55;
      if (this.abyssBoss?.engaged && !this.abyssBoss.isArenaLocked()) {
        this.cameraY = this.abyssBoss.getEffectiveCameraY(this.playerY);
      } else if (this.abyssBoss?.engaged) {
        this.cameraY = Math.min(targetCam, this.abyssBoss.getMinCameraY());
      } else {
        this.cameraY = this.playerY - VIEW_H * 0.32;
      }
      this.cameraY = Math.max(ABYSS_SURFACE_Y, this.cameraY);
      this.cameraX = 0;
      return;
    }

    if (this.arenaLocked && this.hiveBoss?.active) {
      this.cameraX = this.hiveBoss.getArenaBounds().cameraX;
      return;
    }
    const target = this.playerX - VIEW_W * 0.35;
    this.cameraX = Math.max(0, Math.min(this.config.level.levelWidth - VIEW_W, target));
  }

  getHud(): RainbowCowboyHudSnapshot {
    const hiveState = this.hiveBoss?.getState();
    const abyssState = this.abyssBoss?.getState();
    const bossState =
      abyssState?.engaged && abyssState.mode === "arena" && abyssState.active && !abyssState.defeated
        ? abyssState
        : hiveState?.active && !hiveState.defeated
          ? hiveState
          : null;
    return {
      hearts: this.hearts,
      maxHearts: MAX_HEARTS,
      score: this.score,
      rainbowCharges: this.rainbowCharges,
      elapsedSeconds: Math.floor((performance.now() - this.startTimeMs) / 1000),
      status: this.status,
      gassed: this.isGassed,
      rampage: this.isRampage,
      popupText: this.timeMs < this.popupUntil ? this.popupText : null,
      popupUntil: this.popupUntil,
      blasterActive: this.activeWeapon === "machine_gun" && this.isMachineGunActive,
      blasterSecondsLeft: Math.max(
        0,
        Math.ceil((this.machineGunUntil - this.timeMs) / 1000),
      ),
      weaponLabel: this.getWeaponHudLabel(),
      bazookaAmmo: this.bazookaAmmo,
      bossHp: bossState ? bossState.hp : null,
      bossMaxHp: bossState ? bossState.maxHp : null,
      bossPhase: bossState ? bossState.phase : null,
      bossHatchOpen:
        bossState && "bodyVulnerable" in bossState
          ? bossState.bodyVulnerable
          : bossState && "vulnerable" in bossState
            ? bossState.vulnerable
            : null,
      bossSegments:
        bossState && "tentaclesDestroyed" in bossState
          ? ABYSS_TENTACLE_COUNT - bossState.tentaclesDestroyed
          : bossState && "segments" in bossState
            ? bossState.segments
            : null,
      machineGunAmmo: this.isHiveBossLevel() ? this.machineGunAmmo : null,
    };
  }

  buildResult(): RainbowCowboyRunResult {
    const durationSeconds = Math.floor((performance.now() - this.startTimeMs) / 1000);
    return buildRainbowCowboyRunResult({
      levelId: this.config.level.id,
      levelSlug: this.config.level.slug,
      baseScore: this.score,
      heartsRemaining: this.hearts,
      maxHearts: MAX_HEARTS,
      damageTaken: this.damageTaken,
      dronesEaten: this.dronesEaten,
      balloonsSurvived: this.balloonsSurvived,
      rainbowBlastsUsed: this.rainbowBlastsUsed,
      redBaronsDestroyed: this.redBaronsDestroyed,
      nestsDestroyed: this.nestsDestroyed,
      bombsDodged: this.bombsDodged,
      durationSeconds,
      targetTimeSeconds: this.config.level.targetTimeSeconds,
      completed: this.phase === "complete",
      completeBanner: this.config.completeBanner,
      deathCause: this.deathCause,
      difficulty: this.config.difficulty ?? "easy",
      hiveBossDamage: this.hiveBoss?.bossDamageDealt,
      abyssBossDamage: this.abyssBoss?.bossDamageDealt,
    });
  }

  getTongueCurve(): {
    x1: number;
    y1: number;
    cx: number;
    cy: number;
    x2: number;
    y2: number;
    tipX: number;
    tipY: number;
    progress: number;
  } | null {
    if (this.timeMs >= this.tongueUntil) return null;
    const { mouth, control, end, tip, progress } = this.tongueCurve();
    return {
      x1: mouth.x,
      y1: mouth.y,
      cx: control.x,
      cy: control.y,
      x2: end.x,
      y2: end.y,
      tipX: tip.x,
      tipY: tip.y,
      progress,
    };
  }
}
