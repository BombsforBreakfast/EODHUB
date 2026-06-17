import { VIEW_H, VIEW_W } from "./rainbowCowboyConstants";
import {
  HIVE_BODY_H,
  HIVE_BODY_W,
  HIVE_BOSS_DEFEATED_SCORE,
  HIVE_BOSS_DAMAGE_SCORE,
  HIVE_MAX_HP,
} from "./rainbowCowboyHiveConstants";
import {
  createHivePlanks,
  hivePlankPlatforms,
  tickHivePlanks,
  type HivePlank,
} from "./rainbowCowboyHivePlanks";
import type { BossArenaConfig } from "./rainbowCowboyTypes";
import type { RainbowCowboyEnemyKind, RainbowCowboyPickupKind } from "./rainbowCowboyTypes";

export type HiveBossPhase = 1 | 2 | 3 | 4;

const GROUND_DRONE_KINDS: RainbowCowboyEnemyKind[] = [
  "boom_bot",
  "armored_boom_bot",
  "grenade_goblin_bot",
];

const HIVE_DRONE_TABLE: { kind: RainbowCowboyEnemyKind; weight: number; minPhase: HiveBossPhase }[] =
  [
    { kind: "quad", weight: 14, minPhase: 1 },
    { kind: "recon", weight: 10, minPhase: 1 },
    { kind: "fpv", weight: 12, minPhase: 2 },
    { kind: "fixed_wing", weight: 8, minPhase: 2 },
    { kind: "cargo", weight: 6, minPhase: 2 },
    { kind: "boom_bot", weight: 10, minPhase: 2 },
    { kind: "red_baron", weight: 8, minPhase: 3 },
    { kind: "grenade_goblin_bot", weight: 8, minPhase: 3 },
    { kind: "armored_boom_bot", weight: 7, minPhase: 4 },
  ];

function isGroundDrone(kind: RainbowCowboyEnemyKind): boolean {
  return GROUND_DRONE_KINDS.includes(kind);
}

export type HiveBossPublicState = {
  active: boolean;
  defeated: boolean;
  collapsing: boolean;
  collapseLabel: string | null;
  hp: number;
  maxHp: number;
  phase: HiveBossPhase;
  x: number;
  y: number;
  hatchOpen: boolean;
  hatchOpenAmount: number;
  enraged: boolean;
  aggressionLevel: number;
  movingLeft: boolean;
  tilt: number;
  telegraph: boolean;
  smoke: boolean;
  sparks: boolean;
  eyesNarrow: boolean;
  alarmFlash: boolean;
  vulnerable: boolean;
  segments: number;
  hitFlash: boolean;
  collapseShake: number;
  collapseBlackout: number;
  collapseEpilogue: boolean;
  collapseEpilogueHold: number;
  victoryMissionBanner: string | null;
};

const COLLAPSE_RUPTURE_MS = 5200;
const COLLAPSE_CASCADE_MS = 4800;
const COLLAPSE_BLACKOUT_MS = 3800;
const COLLAPSE_EPILOGUE_MS = 3400;

type SpawnEnemyFn = (kind: RainbowCowboyEnemyKind, x: number, y: number) => void;
type AddScoreFn = (points: number) => void;
type ShowPopupFn = (text: string, ms?: number) => void;
type OnDefeatedFn = () => void;
type SpawnCrateFn = (x: number, y: number, kind?: RainbowCowboyPickupKind) => void;
type FireBulletFn = (x: number, y: number, vx: number, vy: number) => void;
type SpewGrenadeFn = (x: number, y: number, vx: number, vy: number, bounces?: number) => void;
type SpawnFinaleGrenadeFn = (x: number, y: number, vx: number, vy: number) => void;
type SpawnFinaleDroneFn = (
  kind: RainbowCowboyEnemyKind,
  x: number,
  y: number,
  vx: number,
  vy: number,
) => void;
type PulseFinaleFxFn = (shakeMag: number, redAlpha: number) => void;
type ClearFinaleChaosFn = () => void;
type GetCompleteBannerFn = () => string;

function px(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function drawBossGroundShadow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number) {
  px(ctx, x - w, y - 5, w * 2, 10, "rgba(0,0,0,0.22)");
}

const PHASE_PARAMS: Record<
  HiveBossPhase,
  { patrolPct: number; speed: number; attackMs: number; hatchMs: number }
> = {
  1: { patrolPct: 0.92, speed: 1.48, attackMs: 7500, hatchMs: 2750 },
  2: { patrolPct: 0.98, speed: 1.98, attackMs: 6050, hatchMs: 2420 },
  3: { patrolPct: 1, speed: 2.56, attackMs: 4750, hatchMs: 2100 },
  4: { patrolPct: 1, speed: 3.1, attackMs: 3650, hatchMs: 1760 },
};

/** Phases 1–2 unchanged; from swarm phase 3 onward, pressure drops another 10%. */
export const PHASE_3_PLUS_EASE_MULT = 0.9;

export class HiveBossController {
  active = false;
  defeated = false;
  collapsing = false;
  collapseHold = 0;
  collapsePhase: "rupture" | "cascade" | "blackout" | "epilogue" | "done" = "rupture";
  collapseSpewTimer = 0;
  victoryMissionBanner: string | null = null;
  hp = HIVE_MAX_HP;
  maxHp = HIVE_MAX_HP;
  phase: HiveBossPhase = 1;
  x = 0;
  y = 0;
  vx = 0;
  baseY = 0;
  movingLeft = false;
  tilt = 0;
  telegraphMs = 0;
  hatchOpen = false;
  hatchOpenAmount = 0;
  hatchTimerMs = 0;
  attackTimerMs = 4000;
  swarmQueue: { kind: RainbowCowboyEnemyKind; atMs: number; x: number; y: number }[] = [];
  planks: HivePlank[] = [];
  enraged = false;
  enrageMs = 0;
  enrageCooldownMs = 0;
  consecutiveHits = 0;
  hitWindowMs = 0;
  bossDamageDealt = 0;
  supplyTimerMs = 10000;
  earlyRainbowSent = false;
  popupShown = new Set<string>();
  hiveCollisionCooldownMs = 0;
  hitFlashMs = 0;
  bulletTimerMs = 1600;
  grenadeTimerMs = 4200;

