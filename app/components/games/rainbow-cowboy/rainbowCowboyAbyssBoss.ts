import { VIEW_H, VIEW_W } from "./rainbowCowboyConstants";
import {
  ABYSS_ARENA_PLATFORM,
  ABYSS_ARENA_Y,
  ABYSS_BOSS_ANCHOR_X,
  ABYSS_BOSS_DEFEATED_SCORE,
  ABYSS_BOSS_LURK_X_OFFSET,
  ABYSS_EYE_HIT_SCORE,
  ABYSS_ENGAGE_Y,
  ABYSS_ENGAGE_ATTACK_GRACE_MS,
  ABYSS_ENGAGE_BLEND_MS,
  ABYSS_EYE_MINE_INTERVAL_MS,
  ABYSS_EYE_MINE_INITIAL_DELAY_MS,
  ABYSS_EYE_MINE_MAX_ACTIVE,
  ABYSS_EYE_MINE_ENRAGED_INTERVAL_MULT,
  ABYSS_FLOOR_Y,
  ABYSS_GUNNER_BULLET_SPEED,
  ABYSS_GUNNER_COOLDOWN_MS,
  ABYSS_GUNNER_LASER_SPEED,
  ABYSS_HAZARD_PAD_LUNGE,
  ABYSS_LUNGE_AIM,
  ABYSS_LUNGE_COOLDOWN_MS,
  ABYSS_LUNGE_EXTRA_REACH,
  ABYSS_LUNGE_HOMING,
  ABYSS_LUNGE_MS,
  ABYSS_REVEAL_START_Y,
  ABYSS_MAX_HP,
  ABYSS_RAINBOW_DAMAGE,
  ABYSS_SCROLL_PAUSE_TENTACLES,
  ABYSS_SCROLL_SPEED,
  ABYSS_SECTION_Y,
  ABYSS_SPEAR_DAMAGE,
  ABYSS_SURFACE_PUSH_MULT,
  ABYSS_TENTACLE_COUNT,
  ABYSS_TENTACLE_DEATH_MS,
  ABYSS_TENTACLE_DESTROY_SCORE,
  ABYSS_TENTACLE_HIT_FLASH_MS,
  ABYSS_TENTACLE_JOINT_HP,
  ABYSS_TENTACLE_TIP_HIT_R,
  ABYSS_TENTACLE_SWEEP_MULT,
} from "./rainbowCowboyAbyssConstants";
import type { RainbowCowboyEnemyKind } from "./rainbowCowboyTypes";

export type AbyssBossPhase = 1 | 2 | 3;
export type AbyssMode = "ascent" | "arena" | "defeated";
export type AbyssTentacleRole = "standard" | "lasher" | "gunner";

export type AbyssTentacleState = {
  id: number;
  side: "left" | "right";
  role: AbyssTentacleRole;
  jointHp: number;
  maxJointHp: number;
  destroyed: boolean;
  dying: boolean;
  deathTimer: number;
  fallOffsetY: number;
  shakePhase: number;
  hitFlashUntil: number;
  sweepPhase: number;
  sweepSpeed: number;
  reachY: number;
  stabTimer: number;
  lungeTimer: number;
  lungeCooldown: number;
  lungeTargetY: number;
  lungeTargetX: number;
  shootCooldown: number;
};

export type AbyssTentacleLayout = {
  id: number;
  side: "left" | "right";
  role: AbyssTentacleRole;
  baseX: number;
  baseY: number;
  reachUp: number;
  sweep: number;
  tipX: number;
  tipY: number;
  hitRect: { x: number; y: number; w: number; h: number };
  hp: number;
  maxHp: number;
  dying: boolean;
  deathTimer: number;
  shakePhase: number;
  fallOffsetY: number;
  hitFlash: boolean;
  destroyed: boolean;
  lunging: boolean;
  lungeProgress: number;
  segments: { x: number; y: number }[];
};

export type AbyssTentacleHazardRect = {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  damages: boolean;
};

export type AbyssBossPublicState = {
  active: boolean;
  defeated: boolean;
  mode: AbyssMode;
  phase: AbyssBossPhase;
  hp: number;
  maxHp: number;
  eyeOpen: boolean;
  eyeVulnerable: boolean;
  bodyVulnerable: boolean;
  enraged: boolean;
  squidX: number;
  squidY: number;
  squidScale: number;
  hitFlash: boolean;
  tentaclesDestroyed: number;
  collapsing: boolean;
  collapseLabel: string | null;
  collapseEpilogue: boolean;
  collapseEpilogueHold: number;
  victoryMissionBanner: string | null;
  sectionIndex: number;
  scrollPressure: number;
  engaged: boolean;
  revealProgress: number;
  engageBlend: number;
  inkClouds: { x: number; y: number; r: number; bornMs: number }[];
  sonarPulse: number;
};

type Rect = { x: number; y: number; w: number; h: number };

type SpawnEnemyFn = (kind: RainbowCowboyEnemyKind, x: number, y: number) => void;
type AddScoreFn = (points: number) => void;
type ShowPopupFn = (text: string, ms?: number) => void;
type OnDefeatedFn = () => void;
type FireBulletFn = (x: number, y: number, vx: number, vy: number, laser?: boolean) => void;
type SpawnInkFn = (x: number, y: number) => void;
type SpawnSeaMineFn = (x: number, y: number, tethered?: boolean) => void;
type CountActiveSeaMinesFn = () => number;
type DamagePlayerFn = (amount: number, cause: string) => void;
type GetTimeMsFn = () => number;
type GetPlayerFn = () => { x: number; y: number };
type GetCameraYFn = () => number;
type PulseFxFn = (shake: number, red: number) => void;
type GetCompleteBannerFn = () => string;

