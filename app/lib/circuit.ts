/** Collapsing Circuit — ephemeral stories-style tiles (24h). Local-dev gated for v1. */

export const CIRCUIT_TTL_MS = 24 * 60 * 60 * 1000;
export const CIRCUIT_THOUGHT_MAX_LEN = 280;
export const CIRCUIT_CAPTION_MAX_LEN = 280;
export const CIRCUIT_TITLE_MAX_LEN = 80;
export const CIRCUIT_MAX_MEDIA = 10;
export const CIRCUIT_SEND_RATE_LIMIT = 15;
export const CIRCUIT_SEND_RATE_WINDOW_MS = 5 * 60 * 1000;

export type CircuitPostType = "media" | "thought" | "event";
export type CircuitMediaType = "image" | "video";

export type CircuitEventSnapshot = {
  id: string;
  title: string;
  date: string;
  description: string | null;
  organization: string | null;
  signup_url: string | null;
  image_url: string | null;
  location: string | null;
  event_time: string | null;
};

export type CircuitPromptDto = {
  id: string;
  slug: string;
  label: string;
  sort_hint: number;
};

export type CircuitMediaDto = {
  id: string;
  sort_order: number;
  media_type: CircuitMediaType;
  public_url: string;
  poster_url: string | null;
};

export type CircuitPostDto = {
  id: string;
  user_id: string;
  /** Display author override when posting as EOD HUB admin (creator remains user_id). */
  post_as_user_id?: string | null;
  prompt_id: string | null;
  prompt_label: string | null;
  post_type: CircuitPostType;
  title: string | null;
  body: string | null;
  event_id: string | null;
  event: CircuitEventSnapshot | null;
  event_interested_count: number;
  event_going_count: number;
  event_my_attendance: "interested" | "going" | null;
  event_saved: boolean;
  created_at: string;
  expires_at: string;
  author_name: string;
  author_photo_url: string | null;
  media: CircuitMediaDto[];
  /** Whether the current viewer has opened this tile. */
  seen: boolean;
};

export type CircuitStripItem =
  | { kind: "post"; post: CircuitPostDto }
  | { kind: "prompt"; prompt: CircuitPromptDto }
  /** Blank + tile — open composer with no prebuilt prompt/title. */
  | { kind: "blank" };

/**
 * Dev: always on.
 * Prod: on by default for founder preview (email-gated via canAccessCollapsingCircuit).
 * Set NEXT_PUBLIC_COLLAPSING_CIRCUIT_PREVIEW=false to hide completely.
 * Set NEXT_PUBLIC_COLLAPSING_CIRCUIT_PUBLIC=true to open to all verified members.
 */
export function isCollapsingCircuitEnabled(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  if (process.env.NEXT_PUBLIC_COLLAPSING_CIRCUIT_PUBLIC === "true") return true;
  if (process.env.NEXT_PUBLIC_COLLAPSING_CIRCUIT_PREVIEW === "false") return false;
  return true;
}

/**
 * Preview allowlist — while Circuit is not fully public, only these accounts see it in prod.
 * Open to everyone with NEXT_PUBLIC_COLLAPSING_CIRCUIT_PUBLIC=true.
 */
export const CIRCUIT_PREVIEW_EMAILS = ["micheal.p.twigg@gmail.com"] as const;

export function isCollapsingCircuitPreviewOnly(): boolean {
  if (process.env.NODE_ENV === "development") return false;
  return process.env.NEXT_PUBLIC_COLLAPSING_CIRCUIT_PUBLIC !== "true";
}

export function canAccessCollapsingCircuit(email: string | null | undefined): boolean {
  if (!isCollapsingCircuitEnabled()) return false;
  if (!isCollapsingCircuitPreviewOnly()) return true;
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return CIRCUIT_PREVIEW_EMAILS.some((allowed) => allowed.toLowerCase() === normalized);
}

export function circuitExpiresAt(from = new Date()): Date {
  return new Date(from.getTime() + CIRCUIT_TTL_MS);
}

/** Fluid type for thought cards — scales down as word count grows. */
export function thoughtFontSizePx(text: string, maxPx = 42, minPx = 18): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const chars = text.trim().length;
  if (words <= 4 && chars <= 28) return maxPx;
  if (words <= 10 && chars <= 70) return Math.round(maxPx * 0.78);
  if (words <= 20 && chars <= 140) return Math.round(maxPx * 0.58);
  if (words <= 35 && chars <= 200) return Math.round(maxPx * 0.48);
  return minPx;
}

function dayBucket(d = new Date()): string {
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shuffleBySeed<T extends { id: string }>(items: T[], seed: string, tag: string): T[] {
  return [...items].sort((a, b) => {
    const ha = hashString(`${seed}:${tag}:${a.id}`);
    const hb = hashString(`${seed}:${tag}:${b.id}`);
    return ha - hb;
  });
}

/** Unseen posts first (with prompts), then seen posts. Stable-per-day within groups.
 *  Always surfaces the full prompt bank so the rail stays stocked even with few posts.
 *  Blank (+) tiles land every ~4 posts (and a few extras when the rail is light). */
export function mixCircuitStrip(
  posts: CircuitPostDto[],
  prompts: CircuitPromptDto[],
  viewerId: string,
): CircuitStripItem[] {
  const seed = `${viewerId}:${dayBucket()}`;
  const unseen = shuffleBySeed(
    posts.filter((p) => !p.seen),
    seed,
    "unseen",
  );
  const seen = shuffleBySeed(
    posts.filter((p) => p.seen),
    seed,
    "seen",
  );
  const shuffledPrompts = shuffleBySeed(prompts, seed, "prompt");
  const allPosts = [...unseen, ...seen];

  const out: CircuitStripItem[] = [];
  let pr = 0;
  let blankCount = 0;
  // Keep freeform + available even on a quiet day.
  const maxBlanks = Math.max(3, Math.ceil(allPosts.length / 4) + 1);

  const pushPrompt = () => {
    if (shuffledPrompts.length === 0) return;
    out.push({
      kind: "prompt",
      prompt: shuffledPrompts[pr % shuffledPrompts.length]!,
    });
    pr += 1;
  };

  const pushBlank = () => {
    if (blankCount >= maxBlanks) return;
    out.push({ kind: "blank" });
    blankCount += 1;
  };

  // Lead with a blank + so free-form posting is always one tap away.
  pushBlank();

  if (allPosts.length === 0) {
    // Quiet rail: blank + every prompt so it still feels alive.
    for (let i = 0; i < shuffledPrompts.length; i++) {
      pushPrompt();
      if ((i + 1) % 3 === 0) pushBlank();
    }
    return out;
  }

  let pi = 0;
  while (pi < allPosts.length) {
    out.push({ kind: "post", post: allPosts[pi]! });
    pi += 1;
    // Prompt titles ~every 2 posts.
    if (pi % 2 === 0) pushPrompt();
    // Blank + every ~4 posts — no prebuilt title.
    if (pi % 4 === 0) pushBlank();
  }

  // Always finish with any prompts not yet shown — full bank, not a 3-tile cap.
  while (pr < shuffledPrompts.length) {
    pushPrompt();
    if (pr % 3 === 0) pushBlank();
  }

  return out;
}