  private arenaStartX = 0;
  private arenaEndX = 0;
  private arenaWidth = 0;
  private groundY = 460;
  private centerX = 0;
  private patrolMin = 0;
  private patrolMax = 0;
  private pressureMult = 1;
  private phaseParams: Record<
    HiveBossPhase,
    { patrolPct: number; speed: number; attackMs: number; hatchMs: number }
  >;

  constructor(
    private config: BossArenaConfig,
    private callbacks: {
      spawnEnemy: SpawnEnemyFn;
      addScore: AddScoreFn;
      showPopup: ShowPopupFn;
      onDefeated: OnDefeatedFn;
      spawnCrate: SpawnCrateFn;
      fireBullet: FireBulletFn;
      spewGrenade: SpewGrenadeFn;
      spawnFinaleGrenade: SpawnFinaleGrenadeFn;
      spawnFinaleDrone: SpawnFinaleDroneFn;
      pulseFinaleFx: PulseFinaleFxFn;
      clearFinaleChaos: ClearFinaleChaosFn;
      getCompleteBanner: GetCompleteBannerFn;
      getPlayerX: () => number;
      getPlayerY: () => number;
      getTimeMs: () => number;
      damagePlayer: (amount: number, cause: string, knockback?: number) => void;
    },
    pressureMult = 1,
  ) {
    this.pressureMult = pressureMult;
    this.phaseParams = { 1: PHASE_PARAMS[1], 2: PHASE_PARAMS[2], 3: PHASE_PARAMS[3], 4: PHASE_PARAMS[4] };
    if (pressureMult !== 1) {
      for (const phase of [1, 2, 3, 4] as HiveBossPhase[]) {
        const params = PHASE_PARAMS[phase];
        this.phaseParams[phase] = {
          ...params,
          speed: params.speed * pressureMult,
          attackMs: Math.round(params.attackMs / pressureMult),
          hatchMs: Math.round(params.hatchMs / pressureMult),
        };
      }
    }
    this.arenaStartX = config.triggerX;
    this.arenaWidth = config.width;
    this.arenaEndX = config.triggerX + config.width;
    this.hp = config.hiveMaxHp;
    this.maxHp = config.hiveMaxHp;
    this.centerX = this.arenaStartX + this.visibleArenaWidth() * 0.5;
    this.x = this.centerX;
  }

  private visibleArenaWidth() {
    return Math.min(this.arenaWidth, VIEW_W);
  }

  private visibleArenaEndX() {
    return this.arenaStartX + this.visibleArenaWidth();
  }

  private latePhaseEaseMult() {
    return this.phase >= 3 ? PHASE_3_PLUS_EASE_MULT : 1;
  }

  enterArena(groundY: number) {
    this.active = true;
    this.groundY = groundY;
    this.baseY = groundY - HIVE_BODY_H * 0.55;
    this.y = this.baseY;
    this.x = this.visibleArenaEndX() - HIVE_BODY_W / 2 - 90;
    this.movingLeft = true;
    this.vx = this.phaseParams[1].speed * (this.movingLeft ? -1 : 1);
    this.planks = createHivePlanks(this.arenaStartX, this.visibleArenaWidth(), groundY);
    this.supplyTimerMs = 10000;
    this.earlyRainbowSent = false;
    this.updatePatrolBounds();
    this.showPopupOnce("intro", "THE HIVE AWAKENS");
  }

  getPlankPlatforms() {
    return hivePlankPlatforms(this.planks);
  }

  private showPopupOnce(key: string, text = key) {
    if (this.popupShown.has(key)) return;
    this.popupShown.add(key);
    this.callbacks.showPopup(text, 1600);
  }

  isVulnerable() {
    return this.hatchOpen;
  }

  getState(): HiveBossPublicState {
    const ratio = this.hp / this.maxHp;
    return {
      active: this.active,
      defeated: this.defeated,
      collapsing: this.collapsing,
      collapseLabel: null,
      hp: Math.max(0, Math.round(this.hp * 10) / 10),
      maxHp: this.maxHp,
      phase: this.phase,
      x: this.x,
      y: this.y,
      hatchOpen: this.hatchOpen,
      hatchOpenAmount: this.hatchOpenAmount,
      enraged: this.enraged,
      aggressionLevel: this.phase,
      movingLeft: this.movingLeft,
      tilt: this.tilt,
      telegraph: this.telegraphMs > 0,
      smoke: ratio <= 0.75,
      sparks: ratio <= 0.5,
      eyesNarrow: ratio <= 0.75 && ratio > 0.5,
      alarmFlash: ratio <= 0.25,
      vulnerable: this.hatchOpen,
      segments: 10,
      hitFlash: this.hitFlashMs > 0,
      collapseShake:
        this.collapsing && this.collapsePhase !== "blackout" && this.collapsePhase !== "epilogue"
          ? Math.min(1, this.collapseHold / 400)
          : 0,
      collapseBlackout:
        this.collapsePhase === "blackout"
          ? Math.min(1, this.collapseHold / (COLLAPSE_BLACKOUT_MS * 0.72))
          : this.collapsePhase === "epilogue" || this.collapsePhase === "done"
            ? 1
            : 0,
      collapseEpilogue: this.collapsePhase === "epilogue",
      collapseEpilogueHold: this.collapsePhase === "epilogue" ? this.collapseHold : 0,
      victoryMissionBanner: this.victoryMissionBanner,
    };
  }

  getArenaBounds() {
    return { startX: this.arenaStartX, endX: this.visibleArenaEndX(), cameraX: this.arenaStartX };
  }