const COLLAPSE_SINK_MS = 4200;
const COLLAPSE_EPILOGUE_MS = 3600;

/** Per-segment whip offset — shared by hit detection and drawing. */
export function tentacleSegmentWobble(time: number, segIndex: number, side: "left" | "right"): number {
  const primary = Math.sin(time / 160 + segIndex * 1.15 + (side === "left" ? 0 : 1.5)) * (20 + segIndex * 10);
  const lash = Math.sin(time / 85 + segIndex * 2.4 + (side === "left" ? 0.6 : 2)) * (10 + segIndex * 4);
  return primary + lash;
}

/** Horizontal tentacle path — extends left from the boss with vertical whip. */
export function computeHorizontalTentaclePath(
  baseX: number,
  baseY: number,
  reachLen: number,
  sweepY: number,
  time: number,
  side: "left" | "right",
): { tipX: number; tipY: number; segments: { x: number; y: number }[] } {
  const segments = 5;
  const segLen = reachLen / segments;
  let x = baseX;
  let y = baseY + sweepY;
  const points: { x: number; y: number }[] = [{ x, y }];
  for (let s = 0; s < segments; s++) {
    const wobble = tentacleSegmentWobble(time, s, side);
    x -= segLen;
    y += wobble * (side === "left" ? 1 : -1);
    points.push({ x, y });
  }
  const last = points[points.length - 1];
  return { tipX: last.x, tipY: last.y, segments: points };
}

function tentacleTipHitRect(tipX: number, tipY: number): Rect {
  const r = ABYSS_TENTACLE_TIP_HIT_R;
  return { x: tipX - r, y: tipY - r, w: r * 2, h: r * 2 };
}

function pointInRect(px: number, py: number, rect: Rect): boolean {
  return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
}

export class AbyssBossController {
  mode: AbyssMode = "ascent";
  phase: AbyssBossPhase = 1;
  hp = ABYSS_MAX_HP;
  maxHp = ABYSS_MAX_HP;
  active = true;
  defeated = false;
  engaged = false;
  revealProgress = 0;
  collapsing = false;
  collapseHold = 0;
  collapsePhase: "sink" | "epilogue" | "done" = "sink";
  bossDamageDealt = 0;

  squidX = VIEW_W + ABYSS_BOSS_LURK_X_OFFSET;
  squidY = ABYSS_FLOOR_Y - 200;
  scrollPressure = ABYSS_FLOOR_Y - VIEW_H + 60;
  sectionIndex = 0;
  eyeOpen = false;
  enraged = false;
  hitFlashUntil = 0;
  attackTimer = 0;
  sonarPulse = 0;
  sonarCooldown = 0;
  inkClouds: { x: number; y: number; r: number; bornMs: number }[] = [];
  tentacles: AbyssTentacleState[] = [];
  ascentTentacleTimer = 0;
  victoryMissionBanner: string | null = null;
  private revealHintShown = false;
  private engageTimerMs = 0;
  private engageStartSquidX = ABYSS_BOSS_ANCHOR_X;
  private engageStartSquidY = ABYSS_FLOOR_Y - 200;
  private eyeMineTimer = 0;
  private eyeMineHintShown = false;
  private readonly eyeMinePressureMult: number;

  private readonly callbacks: {
    spawnEnemy: SpawnEnemyFn;
    addScore: AddScoreFn;
    showPopup: ShowPopupFn;
    onDefeated: OnDefeatedFn;
    fireBullet: FireBulletFn;
    spawnInk: SpawnInkFn;
    spawnSeaMine: SpawnSeaMineFn;
    countActiveSeaMines: CountActiveSeaMinesFn;
    damagePlayer: DamagePlayerFn;
    getTimeMs: GetTimeMsFn;
    getPlayer: GetPlayerFn;
    getCameraY: GetCameraYFn;
    pulseFx: PulseFxFn;
    getCompleteBanner: GetCompleteBannerFn;
  };

  constructor(
    callbacks: AbyssBossController["callbacks"],
    options?: { eyeMinePressureMult?: number },
  ) {
    this.callbacks = callbacks;
    this.eyeMinePressureMult = options?.eyeMinePressureMult ?? 1;
    this.initTentacles();
  }

  private initTentacles() {
    const roles: AbyssTentacleRole[] = [
      "lasher",
      "gunner",
      "lasher",
      "lasher",
      "gunner",
      "lasher",
      "lasher",
      "gunner",
    ];
    this.tentacles = [];
    for (let i = 0; i < ABYSS_TENTACLE_COUNT; i++) {
      this.tentacles.push({
        id: i,
        side: i % 2 === 0 ? "left" : "right",
        role: roles[i] ?? "standard",
        jointHp: ABYSS_TENTACLE_JOINT_HP,
        maxJointHp: ABYSS_TENTACLE_JOINT_HP,
        destroyed: false,
        dying: false,
        deathTimer: 0,
        fallOffsetY: 0,
        shakePhase: 0,
        hitFlashUntil: 0,
        sweepPhase: i * 1.1,
        sweepSpeed: 1.15 + i * 0.14,
        reachY: ABYSS_ARENA_Y + 60 + i * 18,
        stabTimer: i * 600,
        lungeTimer: 0,
        lungeCooldown: 900 + i * 340,
        lungeTargetY: 0,
        lungeTargetX: 0,
        shootCooldown: 1100 + i * 500,
      });
    }
  }

