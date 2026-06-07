export const VIEW_W = 960;
export const VIEW_H = 540;
export const PLAYER_W = 64;
export const PLAYER_H = 64;
export const GROUND_TILE = 16;
export const MAX_HEARTS = 5;
export const MAX_RAINBOW_CHARGES = 3;

export const GRAVITY = 0.72;
export const JUMP_VEL = -13.5;
export const MOVE_SPEED = 5;
export const GASSED_MOVE_MULT = 0.45;
export const RAMPAGE_SPEED_MULT = 2;
export const BOOST_SPEED_MULT = 1.35;

export const TONGUE_LENGTH = 130;
export const TONGUE_DURATION_MS = 280;
export const TONGUE_COOLDOWN_MS = 500;
export const GASSED_DURATION_MS = 5000;
export const RAMPAGE_DURATION_MS = 5000;
export const SPEED_BOOST_MS = 2000;
export const INVINCIBLE_FLASH_MS = 800;
export const KNOCKBACK_DECAY = 0.88;

export const DYNAMITE_RADIUS = 90;
export const LANDMINE_RADIUS = 44;
export const LANDMINE_EXPLODE_MS = 1100;
export const RAINBOW_BLAST_RADIUS = 420;

export const ENEMY_SIZES = {
  quad: { w: 48, h: 44 },
  fpv: { w: 40, h: 36 },
  fixed_wing: { w: 56, h: 32 },
} as const;

export const ENEMY_SPEEDS = {
  quad: -2.2,
  fpv: -4.8,
  fixed_wing: -6.5,
} as const;

/** After the first fly-by, drones steer toward the player. */
export const DRONE_HOMING = {
  quad: { steer: 0.06, speed: 2.6, bob: 8 },
  fpv: { steer: 0.11, speed: 4.4, bob: 4 },
  fixed_wing: { steer: 0.08, speed: 5.2, bob: 2 },
} as const;

export const BALLOON_SIZE = { w: 36, h: 52 };
/** Trash balloons spawn between these offsets above ground (random per balloon). */
export const BALLOON_ALTITUDE = { minAboveGround: 58, maxAboveGround: 168 };
export const PICKUP_SIZE = 28;
export const MINE_SIZE = 38;
export const DYNAMITE_SIZE = 32;
