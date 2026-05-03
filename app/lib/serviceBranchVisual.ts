/**
 * Avatar ring colors — keep in sync with PostLikersStack / profile wall (`getServiceRingColor` callers).
 */
/** Military memorial branch — normalize labels so themes match imports / legacy rows. */
export function isMarinesService(service: string | null | undefined): boolean {
  const raw = typeof service === "string" ? service.trim() : "";
  if (!raw) return false;
  const lower = raw.toLowerCase();
  return (
    lower === "marines" ||
    lower === "marine corps" ||
    lower === "usmc" ||
    lower === "u.s. marine corps" ||
    lower === "u.s.m.c." ||
    lower === "united states marine corps"
  );
}

export function getServiceRingColor(service: string | null | undefined): string | null {
  const s = typeof service === "string" ? service.trim() : "";
  if (!s) return null;
  if (isMarinesService(s)) return "#bf0a30";
  switch (s) {
    case "Army":
      return "#556b2f";
    case "Navy":
      return "#003087";
    case "Air Force":
      return "#00b0f0";
    case "Marines":
      return "#bf0a30";
    case "Civilian Bomb Tech":
      return "#000000";
    case "Civil Service":
      return "#d97706";
    case "Federal":
      return "#7c3aed";
    default:
      return null;
  }
}

/** Branch choices for military memorials (matches `profiles.service` / `ServiceSealValue`). */
export const MEMORIAL_MILITARY_SERVICE_OPTIONS = ["Army", "Navy", "Marines", "Air Force"] as const;

/** Inner memorial card fill — tinted like legacy orange military cards, driven by branch accent. */
export function memorialMilitaryInnerBg(accentHex: string, isDark: boolean): string {
  if (isDark) return `color-mix(in srgb, ${accentHex} 26%, #0a0908)`;
  return `color-mix(in srgb, ${accentHex} 14%, #ffffff)`;
}

export function memorialMilitaryCommentBg(accentHex: string, isDark: boolean): string {
  if (isDark) return `color-mix(in srgb, ${accentHex} 34%, #100c0a)`;
  return `color-mix(in srgb, ${accentHex} 20%, #fffaf6)`;
}

export function memorialMilitaryBorder(accentHex: string, isDark: boolean): string {
  if (isDark) return `color-mix(in srgb, ${accentHex} 52%, #000000)`;
  return `color-mix(in srgb, ${accentHex} 38%, #ffffff)`;
}