  getState(): AbyssBossPublicState {
    const destroyed = this.tentacles.filter((t) => t.destroyed).length;
    const bodyVulnerable = this.allTentaclesDestroyed();
    return {
      active: this.active,
      defeated: this.defeated,
      mode: this.mode,
      phase: this.phase,
      hp: this.hp,
      maxHp: this.maxHp,
      eyeOpen: this.eyeOpen,
      eyeVulnerable: bodyVulnerable && this.eyeOpen,
      bodyVulnerable,
      enraged: this.enraged,
      squidX: this.squidX,
      squidY: this.squidY,
      squidScale: this.mode === "arena" ? 1.15 : 0.95,
      hitFlash: this.callbacks.getTimeMs() < this.hitFlashUntil,
      tentaclesDestroyed: destroyed,
      collapsing: this.collapsing,
      collapseLabel: this.collapsing ? "THE ABYSS DEFEATED" : null,
      collapseEpilogue: this.collapsePhase === "epilogue",
      collapseEpilogueHold: this.collapseHold,
      victoryMissionBanner: this.victoryMissionBanner,
      sectionIndex: this.sectionIndex,
      scrollPressure: this.scrollPressure,
      engaged: this.engaged,
      revealProgress: this.engaged ? 1 : this.revealProgress,
      engageBlend: this.getEngageBlend(),
      inkClouds: this.inkClouds,
      sonarPulse: this.sonarPulse,
    };
  }

  enterArena() {
    this.mode = "arena";
    this.phase = this.allTentaclesDestroyed() ? 2 : 1;
    this.squidX = ABYSS_BOSS_ANCHOR_X;
    this.squidY = ABYSS_ARENA_Y + 200;
    if (this.allTentaclesDestroyed()) {
      this.eyeOpen = true;
      this.callbacks.showPopup("CORE EXPOSED — SPEAR THE EYE", 2200);
    } else {
      this.callbacks.showPopup("SPEAR THE TENTACLE JOINTS", 2000);
    }
    this.callbacks.showPopup("THE ABYSS — FINAL STAND", 1800);
  }

  getMinCameraY(): number {
    if (!this.engaged) return -Infinity;
    return this.scrollPressure;
  }

  getActiveTentacleCount(): number {
    return this.tentacles.filter((t) => !t.destroyed && !t.dying).length;
  }

  /** Stop the upward chase so frogman can finish the last tentacles / eye. */
  isScrollChasePaused(): boolean {
    if (!this.engaged || this.mode !== "ascent") return false;
    if (this.allTentaclesDestroyed()) return true;
    return this.getActiveTentacleCount() <= ABYSS_SCROLL_PAUSE_TENTACLES;
  }

  /** Rising-chase damage only while scroll is actively pushing. */
  shouldApplyFallDamage(): boolean {
    return this.engaged && this.mode === "ascent" && !this.isScrollChasePaused();
  }

  /** 0→1 while the boss settles into the fight (smooth intro). */
  getEngageBlend(): number {
    if (!this.engaged) return 0;
    return Math.min(1, this.engageTimerMs / ABYSS_ENGAGE_BLEND_MS);
  }

  /** Blended camera Y — eases from player-follow into scroll-chase. */
  getEffectiveCameraY(playerY: number): number {
    if (!this.engaged || this.mode === "arena") return this.scrollPressure;
    if (this.isScrollChasePaused()) {
      return playerY - VIEW_H * 0.32;
    }
    const playerCam = playerY - VIEW_H * 0.32;
    const t = this.getEngageBlend();
    const ease = t * t * (3 - 2 * t);
    return playerCam + (this.scrollPressure - playerCam) * ease;
  }

  isCombatActive(): boolean {
    return this.engaged && this.engageTimerMs >= ABYSS_ENGAGE_ATTACK_GRACE_MS;
  }

  /** Ramp 0→1 as tentacle reach / aggression comes online after engage. */
  private getCombatRamp(): number {
    if (!this.engaged) return 0;
    const start = ABYSS_ENGAGE_BLEND_MS * 0.45;
    const end = ABYSS_ENGAGE_ATTACK_GRACE_MS;
    return Math.max(0, Math.min(1, (this.engageTimerMs - start) / (end - start)));
  }

  getScrollSpeedMult(): number {
    if (this.sectionIndex >= 5) return ABYSS_SURFACE_PUSH_MULT;
    if (this.sectionIndex >= 4) return 1.25;
    return 1;
  }

  tick(dtMs: number, playerY: number) {
    if (!this.active || this.defeated) {
      if (this.collapsing) this.tickCollapse(dtMs);
      return;
    }

    this.tickTentacleDeaths(dtMs);

    if (!this.engaged) {
      this.tickApproach(dtMs, playerY);
      return;
    }

    this.engageTimerMs += dtMs;

    if (this.mode === "ascent") {
      this.tickAscent(dtMs, playerY);
    } else {
      this.tickArena(dtMs);
    }

    this.tickInk(dtMs);
    if (this.sonarPulse > 0) this.sonarPulse = Math.max(0, this.sonarPulse - dtMs * 0.002);
    if (this.engaged && !this.defeated && this.isCombatActive()) {
      this.tickTentacleAttacks(dtMs);
    }
    if (this.eyeOpen && !this.defeated && this.isCombatActive()) {
      this.tickEyeMines(dtMs);
    }
  }