  registerHit() {
    this.consecutiveHits += 1;
    this.hitWindowMs = 2000;
    if (this.consecutiveHits >= 4 && this.enrageCooldownMs <= 0 && !this.enraged) {
      this.triggerEnrage();
    }
  }

  damage(amount: number) {
    if (!this.active || this.defeated || this.collapsing) return;
    this.hp = Math.max(0, this.hp - amount);
    this.bossDamageDealt += amount;
    if (amount > 0) {
      this.hitFlashMs = this.hatchOpen ? 140 : 90;
      this.callbacks.addScore(HIVE_BOSS_DAMAGE_SCORE);
      this.registerHit();
    }
    this.updatePhase();
    if (this.hp <= 0) this.beginCollapse();
  }

  private triggerEnrage() {
    this.enraged = true;
    this.enrageMs = 5500 + Math.random() * 2500;
    this.enrageCooldownMs = 12000;
    this.consecutiveHits = 0;
    this.callbacks.showPopup("HIVE RAGE!", 1200);
    this.updatePatrolBounds();
  }

  private updatePhase() {
    const ratio = this.hp / this.maxHp;
    const next: HiveBossPhase =
      ratio > 0.75 ? 1 : ratio > 0.5 ? 2 : ratio > 0.25 ? 3 : 4;
    if (next !== this.phase) {
      this.phase = next;
      this.showPopupOnce(`phase-${next}`, `SWARM PHASE ${next}`);
      this.updatePatrolBounds();
    }
  }

  private updatePatrolBounds() {
    const params = this.phaseParams[this.phase];
    const edgePad = 52;
    const minEdge = this.arenaStartX + HIVE_BODY_W / 2 + edgePad;
    const maxEdge = this.visibleArenaEndX() - HIVE_BODY_W / 2 - edgePad;
    const halfRange = ((maxEdge - minEdge) * params.patrolPct) / 2;
    const enrageMult = this.enraged ? 1.08 : 1;
    this.patrolMin = Math.max(minEdge, this.centerX - halfRange * enrageMult);
    this.patrolMax = Math.min(maxEdge, this.centerX + halfRange * enrageMult);
    const speed = params.speed * (this.enraged ? 1.26 : 1) * this.latePhaseEaseMult();
    this.vx = speed * (this.movingLeft ? -1 : 1);
  }

  private beginCollapse() {
    this.defeated = true;
    this.collapsing = true;
    this.collapseHold = 0;
    this.collapseSpewTimer = 0;
    this.collapsePhase = "rupture";
    this.hatchOpen = true;
    this.hatchOpenAmount = 1;
    this.vx = this.phaseParams[4].speed * 2.4 * (this.movingLeft ? -1 : 1);
    this.callbacks.showPopup("CRITICAL FAILURE!", 1400);
    this.callbacks.pulseFinaleFx(14, 0.9);
    this.spewFinaleBurst(20, 16);
  }

  private hatchEmitPoint() {
    const dir = this.movingLeft ? -1 : 1;
    return {
      x: this.x + dir * HIVE_BODY_W * 0.2,
      y: this.y - HIVE_BODY_H * 0.82,
      dir,
    };
  }

  private finaleDroneKinds(): RainbowCowboyEnemyKind[] {
    return HIVE_DRONE_TABLE.filter((entry) => !isGroundDrone(entry.kind)).map(
      (entry) => entry.kind,
    );
  }

  private spewFinaleBurst(grenadeCount: number, droneCount: number) {
    const { x: hatchX, y: hatchY, dir } = this.hatchEmitPoint();
    const kinds = this.finaleDroneKinds();
    if (kinds.length === 0) return;

    for (let i = 0; i < grenadeCount; i++) {
      const fan = grenadeCount <= 1 ? 0 : (i / (grenadeCount - 1) - 0.5) * 2;
      const vx = dir * (3.2 + Math.random() * 4.5 + Math.abs(fan) * 2.2);
      const vy = -10 - Math.random() * 9 - Math.abs(fan) * 3.5;
      this.callbacks.spawnFinaleGrenade(hatchX + fan * 20, hatchY, vx, vy);
    }

    for (let i = 0; i < droneCount; i++) {
      const kind = kinds[Math.floor(Math.random() * kinds.length)];
      const fan = (Math.random() - 0.5) * 2;
      const vx = dir * (2.2 + Math.random() * 5.5) + fan * 1.8;
      const vy = -7 - Math.random() * 11;
      this.callbacks.spawnFinaleDrone(kind, hatchX + fan * 24, hatchY - 10, vx, vy);
    }
  }

  hiveBodyRect() {
    return {
      x: this.x - HIVE_BODY_W / 2,
      y: this.y - HIVE_BODY_H,
      w: HIVE_BODY_W,
      h: HIVE_BODY_H,
    };
  }

  hiveHitRect() {
    const body = this.hiveBodyRect();
    if (this.hatchOpen) {
      return {
        x: body.x + body.w * 0.1,
        y: body.y - body.h * 0.5,
        w: body.w * 0.8,
        h: body.h * 0.72,
      };
    }
    return body;
  }

  tick(dtMs: number) {
    if (!this.active) return;

    tickHivePlanks(this.planks, dtMs, this.arenaStartX, this.visibleArenaEndX(), this.phase);

    if (this.collapsing) {
      this.tickCollapse(dtMs);
      return;
    }

    if (this.enrageMs > 0) {
      this.enrageMs -= dtMs;
      if (this.enrageMs <= 0) {
        this.enraged = false;
        this.updatePatrolBounds();
      }
    }
    if (this.enrageCooldownMs > 0) this.enrageCooldownMs -= dtMs;
    if (this.hitWindowMs > 0) {
      this.hitWindowMs -= dtMs;
      if (this.hitWindowMs <= 0) this.consecutiveHits = 0;
    }
    if (this.hiveCollisionCooldownMs > 0) this.hiveCollisionCooldownMs -= dtMs;
    if (this.hitFlashMs > 0) this.hitFlashMs -= dtMs;

    this.tickMovement(dtMs);
    this.tickHatch(dtMs);
    this.tickSwarmQueue();
    this.tickHiveCollision();
    this.tickRangedPressure(dtMs);

    this.attackTimerMs -= dtMs;
    if (this.attackTimerMs <= 0) {
      this.runAttack();
      this.attackTimerMs =
        (this.phaseParams[this.phase].attackMs * (0.85 + Math.random() * 0.3)) /
        this.latePhaseEaseMult();
    }

    this.supplyTimerMs -= dtMs;
    if (this.supplyTimerMs <= 0) {
      this.dropSupplyCrate();
      this.supplyTimerMs = this.nextSupplyIntervalMs();
    }
  }

