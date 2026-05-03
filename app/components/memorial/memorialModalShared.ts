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
const NAVY_MEMORIAL_GOLD_OUTLINE = "#c9a227";

/** Matches `getServiceRingColor("Air Force")` — avatar rings stay bright sky blue; memorial chrome uses ultramarine + yellow. */
const AIR_FORCE_SERVICE_RING = "#00b0f0";
const AIR_FORCE_ULTRAMARINE = "#152563";
const AIR_FORCE_YELLOW_OUTLINE = "#ffb612";

/** Marines CTA / highlights — vivid red (high R, minimal B so it never reads violet). */
const MARINES_MEMORIAL_RED = "#dc2626";
const MARINES_MEMORIAL_GOLD_OUTLINE = "#c9a227";

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
    return {
      color: MARINES_MEMORIAL_RED,
      outlineColor: MARINES_MEMORIAL_GOLD_OUTLINE,
      label: "We Remember",
      darkBg: "#3a1212",
      lightBg: "#fff5f5",
      darkCommentBg: "#4a1818",
      lightCommentBg: "#fecaca",
      darkBorder: "#b91c1c",
      lightBorder: "#f87171",
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
      darkBg: "#071426",
      lightBg: "#e5edf7",
      darkCommentBg: "#0f2139",
      lightCommentBg: "#d2e0f5",
      darkBorder: "#1e3a5f",
      lightBorder: "#9eb6d4",
    };
  }
  if (branchAccent === AIR_FORCE_SERVICE_RING) {
    return {
      color: AIR_FORCE_ULTRAMARINE,
      outlineColor: AIR_FORCE_YELLOW_OUTLINE,
      label: "We Remember",
      darkBg: "#0c1240",
      lightBg: "#e8eaf9",
      darkCommentBg: "#141b52",
      lightCommentBg: "#dce2f5",
      darkBorder: "#283578",
      lightBorder: "#a8b2dc",
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