  private tickTentacleDeaths(dtMs: number) {
    for (const t of this.tentacles) {
      if (!t.dying) continue;
      t.deathTimer += dtMs;
      t.shakePhase += dtMs * 0.028;
      t.fallOffsetY += dtMs * 0.11;
      if (t.deathTimer >= ABYSS_TENTACLE_DEATH_MS) {
        t.dying = false;
        t.destroyed = true;
        this.callbacks.addScore(ABYSS_TENTACLE_DESTROY_SCORE);
        this.callbacks.showPopup("TENTACLE SEVERED", 900);
        this.callbacks.pulseFx(5, 0.1);
        this.onTentacleFullyDestroyed();
      }
    }
  }

  private onTentacleFullyDestroyed() {
    if (this.allTentaclesDestroyed() && !this.eyeOpen) {
      this.eyeOpen = true;
      this.phase = 2;
      this.eyeMineTimer = -ABYSS_EYE_MINE_INITIAL_DELAY_MS;
      this.eyeMineHintShown = false;
      this.callbacks.showPopup("ALL TENTACLES DOWN — HIT THE EYE! MINES INCOMING!", 2600);
      this.callbacks.pulseFx(8, 0.18);
    }
  }

  /** Boss body spits floating sea mines toward the player lane once the eye is exposed. */
  private tickEyeMines(dtMs: number) {
    if (this.callbacks.countActiveSeaMines() >= ABYSS_EYE_MINE_MAX_ACTIVE) return;

    this.eyeMineTimer += dtMs;
    if (this.eyeMineTimer < 0) return;

    const interval =
      (ABYSS_EYE_MINE_INTERVAL_MS / this.eyeMinePressureMult) *
      (this.enraged ? ABYSS_EYE_MINE_ENRAGED_INTERVAL_MULT : 1);
    if (this.eyeMineTimer < interval) return;
    this.eyeMineTimer = 0;

    const player = this.callbacks.getPlayer();
    const burst = this.enraged && Math.random() > 0.5 ? 2 : 1;
    for (let i = 0; i < burst; i++) {
      if (this.callbacks.countActiveSeaMines() >= ABYSS_EYE_MINE_MAX_ACTIVE) break;
      const towardPlayerY = (player.y - this.squidY) * (0.22 + Math.random() * 0.18);
      const spawnX = this.squidX - 72 - Math.random() * 56 - i * 28;
      const spawnY = this.squidY - 8 + towardPlayerY + (Math.random() - 0.5) * 48;
      const tethered = Math.random() < 0.22;
      this.callbacks.spawnSeaMine(spawnX, spawnY, tethered);
    }

    if (!this.eyeMineHintShown) {
      this.eyeMineHintShown = true;
      this.callbacks.showPopup("SEA MINES!", 900);
    } else if (burst > 1) {
      this.callbacks.showPopup("MINES!", 650);
    }
    this.callbacks.pulseFx(3, 0.07);
  }

  private computeRevealProgress(playerY: number): number {
    const span = ABYSS_ENGAGE_Y - ABYSS_REVEAL_START_Y;
    if (span <= 0) return playerY >= ABYSS_ENGAGE_Y ? 1 : 0;
    return Math.max(0, Math.min(1, (playerY - ABYSS_REVEAL_START_Y) / span));
  }

  private tickApproach(dtMs: number, playerY: number) {
    const dt = dtMs / 16.67;
    this.revealProgress = this.computeRevealProgress(playerY);
    const eased = 1 - Math.pow(1 - this.revealProgress, 2.2);

    const hiddenX = VIEW_W + ABYSS_BOSS_LURK_X_OFFSET;
    const visibleX = ABYSS_BOSS_ANCHOR_X;
    const targetX = hiddenX + (visibleX - hiddenX) * eased;
    const follow = 0.045 + eased * 0.04;
    this.squidX += (targetX - this.squidX) * follow * dt;
    this.squidY += (playerY - this.squidY) * (0.055 + eased * 0.04) * dt;

    if (this.revealProgress > 0.12 && !this.revealHintShown) {
      this.revealHintShown = true;
      this.callbacks.showPopup("TENTACLES FROM THE DARK…", 2000);
    }

    if (playerY >= ABYSS_ENGAGE_Y) {
      this.engage();
    }
  }

  private engage() {
    if (this.engaged) return;
    this.engaged = true;
    this.revealProgress = 1;
    this.engageTimerMs = 0;
    this.engageStartSquidX = this.squidX;
    this.engageStartSquidY = this.squidY;
    const camY = this.callbacks.getCameraY();
    this.scrollPressure = camY;
    for (const t of this.tentacles) {
      t.lungeTimer = 0;
      t.shootCooldown = ABYSS_ENGAGE_ATTACK_GRACE_MS + t.id * (t.role === "gunner" ? 520 : 380);
      if (t.role === "lasher") {
        t.lungeCooldown = ABYSS_ENGAGE_ATTACK_GRACE_MS + t.id * 420;
      }
    }
    this.callbacks.showPopup("THE ABYSS AWAKENS — SWIM UP!", 2400);
    this.callbacks.pulseFx(5, 0.1);
  }

