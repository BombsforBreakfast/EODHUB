export const VIEW_W = 960;
export const VIEW_H = 540;
export const PLAYER_W = 64;
export const PLAYER_H = 64;

/** Frogman swim hitbox — same scale family as PLAYER_W/H (64) */
export const FROGMAN_W = 80;
export const FROGMAN_H = 36;
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
  hive_turret: { w: 48, h: 44 },
  laser_shark: { w: 64, h: 36 },
  laser_gator: { w: 72, h: 28 },
} as const;

export const ENEMY_SPEEDS = {
  quad: -2.2,
  fpv: -4.8,
  fixed_wing: -6.5,
  recon: -2.8,
  red_baron: -1.6,
  cargo: -1.4,
  laser_shark: -2.6,
  laser_gator: 1.85,
} as const;

export const LASER_SHARK_SHOOT_INTERVAL_MS = 2520;
export const LASER_SHARK_BULLET_SPEED = 8.1;
export const SHARK_HOMING = { steer: 0.062, speed: 2.38, bob: 6 } as const;

export const GATOR_KAMIKAZE = { steer: 0.084, speed: 3.12, bob: 2 } as const;
export const GATOR_SURFACE_Y_OFFSET = 18;
/** Offensive hitbox padding while kamikaze-charging (harpoon / slurp / sonic). */
export const GATOR_CHARGE_HIT_PAD_X = 18;
export const GATOR_CHARGE_HIT_PAD_Y = 14;

export const FLOATING_LOG_W = 96;
export const FLOATING_LOG_H = 26;
export const FLOATING_LOG_VX = -1.35;

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

/** Deep Sea Rodeo — Frogman swim level */
export const WATER_SURFACE_Y = 100;
export const SWIM_SPEED = 4.2;
export const SEA_MINE_SIZE = 44;
export const SEA_MINE_SENSE_RADIUS = 112;
export const SEA_MINE_ARM_MS = 756;
/** @deprecated Instant radius replaced by sense + arm timer */
export const SEA_MINE_PROXIMITY = SEA_MINE_SENSE_RADIUS;
export const SEA_MINE_BLAST_RADIUS = 90;
export const SEA_MINE_SCORE = 75;
export const SEA_MINE_BOB_AMP_MIN = 12;
export const SEA_MINE_BOB_AMP_MAX = 34;

/** Floor-crawling mine — creeps R→L, sonic burst when Frogman is overhead */
export const CREEPER_MINE_W = 52;
export const CREEPER_MINE_H = 30;
export const CREEPER_MINE_SPEED = 1.28;
export const CREEPER_OVERHEAD_HALF_W = 40;
/** Wider band — leave this and charge cancels (dodge window) */
export const CREEPER_OVERHEAD_CANCEL_HALF_W = 48;
export const CREEPER_MIN_Y_ABOVE = 50;
export const CREEPER_CHARGE_MS = 600;
export const CREEPER_FIRE_COOLDOWN_MS = 2400;
/** Degrees from straight up for left/right fan bursts */
export const CREEPER_BURST_TILT_DEG = 10;
export const CREEPER_BURST_GROW = 0.49;
export const CREEPER_BURST_DURATION_MS = 1150;
export const CREEPER_BURST_NEAR_HALF = 22;
export const CREEPER_BURST_FAR_SPREAD = 0.36;
/** Collision uses a tighter cone than the visual (fair dodge gaps) */
export const CREEPER_BURST_HIT_MULT = 0.8;
export const CREEPER_CHARGE_CRAWL_MULT = 0.35;
export const CREEPER_MINE_SCORE = 120;
export const MAX_SPEAR_AMMO = 3;
/** @deprecated Spear is unlimited on swim levels — cooldown only */
export const SPEAR_RELOAD_MS = 1500;
export const SPEAR_PROJECTILE_SPEED = 15;
export const SPEAR_FIRE_COOLDOWN_MS = 280;

export const SONIC_PICKUP_CHARGES = 4;
export const SONIC_FIRE_COOLDOWN_MS = 1100;
export const SONIC_WAVE_SPEED = 8.94;
export const SONIC_WAVE_GROW = 0.358;
export const SONIC_WAVE_MAX_RADIUS = 228;
export const SONIC_WAVE_DURATION_MS = 1056;
/** Cone half-height at the muzzle (px) */
export const SONIC_CONE_NEAR_HALF = 14;
/** Cone half-height at the wavefront = length * this ratio */
export const SONIC_CONE_FAR_SPREAD = 0.52;