  private randomSupplyX() {
    const visibleWidth = this.visibleArenaWidth();
    return this.arenaStartX + 120 + Math.random() * Math.max(160, visibleWidth - 240);
  }

  private nextSupplyIntervalMs() {
    const base =
      this.phase >= 4 ? 6200 : this.phase >= 3 ? 7800 : this.phase >= 2 ? 9500 : 11500;
    return Math.round(base * this.pressureMult * this.latePhaseEaseMult() + Math.random() * 2200);
  }

  private pickSupplyKind(): RainbowCowboyPickupKind {
    const r = Math.random();
    if (this.phase === 1) {
      if (r < 0.3) return "range_beer";
      if (r < 0.72) return "rainbow";
      if (r < 0.86) return "white_energy_drink";
      return "nicotine_pouch";
    }
    if (this.phase === 2) {
      if (r < 0.1) return "weapon_machine_gun";
      if (r < 0.28) return "range_beer";
      if (r < 0.62) return "rainbow";
      if (r < 0.78) return "white_energy_drink";
      return "nicotine_pouch";
    }
    if (r < 0.1) return "weapon_bazooka";
    if (r < 0.18) return "weapon_machine_gun";
    if (r < 0.3) return "range_beer";
    if (r < 0.62) return "rainbow";
    if (r < 0.74) return "white_energy_drink";
    return "nicotine_pouch";
  }

  private dropSupplyCrate() {
    const x = this.randomSupplyX();
    if (!this.earlyRainbowSent) {
      this.earlyRainbowSent = true;
      this.callbacks.spawnCrate(x, -48, "rainbow");
      this.showPopupOnce("supply-rainbow", "RAINBOW SUPPLY INBOUND");
      return;
    }
    this.callbacks.spawnCrate(x, -48, this.pickSupplyKind());
  }

  private tickCollapse(dtMs: number) {
    this.collapseHold += dtMs;
    const dt = dtMs / 16.67;

    if (this.collapsePhase === "rupture") {
      const flashPulse = Math.sin(this.collapseHold / 55) > 0.15;
      const shakeBase = 14;

      this.tilt = Math.sin(this.collapseHold / 38) * (0.22 + shakeBase * 0.018);
      this.x += Math.sin(this.collapseHold / 21) * 3.2 * dt + this.vx * dt * 0.35;
      this.callbacks.pulseFinaleFx(
        shakeBase + Math.sin(this.collapseHold / 28) * 4,
        flashPulse ? 0.82 : 0.22,
      );

      this.hatchOpenAmount = 1;
      this.vx *= 0.96;

      this.collapseSpewTimer -= dtMs;
      if (this.collapseSpewTimer <= 0) {
        this.collapseSpewTimer = 95 + Math.random() * 70;
        this.spewFinaleBurst(3 + Math.floor(Math.random() * 5), 2 + Math.floor(Math.random() * 4));
      }

      if (this.collapseHold > COLLAPSE_RUPTURE_MS) {
        this.collapsePhase = "cascade";
        this.collapseHold = 0;
        this.collapseSpewTimer = 0;
        this.callbacks.addScore(HIVE_BOSS_DEFEATED_SCORE);
        this.callbacks.pulseFinaleFx(18, 0.95);
        this.spewFinaleBurst(32, 24);
      }
      return;
    }

    if (this.collapsePhase === "cascade") {
      const windDown = Math.min(1, Math.max(0, (this.collapseHold - COLLAPSE_CASCADE_MS * 0.55) / (COLLAPSE_CASCADE_MS * 0.45)));
      const intensity = 1 - windDown * 0.82;
      const flashPulse = Math.sin(this.collapseHold / 55) > 0.15;

      this.tilt = Math.sin(this.collapseHold / 42) * 0.16 * intensity;
      this.x += Math.sin(this.collapseHold / 24) * 2.4 * dt * intensity;
      this.callbacks.pulseFinaleFx(
        (9 + Math.sin(this.collapseHold / 28) * 4) * intensity,
        flashPulse ? 0.72 * intensity : 0.16 * intensity,
      );

      this.collapseSpewTimer -= dtMs;
      if (this.collapseSpewTimer <= 0 && intensity > 0.12) {
        this.collapseSpewTimer = (150 + Math.random() * 90) / Math.max(0.25, intensity);
        const burst = Math.max(1, Math.round((2 + Math.random() * 4) * intensity));
        this.spewFinaleBurst(burst, Math.max(1, Math.round((1 + Math.random() * 3) * intensity)));
      }

      if (this.collapseHold > COLLAPSE_CASCADE_MS) {
        this.collapsePhase = "blackout";
        this.collapseHold = 0;
        this.collapseSpewTimer = 0;
        this.vx = 0;
        this.tilt = 0;
        this.hatchOpenAmount = 0.35;
        this.callbacks.clearFinaleChaos();
        this.callbacks.pulseFinaleFx(2, 0.08);
      }
      return;
    }

    if (this.collapsePhase === "blackout") {
      const fade = Math.min(1, this.collapseHold / (COLLAPSE_BLACKOUT_MS * 0.75));
      const calm = 1 - fade;

      this.tilt *= 0.92;
      this.hatchOpenAmount = Math.max(0, this.hatchOpenAmount - dtMs * 0.00045);
      this.callbacks.pulseFinaleFx(2.5 * calm, 0.12 * calm);

      if (this.collapseHold > COLLAPSE_BLACKOUT_MS) {
        this.collapsePhase = "epilogue";
        this.collapseHold = 0;
        this.victoryMissionBanner = this.callbacks.getCompleteBanner();
        this.callbacks.pulseFinaleFx(0, 0);
      }
      return;
    }

    if (this.collapsePhase === "epilogue") {
      this.tilt = 0;
      this.hatchOpenAmount = 0;
      this.callbacks.pulseFinaleFx(0, 0);

      if (this.collapseHold > COLLAPSE_EPILOGUE_MS) {
        this.collapsePhase = "done";
        this.callbacks.onDefeated();
      }
    }
  }

