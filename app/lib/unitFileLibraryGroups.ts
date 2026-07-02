/** Groups that expose a dedicated File Library tab (CAD / 3D print / laser files). */

const FILE_LIBRARY_SLUGS = new Set([
  "makers",
  "maker",
  "makers-group",
  "maker-space",
  "makerspace",
  "vulcans-forge",
  "vulcans-forge-innovation-program",
  "us-army-g38-vulcans-forge-innovation-program",
  "g38-vulcans-forge",
]);

function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

function normalizedMakerLabel(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, " ");
}

/** True when this unit should show the File Library tab. */
export function unitHasFileLibraryTab(
  slug: string | null | undefined,
  unitName?: string | null,
): boolean {
  if (!slug) return false;
  const normalizedSlug = normalizeSlug(slug);
  if (FILE_LIBRARY_SLUGS.has(normalizedSlug)) return true;
  const compactSlug = normalizedSlug.replace(/[\s_-]+/g, "");
  if (compactSlug === "makerspace" || compactSlug === "makers") return true;

  const name = normalizedMakerLabel(unitName ?? "");
  if (!name) return false;

  if (name.includes("vulcan") && name.includes("forge")) return true;
  if (name === "maker space" || name === "makerspace") return true;
  if (name.includes("maker space") || name.includes("makerspace")) return true;
  if (/\bmakers?\b/.test(name) && name.includes("group")) return true;
  if (name === "makers" || name.startsWith("makers ")) return true;

  return false;
}
