export const VIEW_W = 960;
export const VIEW_H = 540;
export const PLAYER_W = 64;
export const PLAYER_H = 64;
export const GROUND_TILE = 16;
export const MAX_HEARTS = 5;
export const MAX_RAINBOW_CHARGES = 3;

export const GRAVITY = 0.72;
export const JUMP_VEL = -14.8;
/** Accept jump presses slightly before landing (ms). */
export const JUMP_BUFFER_MS = 175;
/** Allow jump shortly after walking off a ledge (ms). */
export const COYOTE_TIME_MS = 125;
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
/** Tongue / body overlap — matches the visible plate (~30px wide). */
export const LANDMINE_BODY_RADIUS = 15;
/** Foot-level horizontal trigger — narrow plate so jumps can clear more easily. */
export const LANDMINE_TRIGGER_RADIUS = 16;
/** Feet must be at least this far above ground to pass over without detonating. */
export const LANDMINE_CLEAR_HEIGHT = 38;
/** Horizontal half-width when airborne but not fully cleared (feet-only). */
export const LANDMINE_AIRBORNE_HALF_W = 9;
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
  boom_bot: { w: 54, h: 38 },
  armored_boom_bot: { w: 62, h: 44 },
  grenade_goblin_bot: { w: 58, h: 40 },
  laser_shark: { w: 72, h: 36 },
  elite_laser_shark: { w: 88, h: 44 },
  rov_drone: { w: 44, h: 36 },
  laser_jaws: { w: 120, h: 56 },
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

export const BOOM_BOT_HP = 3;
export const ARMORED_BOOM_BOT_HP = 5;
export const GOBLIN_BOT_HP = 3;
export const BOOM_BOT_SPEED = 2.9;
export const ARMORED_BOOM_BOT_SPEED = 1.55;
export const GOBLIN_BOT_SPEED = 2.2;
export const BOOM_BOT_EXPLOSION_RADIUS = 72;
export const ARMORED_BOOM_BOT_EXPLOSION_RADIUS = 98;
export const GOBLIN_THROW_INTERVAL_MS = 2100;
export const TURRET_TRUCK_SHOOT_INTERVAL_MS = 2400;
export const TURRET_TRUCK_TURN_SPEED = 0.045;
export const TURRET_BULLET_SPEED = 5.5;
export const ENEMY_BULLET_RADIUS = 5;
export const BLASTER_DURATION_MS = 20000;
export const BLASTER_FIRE_COOLDOWN_MS = 160;
export const MACHINE_GUN_FIRE_COOLDOWN_MS = 68;
export const BAZOOKA_FIRE_COOLDOWN_MS = 520;
export const BAZOOKA_ROCKETS_PER_PICKUP = 3;
export const BLASTER_PROJECTILE_SPEED = 15;
export const BAZOOKA_PROJECTILE_SPEED = 11;
export const BLASTER_PROJECTILE_W = 14;
export const BLASTER_PROJECTILE_H = 6;
export const BAZOOKA_PROJECTILE_W = 36;
export const BAZOOKA_PROJECTILE_H = 8;

export const BALLOON_SIZE = { w: 36, h: 52 };
/** Trash balloons spawn between these offsets above ground (random per balloon). */
export const BALLOON_ALTITUDE = { minAboveGround: 58, maxAboveGround: 168 };
export const PICKUP_SIZE = 28;
export const MINE_SIZE = 38;
export const DYNAMITE_SIZE = 32;

/** Deep Sea Rodeo — Spear Gun */
export const SPEAR_MAGAZINE_CAPACITY = 3;
export const SPEAR_RELOAD_MS = 1750;
export const SPEAR_FIRE_COOLDOWN_MS = 220;
export const SPEAR_PROJECTILE_SPEED = 11;
export const SPEAR_PROJECTILE_W = 28;
export const SPEAR_PROJECTILE_H = 6;
export const LASER_SHARK_HP = 2;
export const ELITE_LASER_SHARK_HP = 3;
export const ROV_DRONE_HP = 1;
export const LASER_JAWS_HP = 10;
export const RAINBOW_BLAST_BOSS_DAMAGE = 3;
export const TOXIC_JELLY_PENALTY = 100;
export const SEA_MINE_SCORE = 75;

export const UNDERWATER_ENEMY_SPEEDS = {
  laser_shark: -3.2,
  elite_laser_shark: -2.4,
  rov_drone: -2.8,
} as const;

export const UNDERWATER_HOMING = {
  laser_shark: { steer: 0.09, speed: 3.4, bob: 10 },
  elite_laser_shark: { steer: 0.07, speed: 2.8, bob: 8 },
  rov_drone: { steer: 0.1, speed: 3.0, bob: 6 },
} as const;
