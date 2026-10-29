import gazetteer from "./jobLocationIndex.generated.json";

const counties: Record<string, string> = gazetteer.counties;
const places: Record<string, string> = gazetteer.place;

// Verified city/neighborhood + county pairs, including places not represented
// as separate incorporated cities/CDPs in the national Places Gazetteer.
// https://www.mywaltonfl.gov/DocumentCenter/View/44955/2317-Recommendations-V9
// https://www.franklincountyohio.gov/County-Government/About-Our-Community/Cities-Townships-and-Villages-in-Franklin-County
const VERIFIED_PAIRS: Record<string, string> = {
  "rosemary beach|walton county": "FL",
  "columbus|franklin county": "OH",
};

export function normalizePlaceName(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/\bst\.?\b/g, "saint").replace(/\bft\.?\b/g, "fort")
    .replace(/\bair force base\b/g, "afb").replace(/[^a-z0-9]+/g, " ").trim();
}

export function cleanJobLocation(value: string): string {
  return value.replace(/\(\s*(?:on[- ]?site|hybrid|remote|in[- ]person)\s*\)/gi, "").trim();
}

/** A county name may exist in many states. Intersect with the named city/CDP;
 * only a single remaining state resolves a location. Never use population or
 * employer headquarters to guess which duplicate place name was intended. */
export function inferUsLocation(location: string): { state: string | null; candidates: string[] } {
  const parts = cleanJobLocation(location).split(",").map(normalizePlaceName).filter(Boolean);
  const verified = VERIFIED_PAIRS[`${parts[0]}|${parts[1]}`];
  if (verified) return { state: verified, candidates: [verified] };
  const cityStates = (places[parts[0]] ?? "").split(",").filter(Boolean);
  const countyParts = parts.length === 1 && /\b(?:county|parish|borough|census area|municipio|city)$/.test(parts[0]) ? parts : parts.slice(1);
  const countyStates = [...new Set(countyParts.flatMap(part => (counties[part] ?? "").split(",").filter(Boolean)))];
  // Neighborhoods (Crystal City, Ocean Beach, etc.) need not be Census places.
  // An unambiguous county is stronger evidence than a same-named town elsewhere.
  if (countyStates.length === 1) return { state: countyStates[0], candidates: countyStates };
  // The Gazetteer uses the installation's previous Fort Liberty CDP name.
  // Keep the CA city of Fort Bragg ambiguous unless Cumberland County is given.
  if (parts[0] === "fort bragg" && parts.includes("cumberland county")) return { state: "NC", candidates: ["NC"] };
  const candidates = countyStates.length ? cityStates.length ? countyStates.filter(state => cityStates.includes(state)) : countyStates : cityStates;
  return { state: candidates.length === 1 ? candidates[0] : null, candidates };
}

export type JobLocationResolution = {
  regions: string[];
  status: "explicit" | "inferred" | "unspecified" | "conflict";
  candidates: string[];
};