  private tickAscent(dtMs: number, playerY: number) {
    const dt = dtMs / 16.67;
    const scrollMult = this.getScrollSpeedMult();
    const time = this.callbacks.getTimeMs();
    const blend = this.getEngageBlend();
    const blendEase = blend * blend * (3 - 2 * blend);

    const scrollRamp = Math.max(0, (blend - 0.35) / 0.65);
    if (!this.isScrollChasePaused()) {
      this.scrollPressure -= ABYSS_SCROLL_SPEED * scrollMult * dt * scrollRamp;
      this.scrollPressure = Math.max(ABYSS_ARENA_Y - 20, this.scrollPressure);
    }

    if (blend < 1) {
      const anchorX = ABYSS_BOSS_ANCHOR_X + Math.sin(time / 2400) * 14 * blendEase;
      this.squidX = this.engageStartSquidX + (anchorX - this.engageStartSquidX) * blendEase;
      const targetY = playerY + Math.sin(time / 1900) * 18 * blendEase;
      this.squidY = this.engageStartSquidY + (targetY - this.engageStartSquidY) * blendEase;
    } else {
      this.squidX = ABYSS_BOSS_ANCHOR_X + Math.sin(time / 2400) * 14;
      const remaining = this.tentacles.filter((t) => !t.destroyed && !t.dying).length;
      const wobble = remaining <= 2 ? 8 : 18;
      this.squidY = playerY + Math.sin(time / 1900) * wobble;
    }

    this.updateSection(playerY);
    this.ascentTentacleTimer += dtMs;
    if (this.ascentTentacleTimer > 2200) {
      this.ascentTentacleTimer = 0;
      for (const t of this.tentacles) {
        if (t.destroyed || t.dying) continue;
        t.sweepPhase += 0.68;
        t.stabTimer = 1000 + Math.random() * 1600;
      }
    }

    if (playerY <= ABYSS_SECTION_Y.arena) {
      this.enterArena();
    }
  }

  private updateSection(playerY: number) {
    const sections = [
      ABYSS_SECTION_Y.floor,
      ABYSS_SECTION_Y.ship,
      ABYSS_SECTION_Y.minefield,
      ABYSS_SECTION_Y.sharkGauntlet,
      ABYSS_SECTION_Y.subGraveyard,
      ABYSS_SECTION_Y.surfacePush,
    ];
    for (let i = sections.length - 1; i >= 0; i--) {
      if (playerY <= sections[i] && this.sectionIndex < i + 1) {
        this.sectionIndex = i + 1;
        const msgs = [
          "",
          "OCEAN FLOOR — SWIM UP!",
          "SUNKEN SHIP — DODGE THE HULL",
          "NARROW PASSAGE — DODGE THE PILLARS",
          "SHARK GAUNTLET — LASERS AHEAD",
          "SUB GRAVEYARD — NARROW LANES",
          "SURFACE PUSH — IT'S CLOSER",
        ];
        if (msgs[i + 1]) this.callbacks.showPopup(msgs[i + 1], 1800);
        break;
      }
    }
  }

  private tickArena(dtMs: number) {
    const dt = dtMs / 16.67;
    const player = this.callbacks.getPlayer();
    this.squidX = ABYSS_BOSS_ANCHOR_X + Math.sin(this.callbacks.getTimeMs() / 2000) * 10;
    this.squidY = ABYSS_ARENA_Y + 200 + Math.sin(this.callbacks.getTimeMs() / 900) * 8;
    // Drift vertically toward player slightly in arena
    this.squidY += (player.y - this.squidY) * 0.015 * dt;

    for (const t of this.tentacles) {
      if (t.destroyed || t.dying) continue;
      t.sweepPhase += t.sweepSpeed * dt * 0.66 * (this.enraged ? 1.25 : 1);
      t.stabTimer -= dtMs;
    }

    this.attackTimer += dtMs;
    const attackInterval = this.enraged ? 3750 : this.eyeOpen ? 4650 : 5850;
    if (this.attackTimer >= attackInterval) {
      this.attackTimer = 0;
      this.fireArenaAttack();
    }

    if (this.eyeOpen && this.hp <= this.maxHp * 0.35 && !this.enraged) {
      this.phase = 3;
      this.enraged = true;
      this.callbacks.showPopup("ARMOR SHATTERED — ENRAGED", 2000);
      this.callbacks.pulseFx(8, 0.25);
    }
  }

  private allTentaclesDestroyed(): boolean {
    return this.tentacles.every((t) => t.destroyed);
  }

  private tentacleActive(t: AbyssTentacleState): boolean {
    return !t.destroyed && !t.dying;
  }

  private tentacleSlotY(slotRank: number, slotCount: number): number {
    if (slotCount <= 0) return 0;
    return (slotRank - (slotCount - 1) / 2) * 34;
  }

  /** Live tentacles with slot ranks re-packed around the boss center as arms are lost. */
  private getActiveTentacleSlots(): {
    tentacle: AbyssTentacleState;
    index: number;
    slotRank: number;
    slotCount: number;
  }[] {
    const active = this.tentacles
      .map((t, index) => ({ t, index }))
      .filter(({ t }) => !t.destroyed && !t.dying);
    const slotCount = active.length;
    return active.map(({ t, index }, slotRank) => ({
      tentacle: t,
      index,
      slotRank,
      slotCount,
    }));
  }

  private getAscentSweepY(
    t: AbyssTentacleState,
    slotRank: number,
    slotCount: number,
    time: number,
  ): number {
    const m = ABYSS_TENTACLE_SWEEP_MULT;
    const primary =
      Math.sin(this.scrollPressure * 0.003 + slotRank * 1.4 + time / 260) * (72 + slotRank * 18) * m;
    const lash =
      Math.sin(time / 150 + slotRank * 2.2 + t.sweepPhase * 0.6) * (38 + slotRank * 10) * m;
    return primary + lash;
  }