  private tickMovement(dtMs: number) {
    const dt = dtMs / 16.67;

    if (this.telegraphMs > 0) {
      this.telegraphMs -= dtMs;
      this.tilt = this.movingLeft ? -0.04 : 0.04;
      if (this.telegraphMs <= 0) {
        this.movingLeft = !this.movingLeft;
        this.vx = Math.abs(this.vx) * (this.movingLeft ? -1 : 1);
        this.tilt = 0;
      }
      return;
    }

    this.x += this.vx * dt;
    if (this.x <= this.patrolMin || this.x >= this.patrolMax) {
      this.x = Math.max(this.patrolMin, Math.min(this.patrolMax, this.x));
      if (Math.random() < (this.phase >= 3 ? 0.55 : 0.35)) {
        this.telegraphMs = this.phase >= 4 ? 280 : 450;
      } else {
        this.movingLeft = !this.movingLeft;
        this.vx = Math.abs(this.vx) * (this.movingLeft ? -1 : 1);
      }
    }

    const targetTilt = this.movingLeft ? -0.025 : 0.025;
    this.tilt += (targetTilt - this.tilt) * 0.08;
  }

  private tickHatch(dtMs: number) {
    if (this.hatchTimerMs > 0) {
      this.hatchTimerMs -= dtMs;
      const opening = this.hatchTimerMs > 0;
      this.hatchOpen = opening || this.hatchOpenAmount > 0.12;
      this.hatchOpenAmount = opening
        ? Math.min(1, this.hatchOpenAmount + dtMs * 0.004)
        : Math.max(0, this.hatchOpenAmount - dtMs * 0.0024);
      if (this.hatchTimerMs <= 0) this.hatchOpen = this.hatchOpenAmount > 0.1;
    }
  }

  private openHatch(durationMs: number) {
    this.hatchTimerMs = durationMs;
    this.hatchOpen = true;
  }

  private runAttack() {
    const roll = Math.random();
    if (this.phase === 1) {
      if (roll < 0.55) this.startDroneHatch();
      else if (roll < 0.8) this.startHiveTraverseBurst();
      else this.startBulletBurst(true);
      return;
    }
    if (this.phase === 2) {
      if (roll < 0.42) this.startDroneHatch();
      else if (roll < 0.68) this.startSkirmishSwarm();
      else if (roll < 0.86) this.startGrenadeSpew(true);
      else this.startHiveTraverseBurst();
      return;
    }
    if (this.phase === 3) {
      if (roll < 0.3) this.startDroneHatch();
      else if (roll < 0.58) this.emergencySwarm();
      else if (roll < 0.78) this.startGrenadeSpew(true);
      else if (roll < 0.9) this.startSkirmishSwarm();
      else this.startHiveTraverseBurst();
      return;
    }
    if (roll < 0.28) this.startDroneHatch();
    else if (roll < 0.58) this.emergencySwarm();
    else if (roll < 0.76) this.startGrenadeSpew(true);
    else if (roll < 0.9) this.startSkirmishSwarm();
    else this.startHiveTraverseBurst();
  }

  private waveSize(count: number) {
    return Math.max(1, Math.round(count * this.pressureMult * this.latePhaseEaseMult()));
  }

  private droneHatchCount() {
    if (this.phase >= 4) return this.waveSize(8);
    if (this.phase >= 3) return this.waveSize(6);
    if (this.phase >= 2) return this.waveSize(5);
    return this.waveSize(4);
  }

  private skirmishCount() {
    if (this.phase >= 4) return this.waveSize(6);
    if (this.phase >= 3) return this.waveSize(5);
    return this.waveSize(4);
  }

  private emergencyCount() {
    if (this.phase >= 4) return this.waveSize(9);
    if (this.phase >= 3) return this.waveSize(7);
    return this.waveSize(6);
  }

  private pickDroneKind(): RainbowCowboyEnemyKind {
    const pool = HIVE_DRONE_TABLE.filter((entry) => entry.minPhase <= this.phase);
    let roll = Math.random() * pool.reduce((sum, entry) => sum + entry.weight, 0);
    for (const entry of pool) {
      roll -= entry.weight;
      if (roll <= 0) return entry.kind;
    }
    return pool[pool.length - 1]?.kind ?? "quad";
  }

  private queueDroneWave(count: number, delayStepMs: number) {
    const now = this.callbacks.getTimeMs();
    const playerX = this.callbacks.getPlayerX();

    for (let i = 0; i < count; i++) {
      const kind = this.pickDroneKind();
      let x: number;
      let y: number;

      if (isGroundDrone(kind)) {
        const spawnFromLeft = playerX >= this.x;
        x = spawnFromLeft
          ? this.arenaStartX + 60 + i * 22
          : this.visibleArenaEndX() - 100 - i * 22;
        y = this.groundY;
      } else {
        x = this.x + (i - (count - 1) / 2) * 54;
        y = this.y - HIVE_BODY_H * (0.68 + (i % 4) * 0.05);
      }

      this.swarmQueue.push({
        kind,
        atMs: now + 320 + i * delayStepMs,
        x,
        y,
      });
    }
  }

  private startDroneHatch() {
    this.openHatch(this.phaseParams[this.phase].hatchMs);
    this.callbacks.showPopup("DRONE HATCH!", 900);
    this.queueDroneWave(this.droneHatchCount(), 300);
  }

