/**
 * Centralized React Query key factory. Every cached query MUST derive its key
 * from here so consumers across the app (pages + persistent shell rails) share
 * the same cache entry and de-duplicate fetches on navigation/remount.
 */
export const queryKeys = {
  viewerProfile: (userId: string | null) => ["viewer", "profile", userId] as const,
  notifications: (userId: string, v2: boolean) => ["notifications", userId, v2] as const,
  jobsList: (limit: number, cutoff: string) => ["jobs", "list", { limit, cutoff }] as const,
  jobBoardStats: (cutoff: string) => ["jobs", "board-stats", { cutoff }] as const,
  savedJobs: (userId: string) => ["saved-jobs", userId] as const,
  businessesApproved: (limit: number) => ["businesses", "approved", limit] as const,
  bizLikes: (userId: string) => ["biz-likes", userId] as const,
  userDirectory: (viewerId: string | null) => ["profiles", "user-directory", viewerId] as const,
  discoverProfiles: (viewerId: string | null) => ["profiles", "discover", viewerId] as const,
  profileConnections: (viewerId: string | null, targetUserId: string | null) =>
    ["profiles", "connections", { viewerId, targetUserId }] as const,
} as const;
