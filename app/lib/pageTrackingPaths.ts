/** Canonical page paths for page_sessions analytics (stable across dynamic routes). */
export const PAGE_TRACKING = {
  feed: "/",
  jobs: "/jobs",
  events: "/events",
  memorials: "/memorials",
  businesses: "/businesses",
  resources: "/resources",
  groups: "/units",
  profile: "/profile",
  sidebar: "/sidebar",
  admin: "/admin",
} as const;

export type PageTrackingPath = (typeof PAGE_TRACKING)[keyof typeof PAGE_TRACKING];