  private startSkirmishSwarm() {
    this.openHatch(this.phaseParams[this.phase].hatchMs * 0.75);
    this.callbacks.showPopup("SKIRMISH SWARM!", 900);
    this.queueDroneWave(this.skirmishCount(), 240);
  }

  private startHiveTraverseBurst() {
    this.callbacks.showPopup("MINE SWEEP!", 850);
    this.telegraphMs = this.phase >= 4 ? 290 : 400;
    this.vx =
      Math.abs(this.vx) *
      (this.phase >= 3 ? 1.3 : 1.15) *
      this.pressureMult *
      this.latePhaseEaseMult() *
      (this.movingLeft ? -1 : 1);
  }

  private tickRangedPressure(dtMs: number) {
    this.bulletTimerMs -= dtMs;
    if (this.bulletTimerMs <= 0) {
      this.startBulletBurst(false);
      const base = this.phase >= 4 ? 1450 : this.phase >= 3 ? 1780 : this.phase >= 2 ? 2150 : 2700;
      const ease = this.latePhaseEaseMult();
      this.bulletTimerMs =
        (base / this.pressureMult / ease) * (this.enraged ? 0.82 : 1) + Math.random() * 600;
    }

    this.grenadeTimerMs -= dtMs;
    if (this.grenadeTimerMs <= 0) {
      this.startGrenadeSpew(false);
      const base = this.phase >= 4 ? 3300 : this.phase >= 3 ? 4100 : this.phase >= 2 ? 5200 : 6800;
      const ease = this.latePhaseEaseMult();
      this.grenadeTimerMs =
        (base / this.pressureMult / ease) * (this.enraged ? 0.86 : 1) + Math.random() * 1100;
    }
  }

  private startBulletBurst(announce: boolean) {
    if (announce) this.callbacks.showPopup("HIVE GUNS!", 800);
    const px = this.callbacks.getPlayerX();
    const py = this.callbacks.getPlayerY() - 38;
    const dir = px >= this.x ? 1 : -1;
    const muzzleX = this.x + dir * HIVE_BODY_W * 0.36;
    const muzzleY = this.y - HIVE_BODY_H * 0.28;
    const dx = px - muzzleX;
    const dy = py - muzzleY;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;
    const count = Math.max(
      1,
      Math.round(
        (this.phase >= 4 ? 2 : this.phase >= 3 ? 3 : this.phase >= 2 ? 2 : 1) *
          this.latePhaseEaseMult(),
      ),
    );
    const speed = (4.2 + this.phase * 0.42) * 0.83 * this.pressureMult * this.latePhaseEaseMult();

    for (let i = 0; i < count; i++) {
      const spread = (i - (count - 1) / 2) * 0.11;
      this.callbacks.fireBullet(
        muzzleX,
        muzzleY + i * 3,
        (nx + spread) * speed,
        (ny + Math.abs(spread) * 0.22) * speed,
      );
    }
  }

  private startGrenadeSpew(announce: boolean) {
    if (announce) this.callbacks.showPopup("GRENADE SPEW!", 900);
    const px = this.callbacks.getPlayerX();
    const dir = px >= this.x ? 1 : -1;
    const count = Math.max(
      1,
      Math.round(
        (this.phase >= 4 ? 3 : this.phase >= 3 ? 3 : this.phase >= 2 ? 2 : 2) *
          this.latePhaseEaseMult(),
      ),
    );
    const hatchX = this.x + dir * HIVE_BODY_W * 0.2;
    const hatchY = this.y - HIVE_BODY_H * 0.82;

    for (let i = 0; i < count; i++) {
      const fan = i - (count - 1) / 2;
      const vx =
        dir * (2.4 + this.phase * 0.28 + Math.abs(fan) * 0.32) * this.latePhaseEaseMult();
      const vy = -8.6 - Math.random() * 2.2 - Math.max(0, -fan) * 0.6;
      this.callbacks.spewGrenade(hatchX + fan * 12, hatchY, vx, vy, this.phase >= 3 ? 2 : 1);
    }
  }

  private emergencySwarm() {
    this.openHatch(this.phaseParams[this.phase].hatchMs + 1200);
    this.callbacks.showPopup("EMERGENCY SWARM!", 1200);
    this.queueDroneWave(this.emergencyCount(), 180);
  }

  private tickSwarmQueue() {
    const now = this.callbacks.getTimeMs();
    const ready = this.swarmQueue.filter((s) => s.atMs <= now);
    this.swarmQueue = this.swarmQueue.filter((s) => s.atMs > now);
    for (const spawn of ready) {
      this.callbacks.spawnEnemy(spawn.kind, spawn.x, spawn.y);
    }
  }

  private tickHiveCollision() {
    if (this.hiveCollisionCooldownMs > 0) return;
    const px = this.callbacks.getPlayerX();
    const py = this.callbacks.getPlayerY();
    const body = this.hiveBodyRect();
    if (
      px + 16 > body.x &&
      px - 16 < body.x + body.w &&
      py > body.y &&
      py - 40 < body.y + body.h
    ) {
      const knock = px < this.x ? -10 : 10;
      this.callbacks.damagePlayer(2, "Hive collision", knock);
      this.hiveCollisionCooldownMs = 1000;
    }
  }
}

