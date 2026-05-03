import {
  getServiceRingColor,
  isMarinesService,
  memorialMilitaryBorder,
  memorialMilitaryCommentBg,
  memorialMilitaryInnerBg,
} from "../../lib/serviceBranchVisual";

export type Memorial = {
  id: string;
  user_id: string;
  name: string;
  bio: string | null;
  photo_url: string | null;
  death_date: string;
  created_at: string;
  source_url: string | null;
  category?: "military" | "leo_fed" | null;
  /** When category is military: Army | Navy | Marines | Air Force */
  service?: string | null;
};

export const MEMORIAL_COLUMNS =
  "id, user_id, name, bio, photo_url, death_date, created_at, source_url, category, service";

export const MEMORIAL_MILITARY_COLOR = "#d9582b";
export const MEMORIAL_LEO_COLOR = "#062b4f";

export type MemorialCategory = "military" | "leo_fed" | null | undefined;

export type MemorialThemePalette = {
  /** Accent for text, buttons, header fills — branch / legacy hue */
  color: string;
  /** Outer card border & portrait ring — Navy & Marines gold / Air Force yellow / else matches `color` */
  outlineColor: string;
  label: string;
  darkBg: string;
  lightBg: string;
  darkCommentBg: string;
  lightCommentBg: string;
  darkBorder: string;
  lightBorder: string;
};

/** Military memorials with null / empty / unknown `service` — same orange theme as before branch-specific styling. */
const MEMORIAL_LEGACY_MILITARY_THEME: MemorialThemePalette = {
  color: MEMORIAL_MILITARY_COLOR,
  outlineColor: MEMORIAL_MILITARY_COLOR,
  label: "We Remember",
  darkBg: "#2a1409",
  lightBg: "#fdf3ed",
  darkCommentBg: "#3d1810",
  lightCommentBg: "#fce8d9",
  darkBorder: "#5c2e12",
  lightBorder: "#fbe2cf",
};

const NAVY_BRANCH_BLUE = "#003087";
const NAVY_MEMORIAL_GOLD_OUTLINE = "#d4af37";

/** Matches `getServiceRingColor("Air Force")` — rings stay sky blue; memorial chrome uses lighter branch blue + gold. */
const AIR_FORCE_SERVICE_RING = "#00b0f0";
/** Primary CTA / “Military” label — lighter Air Force blue (not ultramarine). */
const AIR_FORCE_MEMORIAL_BLUE = "#3b82f6";
const AIR_FORCE_MEMORIAL_GOLD = "#d4af37";

/** `getServiceRingColor("Army")` — olive drab; memorial cards use a full green scale around this. */
const ARMY_OLIVE = "#556b2f";
/** Muted olive for buttons and uppercase label (matches admin reference). */
const ARMY_MEMORIAL_PRIMARY = "#5d6e31";
/** Slightly brighter olive for card border / portrait ring. */
const ARMY_MEMORIAL_RING = "#6b8e23";

/** Marines: true scarlet (high R, very low B — same hue as CTAs; dark fills are mixed from this, not brown/purple neutrals). */
const MARINES_MEMORIAL_RED = "#e01010";
const MARINES_MEMORIAL_GOLD_OUTLINE = "#d4af37";

/**
 * Full memorial chrome (feed cards, calendar, modals). Military branch uses the same accent
 * as profile avatar rings when `service` is set; otherwise legacy orange military styling.
 */
export function memorialTheme(category: MemorialCategory, service?: string | null): MemorialThemePalette {
  const isLeoFed = category === "leo_fed";
  if (isLeoFed) {
    return {
      color: MEMORIAL_LEO_COLOR,
      outlineColor: MEMORIAL_LEO_COLOR,
      label: "End of Watch",
      darkBg: "#061a30",
      lightBg: "#eef6ff",
      darkCommentBg: "#0a2542",
      lightCommentBg: "#dceeff",
      darkBorder: "#17476f",
      lightBorder: "#b8d8f3",
    };
  }
  if (isMarinesService(service)) {
    const R = MARINES_MEMORIAL_RED;
    return {
      color: MARINES_MEMORIAL_RED,
      outlineColor: MARINES_MEMORIAL_GOLD_OUTLINE,
      label: "We Remember",
      // Same hue as “Add to scrapbook” — deep scarlet, not burgundy/purple-gray.
      darkBg: `color-mix(in srgb, ${R} 62%, #050000)`,
      lightBg: "#fff8f8",
      darkCommentBg: `color-mix(in srgb, ${R} 44%, #030000)`,
      lightCommentBg: "#ffe8e6",
      darkBorder: `color-mix(in srgb, ${R} 72%, #000000)`,
      lightBorder: "#ffb8ae",
    };
  }

  const branchAccent = getServiceRingColor(service);
  if (!branchAccent) {
    return MEMORIAL_LEGACY_MILITARY_THEME;
  }
  if (branchAccent === NAVY_BRANCH_BLUE) {
    return {
      color: NAVY_BRANCH_BLUE,
      outlineColor: NAVY_MEMORIAL_GOLD_OUTLINE,
      label: "We Remember",
      darkBg: "#030d18",
      lightBg: "#e8eef6",
      darkCommentBg: "#0a1a2e",
      lightCommentBg: "#d6e0f0",
      darkBorder: "#1a3a5c",
      lightBorder: "#9eb4cc",
    };
  }
  if (branchAccent === AIR_FORCE_SERVICE_RING) {
    return {
      color: AIR_FORCE_MEMORIAL_BLUE,
      outlineColor: AIR_FORCE_MEMORIAL_GOLD,
      label: "We Remember",
      darkBg: "#0f1f33",
      lightBg: "#eef4fc",
      darkCommentBg: "#162a45",
      lightCommentBg: "#dce8f8",
      darkBorder: "#2d4a72",
      lightBorder: "#a8c0e0",
    };
  }
  if (branchAccent === ARMY_OLIVE) {
    return {
      color: ARMY_MEMORIAL_PRIMARY,
      outlineColor: ARMY_MEMORIAL_RING,
      label: "We Remember",
      darkBg: "#121608",
      lightBg: "#f3f5ec",
      darkCommentBg: "#1a2210",
      lightCommentBg: "#e5e9da",
      darkBorder: "#3d4a28",
      lightBorder: "#c4ccb0",
    };
  }
  return {
    color: branchAccent,
    outlineColor: branchAccent,
    label: "We Remember",
    darkBg: memorialMilitaryInnerBg(branchAccent, true),
    lightBg: memorialMilitaryInnerBg(branchAccent, false),
    darkCommentBg: memorialMilitaryCommentBg(branchAccent, true),
    lightCommentBg: memorialMilitaryCommentBg(branchAccent, false),
    darkBorder: memorialMilitaryBorder(branchAccent, true),
    lightBorder: memorialMilitaryBorder(branchAccent, false),
  };
}

