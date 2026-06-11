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
  VIEW_H,
  VIEW_W,
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
import type {
  RainbowCowboyEnemyKind,
  RainbowCowboyGamePhase,
  RainbowCowboyHazardKind,
  RainbowCowboyHudSnapshot,
  RainbowCowboyPickupKind,
  RainbowCowboyRunResult,
  WeaponKind,
} from "./rainbowCowboyTypes";
import type { UnicornHeroAudioEvent } from "../unicorn-hero/unicornHeroAudio";
import type { UnicornHeroRideType } from "../unicorn-hero/unicornHeroRides";
import {
  getRideBadAttackPopup,
  getRideStatusAttack,
  getRideStatusRiding,
} from "../unicorn-hero/unicornHeroRides";

/** Bumped when engine internals change so HMR can replace stale instances. */
export const RAINBOW_COWBOY_ENGINE_REVISION = 16;

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
  pausePressed: boolean;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type EnemyPhase = "patrol" | "homing";

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
}

interface BlasterProjectile {
  id: string;
  x: number;
  y: number;
  vx: number;
  active: boolean;
  weapon: WeaponKind;
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
}

interface EnemyBullet {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  active: boolean;
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
}

interface SpawnDef {
  kind: RainbowCowboyEnemyKind;
  triggerX: number;
  y: number;
  delayMs: number;
  triggeredAt: number | null;
  spawned: boolean;
  popupOnSpawn?: string;
  finalWave?: boolean;
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
  machineGunUntil = 0;
  bazookaAmmo = 0;
  gunCooldownUntil = 0;
  lastGunFireMs = 0;
  lastGunWeapon: WeaponKind | null = null;

  blasterProjectiles: BlasterProjectile[] = [];
  enemyBullets: EnemyBullet[] = [];
  finalWaveSurvived = false;
  finalWaveTriggered = false;
  finalWaveSpawns: SpawnDef[] = [];
  extractionBlockedPopupUntil = 0;

  popupText: string | null = null;
  popupUntil = 0;
  status = "Riding!";
  deathCause: string | undefined;

  rainbowBlastUntil = 0;
  cameraX = 0;

  enemies: Enemy[] = [];
  pickups: Pickup[] = [];
  hazards: Hazard[] = [];
  spawns: SpawnDef[] = [];
  bombs: Bomb[] = [];
  nests: Nest[] = [];
  warnings: WarningDef[] = [];

  extractionReached = false;
  levelCompleteHold = 0;
  landmineExplosionEvents: { x: number; groundY: number }[] = [];
  audioEvents: UnicornHeroAudioEvent[] = [];