export function drawHiveBoss(
  ctx: CanvasRenderingContext2D,
  state: HiveBossPublicState,
  camX: number,
  time: number,
  groundY: number,
) {
  const sx = state.x - camX;
  const sy = state.y;
  const treadPhase = time / 85;
  const bodyFlash = state.hitFlash && Math.sin(time / 35) > 0;
  const wheelTurn = state.movingLeft ? -1 : 1;
  ctx.save();
  const collapseJitter =
    state.collapsing && state.collapseShake > 0
      ? Math.sin(time / 18) * 5 * state.collapseShake
      : 0;
  ctx.translate(sx + collapseJitter, sy + Math.sin(time / 160) * 1.2);

  drawBossGroundShadow(ctx, 0, HIVE_BODY_H * 0.44, HIVE_BODY_W * 0.42);

  px(ctx, -HIVE_BODY_W * 0.38, HIVE_BODY_H * 0.22, HIVE_BODY_W * 0.76, 18, "#111");
  px(ctx, -HIVE_BODY_W * 0.35, HIVE_BODY_H * 0.24, HIVE_BODY_W * 0.7, 12, "#252018");
  for (let i = -2; i <= 2; i++) {
    const wheelX = i * HIVE_BODY_W * 0.14;
    px(ctx, wheelX - 12, HIVE_BODY_H * 0.24, 24, 18, i % 2 === 0 ? "#3a342c" : "#2a2622");
    px(ctx, wheelX - 8, HIVE_BODY_H * 0.28, 16, 10, "#504840");
    px(ctx, wheelX - 4, HIVE_BODY_H * 0.31, 8, 6, "#706858");
  }
  for (let i = 0; i < 11; i++) {
    const trackX = -HIVE_BODY_W * 0.34 + ((i * 13 + treadPhase * wheelTurn * 5) % (HIVE_BODY_W * 0.68));
    px(ctx, trackX, HIVE_BODY_H * 0.24, 7, 4, "#6a5834");
    px(ctx, trackX, HIVE_BODY_H * 0.39, 7, 3, "#4a3a24");
  }

  ctx.save();
  ctx.rotate(state.tilt);

  ctx.fillStyle = "#8a6a2e";
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 3; i++) {
      const y = -HIVE_BODY_H * 0.28 + i * 24;
      px(ctx, side * HIVE_BODY_W * 0.44 - (side < 0 ? 8 : 0), y - 8, 8, 16, "#8a6a2e");
      px(ctx, side * HIVE_BODY_W * 0.52 - (side < 0 ? 8 : 0), y - 6, 8, 12, "#6a5028");
      px(ctx, side * HIVE_BODY_W * 0.43 - (side < 0 ? 4 : 0), y - 4, 4, 8, "#3a2a18");
    }
  }
  for (let i = -2; i <= 2; i++) {
    px(ctx, i * 26 - 7, -HIVE_BODY_H * 0.66, 14, 12, "#8a6a2e");
    px(ctx, i * 26 - 5, -HIVE_BODY_H * 0.64, 10, 6, "#6a5028");
  }

  const bodyW = HIVE_BODY_W * 0.92;
  const bodyH = HIVE_BODY_H * 0.88;
  px(ctx, -bodyW / 2, -bodyH / 2, bodyW, bodyH, bodyFlash ? "#5c4c48" : "#252525");
  px(ctx, -bodyW / 2 + 8, -bodyH / 2 + 6, bodyW - 16, bodyH - 12, bodyFlash ? "#6a5040" : "#34302a");
  px(ctx, -bodyW / 2 + 4, -bodyH / 2 + 2, 10, 10, bodyFlash ? "#4a4038" : "#1a1816");
  px(ctx, bodyW / 2 - 14, -bodyH / 2 + 2, 10, 10, bodyFlash ? "#4a4038" : "#1a1816");
  px(ctx, -bodyW / 2 + 4, bodyH / 2 - 12, 10, 10, bodyFlash ? "#4a4038" : "#1a1816");
  px(ctx, bodyW / 2 - 14, bodyH / 2 - 12, 10, 10, bodyFlash ? "#4a4038" : "#1a1816");

  ctx.fillStyle = "#69552c";
  const boltColor = bodyFlash ? "#ffd080" : "#69552c";
  for (let i = -3; i <= 3; i++) {
    px(ctx, i * 18 - 3, -bodyH / 2 + 6, 6, 6, boltColor);
    px(ctx, i * 18 - 3, bodyH / 2 - 12, 6, 6, boltColor);
  }
  for (let i = -2; i <= 2; i++) {
    px(ctx, -bodyW / 2 + 6, i * 20 - 3, 6, 6, boltColor);
    px(ctx, bodyW / 2 - 12, i * 20 - 3, 6, 6, boltColor);
  }

  px(ctx, -HIVE_BODY_W * 0.36, HIVE_BODY_H * 0.06, HIVE_BODY_W * 0.72, HIVE_BODY_H * 0.16, "#191716");
  px(ctx, -HIVE_BODY_W * 0.31, HIVE_BODY_H * 0.08, HIVE_BODY_W * 0.62, HIVE_BODY_H * 0.1, "#4a4038");
  for (let i = -2; i <= 2; i++) {
    px(ctx, i * 23 - 4, HIVE_BODY_H * 0.1, 8, 5, "#80704a");
  }

  px(ctx, -HIVE_BODY_W * 0.22, -HIVE_BODY_H * 0.74, HIVE_BODY_W * 0.44, HIVE_BODY_H * 0.14, "#6a5838");
  px(ctx, -HIVE_BODY_W * 0.24, -HIVE_BODY_H * 0.72, HIVE_BODY_W * 0.48, HIVE_BODY_H * 0.17, "#2a241c");
  if (state.hatchOpenAmount > 0.05) {
    px(ctx, -HIVE_BODY_W * 0.19, -HIVE_BODY_H * 0.76, HIVE_BODY_W * 0.38, HIVE_BODY_H * 0.22 * state.hatchOpenAmount, "#100c0a");
    px(
      ctx,
      -10 - state.hatchOpenAmount * 3,
      -HIVE_BODY_H * 0.68,
      20 + state.hatchOpenAmount * 6,
      10,
      `rgba(255,72,30,${0.45 + 0.35 * state.hatchOpenAmount})`,
    );
    px(ctx, -7, -HIVE_BODY_H * 0.69, 14, 7, "#ff3018");
  } else {
    px(ctx, -HIVE_BODY_W * 0.19, -HIVE_BODY_H * 0.75, HIVE_BODY_W * 0.38, HIVE_BODY_H * 0.12, "#40362a");
    px(ctx, -HIVE_BODY_W * 0.12, -HIVE_BODY_H * 0.72, HIVE_BODY_W * 0.24, 5, "#80682e");
  }

  px(ctx, -HIVE_BODY_W * 0.18, -HIVE_BODY_H * 0.42, HIVE_BODY_W * 0.36, HIVE_BODY_H * 0.22, "#191716");
  px(ctx, -HIVE_BODY_W * 0.14, -HIVE_BODY_H * 0.38, HIVE_BODY_W * 0.28, 6, state.enraged ? "#ff2020" : "#80682e");
  px(ctx, -HIVE_BODY_W * 0.1, -HIVE_BODY_H * 0.3, HIVE_BODY_W * 0.2, 4, "#40362a");

  ctx.fillStyle = "#8899aa";
  ctx.fillRect(-56, -HIVE_BODY_H * 0.96, 32, 9);
  ctx.fillRect(24, -HIVE_BODY_H * 0.98, 32, 9);
  px(ctx, -3, -HIVE_BODY_H * 1.08, 6, 22, "#888");
  px(ctx, -8, -HIVE_BODY_H * 1.12, 16, 7, state.alarmFlash && Math.sin(time / 80) > 0 ? "#ff3030" : "#803020");
  ctx.fillStyle = state.alarmFlash && Math.sin(time / 100) > 0 ? "#ff3030" : "#662244";
  ctx.fillRect(-62, -HIVE_BODY_H * 0.55, 12, 12);
  ctx.fillRect(50, -HIVE_BODY_H * 0.5, 12, 12);

  if (state.telegraph) {
    ctx.strokeStyle = `rgba(255,220,80,${0.5 + Math.sin(time / 80) * 0.3})`;
    ctx.lineWidth = 3;
    ctx.strokeRect(-HIVE_BODY_W / 2 - 6, -HIVE_BODY_H / 2 - 6, HIVE_BODY_W + 12, HIVE_BODY_H + 12);
  }

  if (state.smoke) {
    ctx.fillStyle = `rgba(80,80,80,${0.2 + Math.sin(time / 350) * 0.08})`;
    px(ctx, -34, -HIVE_BODY_H * 0.66, 28, 16, `rgba(80,80,80,${0.2 + Math.sin(time / 350) * 0.08})`);
  }
  if (state.sparks) {
    ctx.strokeStyle = `rgba(255,220,80,${0.55 + Math.sin(time / 70) * 0.25})`;
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(-40 + i * 20, -20);
      ctx.lineTo(-34 + i * 20, -10);
      ctx.stroke();
    }
  }

  if (state.collapsing && state.collapseBlackout < 0.45 && Math.sin(time / 45) > -0.2) {
    ctx.fillStyle = `rgba(220,0,0,${0.35 + state.collapseShake * 0.25})`;
    ctx.fillRect(
      -HIVE_BODY_W / 2 - 8,
      -HIVE_BODY_H / 2 - 8,
      HIVE_BODY_W + 16,
      HIVE_BODY_H + 16,
    );
  }

  if (state.collapseBlackout > 0) {
    ctx.fillStyle = `rgba(0,0,0,${Math.min(0.96, state.collapseBlackout * 0.94)})`;
    ctx.fillRect(
      -HIVE_BODY_W / 2 - 14,
      -HIVE_BODY_H - 10,
      HIVE_BODY_W + 28,
      HIVE_BODY_H + 20,
    );
  }

  ctx.restore();
  ctx.restore();

  ctx.fillStyle = "rgba(18,12,24,0.35)";
  ctx.fillRect(0, groundY, VIEW_W * 2, 8);
}