  private tickTentacleAttacks(dtMs: number) {
    const time = this.callbacks.getTimeMs();
    const player = this.callbacks.getPlayer();
    const enragedMult = this.enraged ? 0.78 : 1;

    for (const t of this.tentacles) {
      if (t.destroyed || t.dying) continue;

      if (t.role === "lasher") {
        if ((t.lungeTimer ?? 0) > 0) {
          t.lungeTimer = (t.lungeTimer ?? 0) - dtMs;
          // Mild homing while extended — keeps the snap on a dodging frogman
          const track = ABYSS_LUNGE_HOMING * (dtMs / 16.67);
          t.lungeTargetY += (player.y - t.lungeTargetY) * track;
          t.lungeTargetX += (player.x - t.lungeTargetX) * track * 0.4;
        } else {
          t.lungeCooldown = (t.lungeCooldown ?? 0) - dtMs;
          if ((t.lungeCooldown ?? 0) <= 0) {
            t.lungeTimer = ABYSS_LUNGE_MS;
            t.lungeCooldown = ABYSS_LUNGE_COOLDOWN_MS * enragedMult + t.id * 390;
            t.lungeTargetY = player.y;
            t.lungeTargetX = player.x;
          }
        }
      }

      if (t.role === "gunner") {
        t.shootCooldown = (t.shootCooldown ?? 0) - dtMs;
        if ((t.shootCooldown ?? 0) <= 0) {
          t.shootCooldown = ABYSS_GUNNER_COOLDOWN_MS * enragedMult + t.id * 290;
          const layout = this.getTentacleLayouts(time).find((l) => l.id === t.id);
          if (layout) {
            const dx = player.x - layout.tipX;
            const dy = player.y - layout.tipY;
            const dist = Math.max(1, Math.hypot(dx, dy));
            const speed = t.id % 2 === 0 ? ABYSS_GUNNER_LASER_SPEED : ABYSS_GUNNER_BULLET_SPEED;
            this.callbacks.fireBullet(
              layout.tipX,
              layout.tipY,
              (dx / dist) * speed,
              (dy / dist) * speed,
              t.id % 2 === 0,
            );
          }
        }
      }
    }
  }

  private ensureTentacleFields() {
    const roles: AbyssTentacleRole[] = [
      "lasher",
      "gunner",
      "lasher",
      "lasher",
      "gunner",
      "lasher",
      "lasher",
      "gunner",
    ];
    for (const t of this.tentacles) {
      if (!t.role) t.role = roles[t.id] ?? "standard";
      if (t.lungeTimer == null) t.lungeTimer = 0;
      if (t.lungeCooldown == null) t.lungeCooldown = 800 + t.id * 400;
      if (t.lungeTargetY == null) t.lungeTargetY = 0;
      if (t.lungeTargetX == null) t.lungeTargetX = 0;
      if (t.shootCooldown == null) t.shootCooldown = 600 + t.id * 350;
    }
  }

  getTentacleLayouts(time: number): AbyssTentacleLayout[] {
    this.ensureTentacleFields();
    const out: AbyssTentacleLayout[] = [];
    const arena = this.mode === "arena";
    const player = this.callbacks.getPlayer();
    const activeSlots = this.getActiveTentacleSlots();

    for (const { tentacle: t, index: i, slotRank, slotCount } of activeSlots) {
      let baseX: number;
      let baseY: number;
      let reachLen: number;
      let sweepY: number;

      const role = t.role ?? "standard";
      const lunging = role === "lasher" && (t.lungeTimer ?? 0) > 0;
      const lungeProgress = lunging ? 1 - (t.lungeTimer ?? 0) / ABYSS_LUNGE_MS : 0;
      const lungeEase = lunging ? Math.sin(lungeProgress * Math.PI) : 0;
      const slotY = this.tentacleSlotY(slotRank, slotCount);

      if (arena) {
        t.sweepPhase += t.sweepSpeed * 0.016;
        sweepY = Math.sin(t.sweepPhase) * 95 + Math.sin(t.sweepPhase * 2.35 + slotRank) * 32;
        baseX = this.squidX - 28;
        baseY = this.squidY + slotY + t.fallOffsetY;
        reachLen = 280 + slotRank * 25;
        if (slotCount <= 3) {
          const aim = player.y - baseY;
          const bias = slotCount === 1 ? 0.72 : 0.48;
          sweepY = sweepY * (1 - bias) + aim * bias;
        }
      } else {
        const reveal = this.engaged ? 1 : this.revealProgress;
        const tReveal = Math.max(0, Math.min(1, (reveal - slotRank * 0.08) / 0.72));
        const tEased = 1 - Math.pow(1 - tReveal, 2.4);
        if (!this.engaged && tEased <= 0.02) continue;

        sweepY = this.engaged
          ? this.getAscentSweepY(t, slotRank, slotCount, time)
          : Math.sin(time / 900 + slotRank * 1.4) * (28 + slotRank * 10) * tEased;
        baseX = this.squidX - 32;
        baseY = this.squidY + slotY + t.fallOffsetY;
        reachLen = (300 + slotRank * 40) * tEased;
        if (this.engaged) {
          const ramp = this.getCombatRamp();
          reachLen *= 0.35 + 0.65 * ramp;
          sweepY *= 0.45 + 0.55 * ramp;
          // Keep late-fight tentacles in spear range — last arm recenters on frogman
          if (slotCount <= 3) {
            const aim = player.y - baseY;
            const bias = slotCount === 1 ? 0.72 : 0.48;
            sweepY = sweepY * (1 - bias) + aim * bias;
          }
        }
      }

      if (lunging) {
        const aimSweep = t.lungeTargetY - baseY;
        sweepY += (aimSweep - sweepY) * lungeEase * ABYSS_LUNGE_AIM;
        reachLen += ABYSS_LUNGE_EXTRA_REACH * lungeEase;
        // Reach toward frogman's lane at peak snap
        const desiredTipX = t.lungeTargetX + 18;
        const currentTipX = baseX - reachLen;
        const reachGap = currentTipX - desiredTipX;
        if (reachGap > 0) {
          reachLen += reachGap * lungeEase * 0.68;
        }
      }

      const path = computeHorizontalTentaclePath(
        baseX,
        baseY,
        reachLen,
        sweepY,
        time,
        t.side,
      );
      const tipHit = tentacleTipHitRect(path.tipX, path.tipY);
      out.push({
        id: t.id,
        side: t.side,
        role,
        baseX,
        baseY,
        reachUp: reachLen,
        sweep: sweepY,
        tipX: path.tipX,
        tipY: path.tipY,
        hitRect: tipHit,
        hp: t.jointHp,
        maxHp: t.maxJointHp,
        dying: t.dying,
        deathTimer: t.deathTimer,
        shakePhase: t.shakePhase,
        fallOffsetY: t.fallOffsetY,
        hitFlash: time < t.hitFlashUntil,
        destroyed: t.destroyed,
        lunging,
        lungeProgress,
        segments: path.segments,
      });
    }
    return out;
  }

