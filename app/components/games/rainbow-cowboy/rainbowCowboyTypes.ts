export type RainbowCowboyGamePhase =
  | "playing"
  | "paused"
  | "complete"
  | "game_over";

export type RainbowCowboyEnemyKind = "quad" | "fpv" | "fixed_wing";

export type RainbowCowboyPickupKind =
  | "range_beer"
  | "white_monster"
  | "zyn_tin"
  | "rainbow"
  | "unicorn_treat";

export type RainbowCowboyHazardKind = "landmine" | "dynamite" | "trash_balloon";

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
  deathCause?: string;
  completedAt: string;
}

export interface RainbowCowboyPersonalBest {
  score: number;
  rank: string;
  durationSeconds: number | null;
  dronesEaten: number;
}

export interface RainbowCowboyHudSnapshot {
  hearts: number;
  maxHearts: number;
  score: number;
  rainbowCharges: number;
  status: string;
  gassed: boolean;
  rampage: boolean;
  popupText: string | null;
  popupUntil: number;
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
}

export interface LevelConfig {
  level: RainbowCowboyLevel;
  platforms: LevelPlatform[];
  walls: LevelWall[];
  pickups: LevelPickupSpawn[];
  hazards: LevelHazardSpawn[];
  enemies: LevelEnemySpawn[];
  extractionX: number;
}
