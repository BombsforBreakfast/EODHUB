// Normalizes a runtime URL path into a route TEMPLATE for analytics aggregation.
// Without this, /rabbithole/electronics, /rabbithole/cars, /rabbithole/... etc.
// each become their own row in the "top pages" report and the data is useless.
//
// Rules are intentionally simple. Add new patterns here as routes are added.

const NORMALIZERS: Array<{ test: RegExp; template: string }> = [
  { test: /^\/rabbithole\/contribution\/[^/]+\/?$/, template: "/rabbithole/contribution/[id]" },
  { test: /^\/rabbithole\/thread\/[^/]+\/?$/, template: "/rabbithole/thread/[id]" },
  { test: /^\/rabbithole\/[^/]+\/?$/, template: "/rabbithole/[topic]" },
  { test: /^\/units\/[^/]+\/admin\/?$/, template: "/units/[slug]/admin" },
  { test: /^\/units\/[^/]+\/?$/, template: "/units/[slug]" },
  { test: /^\/profile\/[^/]+\/?$/, template: "/profile/[userId]" },
  { test: /^\/job\/[^/]+\/?$/, template: "/job/[id]" },
];

const UUID_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

export function normalizeAnalyticsPath(rawPath: string): string {
  if (!rawPath) return "/";
  // Strip query string + hash; we only care about the route shape.
  const noQuery = rawPath.split("?")[0].split("#")[0] || "/";
  // Trim trailing slash except for root.
  const trimmed = noQuery.length > 1 && noQuery.endsWith("/")
    ? noQuery.slice(0, -1)
    : noQuery;

  for (const n of NORMALIZERS) {
    if (n.test.test(trimmed)) return n.template;
  }
  // Catch-all: replace any UUID inside an unknown path with [id] so we don't
  // explode cardinality if a new dynamic route is added before this file is updated.
  return trimmed.replace(UUID_RE, "[id]");
}

// Coarse user-agent bucket (no fingerprinting). Used for "device mix" cards.
export function summarizeUserAgent(ua: string | null | undefined): string {
  if (!ua) return "unknown";
  const u = ua.toLowerCase();
  let device = "desktop";
  if (/iphone|ipod/.test(u)) device = "mobile-ios";
  else if (/ipad/.test(u)) device = "tablet-ios";
  else if (/android/.test(u)) device = /mobile/.test(u) ? "mobile-android" : "tablet-android";
  else if (/mobile/.test(u)) device = "mobile";

  let browser = "other";
  if (/edg\//.test(u)) browser = "edge";
  else if (/chrome\//.test(u)) browser = "chrome";
  else if (/firefox\//.test(u)) browser = "firefox";
  else if (/safari\//.test(u)) browser = "safari";

  return `${device}-${browser}`;
}