  getBodyHitRect(): Rect | null {
    if (!this.allTentaclesDestroyed() || !this.eyeOpen) return null;
    return {
      x: this.squidX - 148,
      y: this.squidY - 58,
      w: 56,
      h: 48,
    };
  }

  private fireArenaAttack() {
    const player = this.callbacks.getPlayer();

    if (this.eyeOpen && Math.random() > 0.45) {
      this.callbacks.spawnInk(this.squidX, this.squidY - 40);
    }
    if (this.eyeOpen && this.sonarCooldown <= 0) {
      this.sonarPulse = 1;
      this.sonarCooldown = 4500;
      this.callbacks.pulseFx(5, 0.15);
      if (!this.isInvincibleToSonar(player)) {
        this.callbacks.damagePlayer(1, "Sonar pulse");
        this.callbacks.showPopup("SONAR BLAST!", 900);
      }
    } else {
      this.sonarCooldown -= 100;
    }

    if (Math.random() > 0.35) {
      const sx = 120 + Math.random() * (VIEW_W * 0.45);
      const sy = ABYSS_ARENA_Y + 60 + Math.random() * 80;
      this.callbacks.spawnEnemy("laser_shark", sx, sy);
    }

    if (this.eyeOpen) {
      this.callbacks.fireBullet(this.squidX - 130, this.squidY - 20, -5.2, 0, true);
    }
  }

  private isInvincibleToSonar(player: { x: number; y: number }): boolean {
    const dx = player.x - this.squidX;
    const dy = player.y - (this.squidY - 30);
    return Math.hypot(dx, dy) > 200;
  }

  private tickInk(dtMs: number) {
    const now = this.callbacks.getTimeMs();
    this.inkClouds = this.inkClouds.filter((c) => now - c.bornMs < 4200);
    for (const cloud of this.inkClouds) {
      cloud.r += dtMs * 0.018;
    }
  }

  addInkCloud(x: number, y: number) {
    this.inkClouds.push({ x, y, r: 28, bornMs: this.callbacks.getTimeMs() });
  }

  private tentacleSegmentHazards(layout: AbyssTentacleLayout): AbyssTentacleHazardRect[] {
    const out: AbyssTentacleHazardRect[] = [];
    const pad = layout.lunging ? ABYSS_HAZARD_PAD_LUNGE : 12;
    const points = layout.segments?.length
      ? layout.segments
      : [
          { x: layout.baseX, y: layout.baseY + layout.sweep },
          { x: layout.tipX, y: layout.tipY },
        ];
    for (let s = 1; s < points.length; s++) {
      const p = points[s];
      out.push({
        id: layout.id,
        x: p.x - pad,
        y: p.y - pad,
        w: pad * 2,
        h: pad * 2,
        damages: true,
      });
    }
    return out;
  }

  getAscentTentacleHazards(_cameraY: number): AbyssTentacleHazardRect[] {
    if (this.mode !== "ascent" || !this.engaged || !this.isCombatActive()) return [];
    const time = this.callbacks.getTimeMs();
    const out: AbyssTentacleHazardRect[] = [];
    for (const layout of this.getTentacleLayouts(time)) {
      if (layout.dying) continue;
      if (layout.role === "lasher" && layout.lunging) {
        out.push(...this.tentacleSegmentHazards(layout));
        out.push({
          id: layout.id,
          x: layout.tipX - 18,
          y: layout.tipY - 18,
          w: 36,
          h: 36,
          damages: true,
        });
      }
    }
    return out;
  }

  getArenaTentacleHazards(): AbyssTentacleHazardRect[] {
    if (this.mode !== "arena" || !this.engaged || !this.isCombatActive()) return [];
    const time = this.callbacks.getTimeMs();
    const out: AbyssTentacleHazardRect[] = [];
    for (const layout of this.getTentacleLayouts(time)) {
      if (layout.dying) continue;
      if (layout.role === "lasher" && layout.lunging) {
        out.push(...this.tentacleSegmentHazards(layout));
        out.push({
          id: layout.id,
          x: layout.tipX - 18,
          y: layout.tipY - 18,
          w: 36,
          h: 36,
          damages: true,
        });
      }
    }
    return out;
  }

