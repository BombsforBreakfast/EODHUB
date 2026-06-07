import {
  BALLOON_ALTITUDE,
  BALLOON_SIZE,
  DYNAMITE_RADIUS,
  DYNAMITE_SIZE,
  LANDMINE_EXPLODE_MS,
  LANDMINE_RADIUS,
  DRONE_HOMING,
  ENEMY_SIZES,
  ENEMY_SPEEDS,
  GASSED_DURATION_MS,
  GASSED_MOVE_MULT,
  GRAVITY,
  INVINCIBLE_FLASH_MS,
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
  TONGUE_LENGTH,
  VIEW_H,
  VIEW_W,
} from "./rainbowCowboyConstants";
import {
  DRONE_SCORES,
  PICKUP_SCORES,
  RAINBOW_BLAST_BONUS,
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
} from "./rainbowCowboyTypes";

/** Bumped when engine internals change so HMR can replace stale instances. */
export const RAINBOW_COWBOY_ENGINE_REVISION = 2;

export interface GameInput {
  left: boolean;
  right: boolean;
  jumpPressed: boolean;
  tonguePressed: boolean;
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
}

let entityId = 0;
function nextId() {
  entityId += 1;
  return `e${entityId}`;
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function playerRect(x: number, y: number): Rect {
  return { x: x - PLAYER_W / 2, y: y - PLAYER_H, w: PLAYER_W, h: PLAYER_H };
}

function landmineBodyRect(hazard: Hazard, groundY: number): Rect {
  const r = LANDMINE_RADIUS;
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
): boolean {
  const triggerR = LANDMINE_RADIUS + 10;
  if (playerY < groundY - 32 || playerY > groundY + 8) return false;

  const sweepLeft = Math.min(playerX, prevPlayerX) - PLAYER_W / 2;
  const sweepRight = Math.max(playerX, prevPlayerX) + PLAYER_W / 2;
  const mineLeft = hazard.x - triggerR;
  const mineRight = hazard.x + triggerR;
  return sweepLeft < mineRight && sweepRight > mineLeft;
}

export class RainbowCowboyEngine {
  config: LevelConfig;
  phase: RainbowCowboyGamePhase = "playing";
  timeMs = 0;
  startTimeMs = 0;

  playerX = 120;
  playerY = 0;
  prevPlayerX = 120;
  playerVx = 0;
  playerVy = 0;
  grounded = false;
  facing: "left" | "right" = "right";

  hearts = MAX_HEARTS;
  score = 0;
  rainbowCharges = 0;
  damageTaken = 0;
  dronesEaten = 0;
  balloonsSurvived = 0;
  rainbowBlastsUsed = 0;
  balloonsSpawned = 0;

  gassedUntil = 0;
  rampageUntil = 0;
  speedBoostUntil = 0;
  invincibleUntil = 0;
  hitFlashUntil = 0;
  knockbackVx = 0;

  tongueUntil = 0;
  tongueCooldownUntil = 0;

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

  extractionReached = false;
  levelCompleteHold = 0;
  landmineExplosionEvents: { x: number; groundY: number }[] = [];

  constructor(config: LevelConfig) {
    this.config = config;
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
    }));

    this.enemies = [];
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

  get isGassed(): boolean {
    return this.timeMs < this.gassedUntil;
  }

  get isInvincible(): boolean {
    return this.timeMs < this.invincibleUntil || this.isRampage;
  }

  private showPopup(text: string, durationMs = 1400) {
    this.popupText = text;
    this.popupUntil = this.timeMs + durationMs;
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
    }
  }

  private applyGas(source: string) {
    this.gassedUntil = this.timeMs + GASSED_DURATION_MS;
    this.damagePlayer(1, source, -3);
    this.showPopup("BAD SLURP", 1200);
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
      this.status = "Extraction!";
      if (this.levelCompleteHold > 1800) {
        this.phase = "complete";
      }
      this.updatePhysics(dt);
      this.updateCamera();
      return;
    }

    this.processSpawns();
    this.handleInput(input, dt);
    this.updatePhysics(dt);
    this.updateEnemies(dt);
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
    else if (this.timeMs < this.tongueUntil) this.status = "SLURP!";
    else if (this.grounded) this.status = "Riding";
    else this.status = "Airborne";
  }

  private processSpawns() {
    for (const spawn of this.spawns) {
      if (spawn.spawned) continue;
      if (this.playerX < spawn.triggerX) continue;
      if (spawn.triggeredAt == null) spawn.triggeredAt = this.timeMs;
      if (this.timeMs - spawn.triggeredAt < spawn.delayMs) continue;
      spawn.spawned = true;
      const spawnX = this.playerX + VIEW_W * 0.65;
      const size = ENEMY_SIZES[spawn.kind];
      this.enemies.push({
        id: nextId(),
        kind: spawn.kind,
        x: spawnX,
        y: spawn.y,
        baseY: spawn.y,
        w: size.w,
        h: size.h,
        vx: ENEMY_SPEEDS[spawn.kind],
        active: true,
        bobPhase: Math.random() * 6,
        phase: "patrol",
        homingSince: 0,
      });
    }
  }

  private handleInput(input: GameInput, dt: number) {
    if (this.phase !== "playing") return;

    let speed = MOVE_SPEED;
    if (this.isGassed) speed *= GASSED_MOVE_MULT;
    if (this.isRampage) speed *= RAMPAGE_SPEED_MULT;
    if (this.timeMs < this.speedBoostUntil) speed *= BOOST_SPEED_MULT;

    if (input.left) {
      this.playerVx = -speed;
      this.facing = "left";
    } else if (input.right) {
      this.playerVx = speed;
      this.facing = "right";
    } else {
      this.playerVx *= 0.82;
    }

    this.playerVx += this.knockbackVx;
    this.knockbackVx *= KNOCKBACK_DECAY;

    if (input.jumpPressed && this.grounded) {
      this.playerVy = JUMP_VEL;
      this.grounded = false;
    }

    if (input.tonguePressed && this.timeMs >= this.tongueCooldownUntil) {
      this.tongueUntil = this.timeMs + TONGUE_DURATION_MS;
      this.tongueCooldownUntil = this.timeMs + TONGUE_COOLDOWN_MS;
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
    this.showPopup("RAINBOW BLAST!", 900);

    const cam = this.cameraX;
    const viewLeft = cam - 40;
    const viewRight = cam + VIEW_W + 40;

    for (const enemy of this.enemies) {
      if (!enemy.active) continue;
      if (enemy.x + enemy.w < viewLeft || enemy.x > viewRight) continue;
      enemy.active = false;
      this.dronesEaten += 1;
      this.addScore(DRONE_SCORES[enemy.kind] + RAINBOW_BLAST_BONUS);
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

    const pr = playerRect(this.playerX, this.playerY);
    this.grounded = false;

    if (this.playerY >= groundY) {
      this.playerY = groundY;
      this.playerVy = 0;
      this.grounded = true;
    }

    for (const wall of this.config.walls) {
      const wr = { x: wall.x, y: wall.y, w: wall.w, h: wall.h };
      if (rectsOverlap(pr, wr)) {
        if (this.playerVy > 0 && pr.y + pr.h - this.playerVy * dt <= wr.y + 4) {
          this.playerY = wr.y;
          this.playerVy = 0;
          this.grounded = true;
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
        }
      }
    }
  }

  private updateEnemies(dt: number) {
    const targetX = this.playerX;
    const targetY = this.playerY - PLAYER_H * 0.45;

    for (const e of this.enemies) {
      if (!e.active) continue;

      const centerX = e.x + e.w / 2;

      if (e.phase === "patrol") {
        e.x += e.vx * dt;
        e.bobPhase += 0.04 * dt;

        if (e.kind === "quad") {
          e.y = e.baseY + Math.sin(e.bobPhase) * 12;
        } else if (e.kind === "fpv") {
          e.y = e.baseY + Math.sin(e.bobPhase * 1.4) * 14;
        } else {
          e.y = e.baseY + Math.sin(e.bobPhase * 0.6) * 6;
        }

        // First pass complete — drone has crossed the player and starts tracking
        if (centerX < targetX - 16) {
          e.phase = "homing";
          e.homingSince = this.timeMs;
        } else if (e.x + e.w < this.cameraX - 80) {
          e.active = false;
        }
        continue;
      }

      // Homing — curve back toward the rider after the opening fly-by
      const cfg = DRONE_HOMING[e.kind];
      const ecx = e.x + e.w / 2;
      const ecy = e.y + e.h / 2;
      const dx = targetX - ecx;
      const dy = targetY - ecy;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = dx / dist;
      const ny = dy / dist;

      const ramp = Math.min(1, (this.timeMs - e.homingSince) / 600);
      const steer = cfg.steer * (0.55 + ramp * 0.45);
      const speed = cfg.speed * (0.75 + ramp * 0.35);

      e.x += nx * speed * steer * dt * 16;
      e.y += ny * speed * steer * dt * 16;
      e.bobPhase += 0.06 * dt;
      e.y += Math.sin(e.bobPhase) * cfg.bob * 0.08 * dt;

      e.y = Math.max(48, Math.min(this.config.level.groundY - e.h - 8, e.y));

      const offLeft = e.x + e.w < this.cameraX - 160;
      const offRight = e.x > this.cameraX + VIEW_W + 160;
      const offScreen = offLeft || offRight;
      const lostChase = this.timeMs - e.homingSince > 9000 && dist > 420;
      if (offScreen && (lostChase || (offLeft && dist > 280))) {
        e.active = false;
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
    if (this.timeMs >= this.tongueUntil) return;

    const tongueY = this.playerY - PLAYER_H * 0.55;
    const dir = this.facing === "right" ? 1 : -1;
    const startX = this.playerX + dir * (PLAYER_W * 0.35);
    const endX = startX + dir * TONGUE_LENGTH;
    const tongueRect: Rect = {
      x: Math.min(startX, endX),
      y: tongueY - 10,
      w: Math.abs(endX - startX),
      h: 20,
    };

    for (const enemy of this.enemies) {
      if (!enemy.active) continue;
      const er = { x: enemy.x, y: enemy.y, w: enemy.w, h: enemy.h };
      if (rectsOverlap(tongueRect, er)) {
        enemy.active = false;
        this.dronesEaten += 1;
        this.addScore(DRONE_SCORES[enemy.kind]);
        this.showPopup("CHOMP!", 600);
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
      if (rectsOverlap(tongueRect, pr)) {
        this.collectPickup(pickup);
      }
    }

    for (const hazard of this.hazards) {
      if (!hazard.active) continue;
      const groundY = this.config.level.groundY;

      if (hazard.kind === "landmine" && rectsOverlap(tongueRect, landmineBodyRect(hazard, groundY))) {
        const knock = this.facing === "right" ? -4 : 4;
        this.detonateLandmine(hazard, "Tongued a landmine", knock, "BAD CHOMP!");
        continue;
      }

      if (hazard.kind === "trash_balloon") {
        const br = {
          x: hazard.x - BALLOON_SIZE.w / 2,
          y: hazard.y - BALLOON_SIZE.h,
          w: BALLOON_SIZE.w,
          h: BALLOON_SIZE.h,
        };
        if (rectsOverlap(tongueRect, br)) {
          hazard.active = false;
          this.applyGas("Slurped a trash balloon");
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
        this.showPopup("RANGE BEER +1");
        break;
      case "white_monster":
        this.hearts = Math.min(MAX_HEARTS, this.hearts + 1);
        this.gassedUntil = 0;
        this.speedBoostUntil = this.timeMs + SPEED_BOOST_MS;
        this.showPopup("WHITE MONSTER");
        break;
      case "zyn_tin":
        this.hearts = Math.min(MAX_HEARTS, this.hearts + 2);
        this.speedBoostUntil = this.timeMs + SPEED_BOOST_MS;
        this.showPopup("ZYN TIN +2");
        break;
      case "rainbow":
        this.rainbowCharges = Math.min(MAX_RAINBOW_CHARGES, this.rainbowCharges + 1);
        this.showPopup("RAINBOW READY");
        break;
      case "unicorn_treat":
        this.rampageUntil = this.timeMs + RAMPAGE_DURATION_MS;
        this.invincibleUntil = this.rampageUntil;
        this.speedBoostUntil = this.rampageUntil;
        this.showPopup("RAINBOW RAMPAGE", 2000);
        break;
    }
  }

  private checkCollisions() {
    const pr = playerRect(this.playerX, this.playerY);

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
          enemy.active = false;
          this.dronesEaten += 1;
          this.addScore(DRONE_SCORES[enemy.kind]);
        } else {
          const dmg = enemy.kind === "fpv" ? 2 : 1;
          this.damagePlayer(dmg, `${enemy.kind} drone collision`, enemy.vx > 0 ? 4 : -4);
        }
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
    if (this.playerX >= this.config.extractionX) {
      this.extractionReached = true;
      this.playerVx = 0;
    }
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
      status: this.status,
      gassed: this.isGassed,
      rampage: this.isRampage,
      popupText: this.timeMs < this.popupUntil ? this.popupText : null,
      popupUntil: this.popupUntil,
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
      durationSeconds,
      targetTimeSeconds: this.config.level.targetTimeSeconds,
      completed: this.phase === "complete",
      deathCause: this.deathCause,
    });
  }

  getTongueSegment(): { x1: number; y1: number; x2: number; y2: number } | null {
    if (this.timeMs >= this.tongueUntil) return null;
    const dir = this.facing === "right" ? 1 : -1;
    const y = this.playerY - PLAYER_H * 0.55;
    const x1 = this.playerX + dir * (PLAYER_W * 0.35);
    return { x1, y1: y, x2: x1 + dir * TONGUE_LENGTH, y2: y };
  }
}