export function drawHivePlanks(
  ctx: CanvasRenderingContext2D,
  planks: HivePlank[],
  camX: number,
  time: number,
) {
  ctx.save();
  for (const plank of planks) {
    if (!plank.active) continue;
    const x = plank.x - camX;
    if (x + plank.w < -20 || x > VIEW_W + 20) continue;
    if (plank.collapsed) {
      ctx.fillStyle = `rgba(90,60,40,${0.35 + Math.sin(time / 200 + plank.id) * 0.1})`;
      ctx.fillRect(x, plank.y + 6, plank.w, 4);
      continue;
    }
    ctx.fillStyle = "#8b6914";
    ctx.fillRect(x, plank.y, plank.w, plank.h);
    ctx.fillStyle = "#a88020";
    for (let i = 0; i < plank.w; i += 18) {
      ctx.fillRect(x + i + 2, plank.y + 2, 14, plank.h - 4);
    }
    ctx.strokeStyle = "#5a4010";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, plank.y, plank.w, plank.h);
  }
  ctx.restore();
}

export function drawHiveArenaSilhouette(ctx: CanvasRenderingContext2D, time: number) {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.85)";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  const cx = VIEW_W / 2;
  const cy = VIEW_H * 0.42;
  ctx.fillStyle = "#1a1018";
  ctx.beginPath();
  ctx.ellipse(cx, cy, 200, 120, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 3;
  for (let i = 0; i < 10; i++) {
    const ang = (i / 10) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * 80, cy + Math.sin(ang) * 50);
    ctx.lineTo(cx + Math.cos(ang) * 110, cy + Math.sin(ang) * 70);
    ctx.stroke();
  }
  ctx.fillStyle = stateFlash(time) ? "#ff4040" : "#553366";
  ctx.fillRect(cx - 70, cy - 80, 14, 10);
  ctx.fillRect(cx + 56, cy - 75, 14, 10);

  ctx.fillStyle = "#fff";
  ctx.font = "bold 34px monospace";
  ctx.textAlign = "center";
  ctx.fillText("THE HIVE", cx, VIEW_H * 0.62);
  ctx.font = "16px monospace";
  ctx.fillStyle = "#ccc";
  ctx.fillText("Shut down the swarm.", cx, VIEW_H * 0.68);
  ctx.textAlign = "left";
  ctx.restore();
}

function stateFlash(time: number) {
  return Math.sin(time / 180) > 0.4;
}
