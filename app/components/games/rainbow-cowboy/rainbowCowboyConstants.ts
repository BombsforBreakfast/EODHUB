export const VIEW_W = 960;
export const VIEW_H = 540;
export const PLAYER_W = 64;
export const PLAYER_H = 64;
export const GROUND_TILE = 16;
export const MAX_HEARTS = 5;
export const MAX_RAINBOW_CHARGES = 3;

export const GRAVITY = 0.72;
export const JUMP_VEL = -14.8;
export const MOVE_SPEED = 5;
export const DUCK_SPEED_MULT = 0.5;
export const GASSED_MOVE_MULT = 0.45;
export const RAMPAGE_SPEED_MULT = 2;
export const BOOST_SPEED_MULT = 1.35;

export const TONGUE_LENGTH = 130;
export const TONGUE_DURATION_MS = 260;
export const TONGUE_COOLDOWN_MS = 320;
export const TONGUE_HOMING_RANGE = 210;
export const TONGUE_TIP_RADIUS = 16;
export const GASSED_DURATION_MS = 5000;
export const RAMPAGE_DURATION_MS = 5000;
export const SPEED_BOOST_MS = 2000;
export const INVINCIBLE_FLASH_MS = 800;
export const KNOCKBACK_DECAY = 0.88;

export const DYNAMITE_RADIUS = 90;
/** Tongue / body overlap — matches the visible plate (~38px wide). */
export const LANDMINE_BODY_RADIUS = 20;
/** Foot-level horizontal trigger — tighter than the old 54px half-width. */
export const LANDMINE_TRIGGER_RADIUS = 24;
/** Feet must be at least this far above ground to pass over without detonating. */
export const LANDMINE_CLEAR_HEIGHT = 50;
/** @deprecated Use LANDMINE_BODY_RADIUS — kept for any external refs */
export const LANDMINE_RADIUS = LANDMINE_BODY_RADIUS;
export const LANDMINE_EXPLODE_MS = 1100;
export const RAINBOW_BLAST_RADIUS = 420;

export const ENEMY_SIZES = {
  quad: { w: 48, h: 44 },
  fpv: { w: 40, h: 36 },
  fixed_wing: { w: 56, h: 32 },
  recon: { w: 36, h: 32 },
  red_baron: { w: 56, h: 48 },
  cargo: { w: 60, h: 44 },
} as const;

export const ENEMY_SPEEDS = {
  quad: -2.2,
  fpv: -4.8,
  fixed_wing: -6.5,
  recon: -2.8,
  red_baron: -1.6,
  cargo: -1.4,
} as const;

/** After the first fly-by, drones steer toward the player. */
export const DRONE_HOMING = {
  quad: { steer: 0.06, speed: 2.6, bob: 8 },
  fpv: { steer: 0.11, speed: 4.4, bob: 4 },
  fixed_wing: { steer: 0.08, speed: 5.2, bob: 2 },
  recon: { steer: 0.04, speed: 2.0, bob: 6 },
  red_baron: { steer: 0.03, speed: 1.4, bob: 5 },
  cargo: { steer: 0.02, speed: 1.2, bob: 3 },
} as const;

export const RED_BARON_BOMB_INTERVAL_MS = 1000;
export const RED_BARON_BOMB_WARNING_MS = 350;
export const BOMB_RADIUS = 58;
export const BOMB_FUSE_MS = 750;
export const BOMB_GRAVITY = 0.55;
export const NEST_W = 48;
export const NEST_H = 40;
export const NEST_DEFAULT_SPAWN_MS = 1000;

export const BALLOON_SIZE = { w: 36, h: 52 };
/** Trash balloons spawn between these offsets above ground (random per balloon). */
export const BALLOON_ALTITUDE = { minAboveGround: 58, maxAboveGround: 168 };
export const PICKUP_SIZE = 28;
export const MINE_SIZE = 38;
export const DYNAMITE_SIZE = 32;
