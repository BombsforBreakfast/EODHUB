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
  | "laser_shark"
  | "elite_laser_shark"
  | "rov_drone"
  | "laser_jaws";

export type RainbowCowboyPickupKind =
  | "range_beer"
  | "white_energy_drink"
  | "nicotine_pouch"
  | "rainbow"
  | "unicorn_treat"
  | "weapon_pistol"
  | "weapon_machine_gun"
  | "weapon_bazooka";

export type WeaponKind = "pistol" | "machine_gun" | "bazooka";

export type RainbowCowboyHazardKind =
  | "landmine"
  | "dynamite"
  | "trash_balloon"
  | "sea_mine"
  | "toxic_jelly";

export type RainbowCowboyLevelTheme = "pasture" | "canyon" | "alamo" | "deep_sea";

export type RainbowCowboyExtractionGate =
  | "nests_cleared"
  | "final_wave_survived"
  | "boss_defeated";

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
  targetTimeSeconds: number;
  locked?: boolean;
  status?: "playable" | "coming_soon";
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
  spearReloading?: boolean;
  spearInfinite?: boolean;
}

export interface RainbowCowboyEngineSnapshot {
  phase: RainbowCowboyGamePhase;
  hud: RainbowCowboyHudSnapshot;
  cameraX: number;
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
}

export interface LevelEnemySpawn {
  kind: RainbowCowboyEnemyKind;
  triggerX: number;
  y: number;
  delayMs?: number;
  popupOnSpawn?: string;
}

export interface LevelWarning {
  triggerX: number;
  message: string;
}

export interface LevelNestSpawn {
  x: number;
  y: number;
  spawnIntervalMs?: number;
  spawnKinds?: RainbowCowboyEnemyKind[];
}

export interface LevelConfig {
  level: RainbowCowboyLevel;
  theme?: RainbowCowboyLevelTheme;
  storyIntro?: string;
  completeBanner?: string;
  difficulty?: RainbowCowboyDifficulty;
  difficultySpeedMult?: number;
  platforms: LevelPlatform[];
  walls: LevelWall[];
  pickups: LevelPickupSpawn[];
  hazards: LevelHazardSpawn[];
  enemies: LevelEnemySpawn[];
  warnings?: LevelWarning[];
  nests?: LevelNestSpawn[];
  extractionX: number;
  /** Extraction stays locked until any listed condition is met. */
  extractionGate?: RainbowCowboyExtractionGate[];
  finalWave?: {
    triggerX: number;
    message?: string;
    bonusScore: number;
    enemies: LevelEnemySpawn[];
  };
}
