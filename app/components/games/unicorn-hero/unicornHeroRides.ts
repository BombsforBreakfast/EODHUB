export type UnicornHeroRideType = "unicorn" | "eod_robot";

export interface UnicornHeroRideConfig {
  id: UnicornHeroRideType;
  label: string;
  description: string;
  attackLabel: string;
  specialLabel: string;
}

export const UNICORN_HERO_RIDES: UnicornHeroRideConfig[] = [
  {
    id: "unicorn",
    label: "Pink Unicorn",
    description: "Classic chaos mode. Tongue attack, rainbow fart bomb, maximum nonsense.",
    attackLabel: "Tongue",
    specialLabel: "Rainbow Fart Bomb",
  },
  {
    id: "eod_robot",
    label: "EOD Robot",
    description: "Remote tech mode. Gripper arm, tracked movement, same arcade mayhem.",
    attackLabel: "Gripper Arm",
    specialLabel: "Rainbow Discharge",
  },
];

export const DEFAULT_UNICORN_HERO_RIDE: UnicornHeroRideType = "unicorn";

const SELECTED_RIDE_KEY = "unicornHero_selectedRide";

export function getUnicornHeroRideConfig(id: UnicornHeroRideType): UnicornHeroRideConfig {
  return UNICORN_HERO_RIDES.find((r) => r.id === id) ?? UNICORN_HERO_RIDES[0];
}

export function loadUnicornHeroSelectedRide(): UnicornHeroRideType {
  if (typeof window === "undefined") return DEFAULT_UNICORN_HERO_RIDE;
  try {
    const raw = localStorage.getItem(SELECTED_RIDE_KEY);
    if (raw === "unicorn" || raw === "eod_robot") return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_UNICORN_HERO_RIDE;
}

export function saveUnicornHeroSelectedRide(ride: UnicornHeroRideType): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SELECTED_RIDE_KEY, ride);
  } catch {
    /* ignore */
  }
}

export function getRideStatusAttack(ride: UnicornHeroRideType): string {
  return ride === "eod_robot" ? "GRAB!" : "SLURP!";
}

export function getRideStatusRiding(ride: UnicornHeroRideType): string {
  return ride === "eod_robot" ? "Rolling" : "Riding";
}

export function getRideBadAttackPopup(ride: UnicornHeroRideType): string {
  return ride === "eod_robot" ? "BAD GRAB" : "BAD SLURP";
}

export function getRideExtractionLine(ride: UnicornHeroRideType): string {
  return ride === "eod_robot"
    ? "The robot made it. Remote ops rewarded."
    : "The unicorn made it. Poor life choices rewarded.";
}
