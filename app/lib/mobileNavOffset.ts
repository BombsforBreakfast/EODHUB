export const MOBILE_NAV_SPACER_VAR = "--mobile-nav-spacer-height";

/** Fallback before NavBar finishes measuring (toolbar row + search + safe-area slack). */
export function defaultMobileNavSpacerPx(): number {
  if (typeof window === "undefined") return 0;
  if (!window.matchMedia("(max-width: 900px)").matches) return 0;
  return 132;
}

export function setMobileNavSpacerPx(px: number): void {
  if (typeof document === "undefined") return;
  if (px <= 0) {
    document.documentElement.style.removeProperty(MOBILE_NAV_SPACER_VAR);
    return;
  }
  document.documentElement.style.setProperty(MOBILE_NAV_SPACER_VAR, `${px}px`);
}

export function readMobileNavSpacerPx(): number {
  if (typeof window === "undefined") return 0;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(MOBILE_NAV_SPACER_VAR).trim();
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultMobileNavSpacerPx();
}

export function isMobileNavLayout(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 900px)").matches;
}
