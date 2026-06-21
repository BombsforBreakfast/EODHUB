export type RainbowCowboyGamePhase =
  | "playing"
  | "paused"
  | "complete"
  | "game_over";

export type RainbowCowboyEnemyKind =
  | "quad"
  | "fpv"
  | "fixed_wing"
  | "recon"
  | "red_baron"
  | "cargo"
  | "boom_bot"
  | "armored_boom_bot"
  | "grenade_goblin_bot"
  | "hive_turret"
  | "laser_shark"
  | "laser_gator";

export type RainbowCowboyPickupKind =
  | "range_beer"
  | "white_energy_drink"
  | "nicotine_pouch"
  | "rainbow"
  | "unicorn_treat"
  | "weapon_pistol"
  | "weapon_machine_gun"
  | "weapon_bazooka"
  | "weapon_sonic";

export type WeaponKind = "pistol" | "machine_gun" | "bazooka" | "spear" | "sonic";

export type SwimWeaponKind = "spear" | "sonic";

export type RainbowCowboyHazardKind =
  | "landmine"
  | "dynamite"
  | "trash_balloon"
  | "sea_mine_tethered"
  | "sea_mine_floating"
  | "creeper_mine"
  | "floating_log";

export type RainbowCowboyLevelTheme =
  | "pasture"
  | "canyon"
  | "alamo"
  | "hive"
  | "deep_sea"
  | "lake"
  | "abyss";

export type RainbowCowboyPlayMode = "side_scroll" | "swim";

export type RainbowCowboyScrollAxis = "horizontal" | "vertical";

export type RainbowCowboyBossKind = "hive" | "abyss";

export type RainbowCowboyCharacter = "default" | "frogman";

export type RainbowCowboyVictoryCondition = "extraction" | "boss_defeated";

export type RainbowCowboyExtractionGate =
  | "nests_cleared"
  | "final_wave_survived";

export type RainbowCowboyDifficulty = "easy" | "novice" | "hard";

export interface RainbowCowboyLevel {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  objective: string;
  description: string;
  difficulty: string;
  estimatedMinutes: string;
  levelWidth: number;
  groundY: number;
  /** Vertical-scroll levels: world depth (ocean floor Y). */
  levelHeight?: number;
  targetTimeSeconds: number;
  locked?: boolean;
  status?: "playable" | "coming_soon";
  campaignBase?:
    | "fob_thunder"
    | "camp_poseidon"
    | "camp_poseidon_trench"
    | "camp_gator_gulch"
    | "camp_poseidon_abyss"
    | "skywatch";
  isBossLevel?: boolean;
}

export interface RainbowCowboyRunResult {
  levelId: string;
  levelSlug: string;
  score: number;
  rank: string;
  completed: boolean;
  heartsRemaining: number;
  dronesEaten: number;
  balloonsSurvived: number;
  rainbowBlastsUsed: number;
  damageTaken: number;
  durationSeconds: number;
  redBaronsDestroyed: number;
  nestsDestroyed: number;
  bombsDodged: number;
  hiveBossDamage?: number;
  abyssBossDamage?: number;
  turretsDestroyed?: number;
  completeBanner?: string;
  deathCause?: string;
  completedAt: string;
  difficulty: RainbowCowboyDifficulty;
}

export interface RainbowCowboyPersonalBest {
  score: number;
  rank: string;
  durationSeconds: number | null;
  dronesEaten: number;
  difficulty?: RainbowCowboyDifficulty;
}

export interface RainbowCowboyHudSnapshot {
  hearts: number;
  maxHearts: number;
  score: number;
  rainbowCharges: number;
  elapsedSeconds: number;
  status: string;
  gassed: boolean;
  rampage: boolean;
  popupText: string | null;
  popupUntil: number;
  blasterActive: boolean;
  blasterSecondsLeft: number;
  weaponLabel: string | null;
  bazookaAmmo: number;
  bossHp?: number | null;
  bossMaxHp?: number | null;
  bossPhase?: number | null;
  bossHatchOpen?: boolean | null;
  bossSegments?: number | null;
  machineGunAmmo?: number | null;
}

export interface RainbowCowboyEngineSnapshot {
  phase: RainbowCowboyGamePhase;
  hud: RainbowCowboyHudSnapshot;
  cameraX: number;
  cameraY: number;
  playerX: number;
  playerY: number;
  timeMs: number;
  deathCause?: string;
}

export interface LevelPlatform {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LevelWall {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LevelPickupSpawn {
  kind: RainbowCowboyPickupKind;
  x: number;
  y: number;
}

export interface LevelHazardSpawn {
  kind: RainbowCowboyHazardKind;
  x: number;
  y: number;
  timerSeconds?: number;
  /** Floating log width (lake levels). */
  logW?: number;
  logH?: number;
  logVx?: number;
}

export interface LevelEnemySpawn {
  kind: RainbowCowboyEnemyKind;
  triggerX: number;
  /** Vertical levels: spawn when player ascends past this Y. */
  triggerY?: number;
  y: number;
  delayMs?: number;
  popupOnSpawn?: string;
  /** World X for patrol enemies (e.g. laser sharks) instead of spawning off-screen. */
  fixedX?: number;
  patrolMinX?: number;
  patrolMaxX?: number;
  /** Initial swim direction for laser sharks. */
  patrolDir?: 1 | -1;
}

export interface LevelWarning {
  triggerX: number;
  triggerY?: number;
  message: string;
}

export interface LevelNestSpawn {
  x: number;
  y: number;
  spawnIntervalMs?: number;
  spawnKinds?: RainbowCowboyEnemyKind[];
}

export interface LevelHiveTurretSpawn {
  x: number;
  y: number;
}

export interface BossArenaConfig {
  triggerX: number;
  width: number;
  hiveMaxHp: number;
  immediate?: boolean;
}

export interface LevelConfig {
  level: RainbowCowboyLevel;
  theme?: RainbowCowboyLevelTheme;
  playMode?: RainbowCowboyPlayMode;
  scrollAxis?: RainbowCowboyScrollAxis;
  character?: RainbowCowboyCharacter;
  storyIntro?: string;
  completeBanner?: string;
  difficulty?: RainbowCowboyDifficulty;
  difficultySpeedMult?: number;
  victoryCondition?: RainbowCowboyVictoryCondition;
  bossKind?: RainbowCowboyBossKind;
  bossArena?: BossArenaConfig;
  platforms: LevelPlatform[];
  walls: LevelWall[];
  pickups: LevelPickupSpawn[];
  hazards: LevelHazardSpawn[];
  enemies: LevelEnemySpawn[];
  warnings?: LevelWarning[];
  nests?: LevelNestSpawn[];
  hiveTurrets?: LevelHiveTurretSpawn[];
  extractionX: number;
  /** Vertical levels: reach this Y to trigger extraction (ascent boss uses arena instead). */
  extractionY?: number;
  /** Extraction stays locked until any listed condition is met. */
  extractionGate?: RainbowCowboyExtractionGate[];
  finalWave?: {
    triggerX: number;
    message?: string;
    bonusScore: number;
    enemies: LevelEnemySpawn[];
  };
  /** Spawns when the player collects unicorn_treat (Deep Sea rampage finale). */
  rampageWave?: {
    message?: string;
    enemies: LevelEnemySpawn[];
  };
}