  tryHitSpear(hitRect: Rect, damage: number, spearTip?: { x: number; y: number }): boolean {
    if (this.defeated || !this.engaged) return false;
    const time = this.callbacks.getTimeMs();

    for (const layout of this.getTentacleLayouts(time)) {
      if (layout.dying) continue;
      const t = this.tentacles[layout.id];
      if (!t || !this.tentacleActive(t)) continue;
      const tipHit = layout.hitRect;
      const hit = spearTip
        ? pointInRect(spearTip.x, spearTip.y, tipHit)
        : rectsOverlap(hitRect, tipHit);
      if (hit) {
        this.damageTentacle(t, damage);
        return true;
      }
    }

    const body = this.getBodyHitRect();
    if (body && rectsOverlap(hitRect, body)) {
      this.damageEye(damage);
      return true;
    }
    return false;
  }

  tryHitSonicWave(waveCenterX: number, waveCenterY: number, radius: number, damage: number): boolean {
    if (this.defeated) return false;
    const hitRect: Rect = {
      x: waveCenterX - radius,
      y: waveCenterY - radius,
      w: radius * 2,
      h: radius * 2,
    };
    return this.tryHitSpear(hitRect, damage);
  }

  private damageTentacle(t: AbyssTentacleState, damage: number) {
    if (!this.tentacleActive(t)) return;
    const now = this.callbacks.getTimeMs();
    t.jointHp -= damage;
    t.hitFlashUntil = now + ABYSS_TENTACLE_HIT_FLASH_MS;
    this.hitFlashUntil = now + 120;
    this.bossDamageDealt += damage;
    if (t.jointHp <= 0 && !t.dying) {
      t.dying = true;
      t.deathTimer = 0;
      t.jointHp = 0;
      this.callbacks.pulseFx(7, 0.14);
    }
  }

  damageEye(amount: number) {
    if (!this.allTentaclesDestroyed() || !this.eyeOpen) return;
    this.hp -= amount;
    this.bossDamageDealt += amount;
    this.hitFlashUntil = this.callbacks.getTimeMs() + 100;
    this.callbacks.addScore(ABYSS_EYE_HIT_SCORE);
    if (this.hp <= 0) {
      this.beginDefeat();
    }
  }

  damageRainbow() {
    if (this.defeated || !this.engaged) return;
    const time = this.callbacks.getTimeMs();
    const layouts = this.getTentacleLayouts(time).filter((l) => !l.dying);
    let hit = false;

    if (layouts.length > 0) {
      const player = this.callbacks.getPlayer();
      let closest = layouts[0];
      let bestDist = Infinity;
      for (const layout of layouts) {
        const dist = Math.hypot(layout.tipX - player.x, layout.tipY - player.y);
        if (dist < bestDist) {
          bestDist = dist;
          closest = layout;
        }
      }
      const t = this.tentacles[closest.id];
      if (t && this.tentacleActive(t)) {
        this.damageTentacle(t, ABYSS_RAINBOW_DAMAGE);
        hit = true;
      }
    } else if (this.allTentaclesDestroyed() && this.eyeOpen) {
      this.damageEye(ABYSS_RAINBOW_DAMAGE);
      hit = true;
    }

    if (hit) this.callbacks.pulseFx(4, 0.08);
  }

  getSpearDamage(): number {
    return ABYSS_SPEAR_DAMAGE;
  }

  getSonicTentacleDamage(): number {
    return Math.max(4, Math.floor(ABYSS_SPEAR_DAMAGE * 0.6));
  }

  private beginDefeat() {
    this.hp = 0;
    this.defeated = true;
    this.collapsing = true;
    this.collapseHold = 0;
    this.collapsePhase = "sink";
    this.callbacks.addScore(ABYSS_BOSS_DEFEATED_SCORE);
    this.callbacks.showPopup("THE ABYSS DEFEATED", 2800);
    this.callbacks.pulseFx(14, 0.35);
  }

  private tickCollapse(dtMs: number) {
    this.collapseHold += dtMs;
    if (this.collapsePhase === "sink") {
      this.squidY += dtMs * 0.08;
      if (this.collapseHold >= COLLAPSE_SINK_MS) {
        this.collapsePhase = "epilogue";
        this.collapseHold = 0;
        this.victoryMissionBanner =
          this.callbacks.getCompleteBanner() ?? "CAMP POSEIDON SECURED";
      }
    } else if (this.collapsePhase === "epilogue") {
      if (this.collapseHold >= COLLAPSE_EPILOGUE_MS) {
        this.collapsePhase = "done";
        this.collapsing = false;
        this.callbacks.onDefeated();
      }
    }
  }

  getArenaPlatform() {
    return ABYSS_ARENA_PLATFORM;
  }

  isArenaLocked(): boolean {
    return this.mode === "arena";
  }
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function drawAbyssArenaSilhouette(ctx: CanvasRenderingContext2D, time: number) {
  ctx.fillStyle = "rgba(4,12,28,0.92)";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const pulse = 0.5 + Math.sin(time / 400) * 0.15;
  ctx.fillStyle = `rgba(180,40,40,${pulse * 0.35})`;
  ctx.beginPath();
  ctx.ellipse(VIEW_W / 2, VIEW_H * 0.82, 180, 90, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e8c040";
  ctx.font = "bold 28px monospace";
  ctx.textAlign = "center";
  ctx.fillText("THE ABYSS", VIEW_W / 2, VIEW_H * 0.38);
  ctx.fillStyle = "#8899aa";
  ctx.font = "16px monospace";
  ctx.fillText("Don't let it catch you.", VIEW_W / 2, VIEW_H * 0.46);
  ctx.textAlign = "left";
}
