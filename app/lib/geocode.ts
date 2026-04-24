const SESSION_KEY = "eod_geocache_v2";

export type LatLng = [number, number]; // [lat, lng]

function readCache(): Record<string, LatLng | null> {
  if (typeof sessionStorage === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Record<string, LatLng | null>) : {};
  } catch {
    return {};
  }
}

function writeCache(key: string, value: LatLng | null): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const cache = readCache();
    cache[key] = value;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(cache));
  } catch {}
}

/** Geocode a 5-digit US ZIP code to [lat, lng]. */
export async function geocodeZip(zip: string): Promise<LatLng | null> {
  const key = `zip:${zip}`;
  const cache = readCache();
  if (key in cache) return cache[key];

  try {
    const r = await fetch(`https://api.zippopotam.us/us/${zip}`);
    if (!r.ok) {
      writeCache(key, null);
      return null;
    }
    const d = (await r.json()) as {
      places?: Array<{ latitude: string; longitude: string }>;
    };
    const p = d.places?.[0];
    if (!p) {
      writeCache(key, null);
      return null;
    }
    const v: LatLng = [parseFloat(p.latitude), parseFloat(p.longitude)];
    writeCache(key, v);
    return v;
  } catch {
    writeCache(key, null);
    return null;
  }
}

async function geocodeCityState(city: string, state: string): Promise<LatLng | null> {
  const key = `city:${city.toLowerCase().trim()}:${state.toUpperCase().trim()}`;
  const cache = readCache();
  if (key in cache) return cache[key];

  try {
    const r = await fetch(
      `https://api.zippopotam.us/us/${encodeURIComponent(state.trim())}/${encodeURIComponent(city.trim())}`
    );
    if (!r.ok) {
      writeCache(key, null);
      return null;
    }
    const d = (await r.json()) as {
      places?: Array<{ latitude: string; longitude: string }>;
    };
    const p = d.places?.[0];
    if (!p) {
      writeCache(key, null);
      return null;
    }
    const v: LatLng = [parseFloat(p.latitude), parseFloat(p.longitude)];
    writeCache(key, v);
    return v;
  } catch {
    writeCache(key, null);
    return null;
  }
}

/**
 * Geocode a free-text location string.
 * Tries (in order): embedded ZIP code → "City, ST" two-letter state format.
 * Returns null for "Remote" or unresolvable locations.
 */
export async function geocodeLocation(location: string): Promise<LatLng | null> {
  const trimmed = location.trim();
  if (!trimmed || /remote/i.test(trimmed)) return null;

  const key = `loc:${trimmed.toLowerCase()}`;
  const cache = readCache();
  if (key in cache) return cache[key];

  // Embedded ZIP code
  const zipMatch = /\b(\d{5})\b/.exec(trimmed);
  if (zipMatch) {
    const v = await geocodeZip(zipMatch[1]);
    writeCache(key, v);
    return v;
  }

  // "City, ST" where ST is a two-letter state code
  const csMatch = /^(.+?),\s*([A-Za-z]{2})\s*$/.exec(trimmed);
  if (csMatch) {
    const [, city, state] = csMatch;
    const v = await geocodeCityState(city, state);
    if (v) {
      writeCache(key, v);
      return v;
    }
  }

  writeCache(key, null);
  return null;
}

/** Haversine distance between two lat/lng pairs, in miles. */
export function distanceMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 3958.8;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