  constructor(config: LevelConfig, rideType: UnicornHeroRideType = "eod_robot") {
    this.config = config;
    this.rideType = rideType;
    this.playerY = config.level.groundY;
    this.initLevel();
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
      return hazard;
    });

    this.spawns = this.config.enemies.map((e) => ({
      kind: e.kind,
      triggerX: e.triggerX,
      y: e.y,
      delayMs: e.delayMs ?? 0,
      triggeredAt: null,
      spawned: false,
      popupOnSpawn: e.popupOnSpawn,
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
    this.extractionBlockedPopupUntil = 0;
    this.hasPistol = false;
    this.machineGunUntil = 0;
    this.bazookaAmmo = 0;
    if (this.weaponsEnabled()) {
      this.hasPistol = true;
    }
    this.gunCooldownUntil = 0;
    this.lastGunFireMs = 0;
    this.lastGunWeapon = null;
    this.landmineExplosionEvents = [];
    this.prevPlayerX = this.playerX;
    this.startTimeMs = performance.now();
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
    return this.timeMs < this.machineGunUntil;
  }

  get activeTimedWeapon(): WeaponKind | null {
    if (this.isMachineGunActive) return "machine_gun";
    return null;
  }

  private weaponsEnabled(): boolean {
    return this.config.level.id === "level-3";
  }

  private difficultySpeed(): number {
    return this.config.difficultySpeedMult ?? 1;
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
      this.updatePhysics(dt);
      this.updateCamera();
      return;
    }

    this.processSpawns();
    this.processFinalWave();
    this.processWarnings();
    this.handleInput(input, dt);
    this.updatePhysics(dt);
    this.updateEnemies(dt, dtMs);
    this.updateBlasterProjectiles(dt);
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
    if (this.timeMs < this.popupUntil && this.popupText) return;
    if (this.isRampage) this.status = "RAINBOW RAMPAGE";
    else if (this.isGassed) this.status = "Gassed…";
    else if (this.ducking && this.grounded) this.status = "Ducking";
    else if (this.timeMs < this.tongueUntil) this.status = getRideStatusAttack(this.rideType);
    else if (this.isMachineGunActive) this.status = "MG SPRAY";
    else if (this.bazookaAmmo > 0) this.status = `BAZOOKA x${this.bazookaAmmo}`;
    else if (this.hasPistol) this.status = "PISTOL READY";
    else if (this.grounded) this.status = getRideStatusRiding(this.rideType);
    else this.status = "Airborne";
  }

  private processWarnings() {
    for (const w of this.warnings) {
      if (w.fired) continue;
      if (this.playerX >= w.triggerX) {
        w.fired = true;
        this.showPopup(w.message, 1800);
      }
    }
  }

  private createEnemyFromSpawn(spawn: Pick<SpawnDef, "kind" | "y" | "popupOnSpawn">, spawnX: number): Enemy {
    const groundY = this.config.level.groundY;
    const size = ENEMY_SIZES[spawn.kind];
    const ground = isGroundEnemy(spawn.kind);
    const enemy: Enemy = {
      id: nextId(),
      kind: spawn.kind,
      x: spawnX,
      y: ground ? groundY - size.h : spawn.y,
      baseY: ground ? groundY - size.h : spawn.y,
      w: size.w,
      h: size.h,
      vx: ground ? 0 : ENEMY_SPEEDS[spawn.kind as keyof typeof ENEMY_SPEEDS],
      active: true,
      bobPhase: Math.random() * 6,
      phase: "patrol",
      homingSince: 0,
      groundUnit: ground,
    };

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
      if (this.playerX < spawn.triggerX) continue;
      if (spawn.triggeredAt == null) spawn.triggeredAt = this.timeMs;
      if (this.timeMs - spawn.triggeredAt < spawn.delayMs) continue;
      spawn.spawned = true;
      const spawnX = isGroundEnemy(spawn.kind)
        ? this.playerX + VIEW_W * 0.58
        : this.playerX + VIEW_W * 0.65;
      this.enemies.push(this.createEnemyFromSpawn(spawn, spawnX));
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
    return isBoomBot(kind) ? 2 : 1;
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
    return null;
  }

  private hitHazardWithGun(hazard: Hazard, weapon: WeaponKind) {
    if (!hazard.active) return;
    const groundY = this.config.level.groundY;

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
    if (!this.weaponsEnabled()) return;
    if (this.timeMs < this.gunCooldownUntil) return;

    let weapon: WeaponKind | null = null;

    if (this.isMachineGunActive && (held || fromEdge)) {
      weapon = "machine_gun";
    } else if (!this.isMachineGunActive && this.bazookaAmmo > 0 && fromEdge) {
      weapon = "bazooka";
    } else if (!this.isMachineGunActive && this.bazookaAmmo <= 0 && this.hasPistol && fromEdge) {
      weapon = "pistol";
    } else if (fromEdge && !this.hasPistol && !this.isMachineGunActive && this.bazookaAmmo <= 0) {
      return;
    } else {
      return;
    }

    if (weapon === "bazooka") {
      this.bazookaAmmo -= 1;
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

  private updateEnemyBullets(dt: number) {
    const cam = this.cameraX;
    const pr = playerRect(this.playerX, this.playerY, this.ducking);

    for (const bullet of this.enemyBullets) {
      if (!bullet.active) continue;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;

      if (bullet.x < cam - 60 || bullet.x > cam + VIEW_W + 60) {
        bullet.active = false;
        continue;
      }

      const br: Rect = {
        x: bullet.x - ENEMY_BULLET_RADIUS,
        y: bullet.y - ENEMY_BULLET_RADIUS,
        w: ENEMY_BULLET_RADIUS * 2,
        h: ENEMY_BULLET_RADIUS * 2,
      };
      if (rectsOverlap(pr, br) && !this.isInvincible && this.timeMs >= this.hitFlashUntil) {
        bullet.active = false;
        const knock = bullet.vx > 0 ? 5 : -5;
        this.damagePlayer(1, "Turret truck shot", knock);
      }
    }

    this.enemyBullets = this.enemyBullets.filter((b) => b.active);
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
        const er = { x: enemy.x, y: enemy.y, w: enemy.w, h: enemy.h };
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

  private handleInput(input: GameInput, dt: number) {
    if (this.phase !== "playing") return;

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
    }
  }

  private updatePhysics(dt: number) {
    const groundY = this.config.level.groundY;
    const levelW = this.config.level.levelWidth;

    this.playerVy += GRAVITY * dt;
    this.playerX += this.playerVx * dt;
    this.playerY += this.playerVy * dt;

    this.playerX = Math.max(PLAYER_W / 2, Math.min(levelW - PLAYER_W / 2, this.playerX));

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

    for (const plat of this.config.platforms) {
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

  private updateEnemies(dt: number, dtMs: number) {
    const targetX = this.playerX;
    const targetY = this.playerY - PLAYER_H * 0.45;
    const groundY = this.config.level.groundY;
    const sm = this.difficultySpeed();

    for (const e of this.enemies) {
      if (!e.active) continue;

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

        for (const plat of this.config.platforms) {
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
          const dist = Math.hypot(this.playerX - bomb.x, this.playerY - bomb.y);
          if (dist < BOMB_RADIUS) {
            const knock = this.playerX < bomb.x ? -6 : 6;
            this.damagePlayer(1, "Red Baron bomb", knock);
          } else {
            this.bombsDodged += 1;
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

      if (h.kind === "dynamite" && h.timerMs != null && !h.exploded) {
        h.timerMs -= dt * 16.67;
        if (h.timerMs <= 0) {
          h.exploded = true;
          h.active = false;
          this.emitAudio({ type: "explosion" });
          this.triggerExplosion(h.x, h.y, DYNAMITE_RADIUS, 2, "Dynamite blast");
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
      const er = { x: enemy.x, y: enemy.y, w: enemy.w, h: enemy.h };
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
        this.showPopup(`RAINBOW (${this.rainbowCharges})`);
        break;
      case "unicorn_treat":
        this.rampageUntil = this.timeMs + RAMPAGE_DURATION_MS;
        this.invincibleUntil = this.rampageUntil;
        this.speedBoostUntil = this.rampageUntil;
        this.emitAudio({ type: "unicorn_treat" });
        this.showPopup("RAINBOW RAMPAGE", 2000);
        break;
      case "weapon_pistol":
        this.hasPistol = true;
        this.showPopup("PISTOL — default weapon (T / C to fire)", 1200);
        break;
      case "weapon_machine_gun":
        this.machineGunUntil = this.timeMs + BLASTER_DURATION_MS;
        this.showPopup("MACHINE GUN — 20s spray, then back to pistol", 1400);
        break;
      case "weapon_bazooka":
        this.bazookaAmmo += BAZOOKA_ROCKETS_PER_PICKUP;
        this.showPopup(`BAZOOKA — ${this.bazookaAmmo} rockets, then back to pistol`, 1400);
        break;
    }
  }

  private getWeaponHudLabel(): string | null {
    if (!this.weaponsEnabled()) return null;
    if (this.isMachineGunActive) {
      const sec = Math.max(0, Math.ceil((this.machineGunUntil - this.timeMs) / 1000));
      return `MG ${sec}s`;
    }
    if (this.bazookaAmmo > 0) return `BAZOOKA x${this.bazookaAmmo}`;
    if (this.hasPistol) return "PISTOL";
    return null;
  }

  private checkCollisions() {
    const pr = playerRect(this.playerX, this.playerY, this.ducking);

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
      if (!enemy.active) continue;
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
            `${enemy.kind} drone collision`,
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
    }
  }

  private checkExtraction() {
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
    const target = this.playerX - VIEW_W * 0.35;
    this.cameraX = Math.max(0, Math.min(this.config.level.levelWidth - VIEW_W, target));
  }

  getHud(): RainbowCowboyHudSnapshot {
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
      blasterActive: this.isMachineGunActive,
      blasterSecondsLeft: Math.max(
        0,
        Math.ceil((this.machineGunUntil - this.timeMs) / 1000),
      ),
      weaponLabel: this.getWeaponHudLabel(),
      bazookaAmmo: this.bazookaAmmo,
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
