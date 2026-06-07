export type ArcadeGameId = "rainbow_cowboy" | "render_safe";

export type GameLeaderboardEntry = {
  userId: string;
  displayName: string;
  photoUrl: string | null;
  service: string | null;
  isEmployer: boolean;
  score: number;
  rank: string | null;
  durationSeconds: number | null;
  completedAt: string;
};
