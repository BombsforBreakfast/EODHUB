import { VIEW_H, VIEW_W } from "./rainbowCowboyConstants";

export const ABYSS_FLOOR_Y = 5200;
export const ABYSS_SURFACE_Y = 80;
export const ABYSS_ARENA_Y = 160;
/** Shallow spawn — player descends from here to find the boss below. */
export const ABYSS_PLAYER_SPAWN_Y = ABYSS_FLOOR_Y - 360;
/** Tentacles begin rising into view as the player passes this depth. */
export const ABYSS_REVEAL_START_Y = ABYSS_FLOOR_Y - 300;
/** Descend past this Y to start the boss fight (ascent chase). */
export const ABYSS_ENGAGE_Y = ABYSS_FLOOR_Y - 140;
/** Boss anchors to the right edge; tentacles lash left toward the player. */
export const ABYSS_BOSS_ANCHOR_X = VIEW_W - 72;
export const ABYSS_BOSS_LURK_X_OFFSET = 220;
/** Default frogman X during the abyss fight — left swim lane. */
export const ABYSS_PLAYER_LANE_X = Math.round(VIEW_W * 0.34);
export const ABYSS_LEVEL_WIDTH = VIEW_W;
export const ABYSS_WORLD_HEIGHT = ABYSS_FLOOR_Y;

export const ABYSS_SCROLL_SPEED = 0.24;
export const ABYSS_SURFACE_PUSH_MULT = 1.15;
export const ABYSS_SQUID_CLIMB_SPEED = 0.28;
export const ABYSS_FALL_DAMAGE_THRESHOLD = VIEW_H * 0.82;
export const ABYSS_FALL_DAMAGE_INTERVAL_MS = 1800;
/** Pause the rising chase when this many tentacles (or fewer) remain. */
export const ABYSS_SCROLL_PAUSE_TENTACLES = 2;

/** Smooth camera / boss settle after the fight begins (ms). */
export const ABYSS_ENGAGE_BLEND_MS = 2600;
/** Extra delay before tentacles start attacking after engage (ms). */
export const ABYSS_ENGAGE_ATTACK_GRACE_MS = 4400;

export const ABYSS_MAX_HP = 100;
export const ABYSS_TENTACLE_JOINT_HP = 40;
export const ABYSS_TENTACLE_DEATH_MS = 900;
export const ABYSS_TENTACLE_COUNT = 8;
/** Radius of the damageable claw tip hit zone (pixels). */
export const ABYSS_TENTACLE_TIP_HIT_R = 10;
export const ABYSS_TENTACLE_HIT_FLASH_MS = 280;
export const ABYSS_LUNGE_MS = 680;
export const ABYSS_LUNGE_COOLDOWN_MS = 3300;
export const ABYSS_LUNGE_EXTRA_REACH = 172;
export const ABYSS_LUNGE_AIM = 0.58;
export const ABYSS_GUNNER_COOLDOWN_MS = 1950;
export const ABYSS_GUNNER_BULLET_SPEED = 3.05;
export const ABYSS_GUNNER_LASER_SPEED = 3.45;
export const ABYSS_TENTACLE_SWEEP_MULT = 0.58;
export const ABYSS_LUNGE_HOMING = 0.043;
export const ABYSS_HAZARD_PAD_LUNGE = 20;

/** Eye phase — boss spits sea mines after all tentacles are destroyed. */
export const ABYSS_EYE_MINE_INTERVAL_MS = 2300;
export const ABYSS_EYE_MINE_INITIAL_DELAY_MS = 1400;
export const ABYSS_EYE_MINE_MAX_ACTIVE = 8;
export const ABYSS_EYE_MINE_ENRAGED_INTERVAL_MULT = 0.78;

export const ABYSS_TENTACLE_DESTROY_SCORE = 500;
export const ABYSS_EYE_HIT_SCORE = 100;
export const ABYSS_BOSS_DEFEATED_SCORE = 5000;
export const ABYSS_COMPLETE_BONUS = 2000;
export const ABYSS_NO_DAMAGE_BONUS = 1500;
export const ABYSS_FAST_TIME_BONUS = 750;

export const ABYSS_SPEAR_DAMAGE = 8;
export const ABYSS_RAINBOW_DAMAGE = 12;

export const ABYSS_ARENA_PLATFORM = {
  x: VIEW_W / 2 - 220,
  y: ABYSS_ARENA_Y,
  w: 440,
  h: 24,
};

export const ABYSS_SECTION_Y = {
  floor: 4800,
  ship: 4000,
  minefield: 3200,
  sharkGauntlet: 2400,
  subGraveyard: 1600,
  surfacePush: 900,
  arena: ABYSS_ARENA_Y + 80,
} as const;
