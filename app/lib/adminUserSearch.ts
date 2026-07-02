export type AdminUserSearchRow = {
  user_id: string;
  first_name?: string | null;
  last_name?: string | null;
  display_name?: string | null;
  name?: string | null;
  email?: string | null;
  service?: string | null;
  role?: string | null;
  company_name?: string | null;
  account_type?: string | null;
  is_employer?: boolean | null;
};

export function adminUserSearchDisplayName(u: AdminUserSearchRow): string {
  if (u.is_employer || u.account_type === "employer") {
    const company = u.company_name?.trim();
    const contact = `${u.first_name || ""} ${u.last_name || ""}`.trim();
    if (company && contact) return `${company} (${contact})`;
    if (company) return company;
  }
  return (
    u.display_name ||
    u.name ||
    `${u.first_name || ""} ${u.last_name || ""}`.trim() ||
    ""
  );
}

function normalize(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, " ");
}

function normalizeCompact(value: string): string {
  return normalize(value).replace(/[^a-z0-9@._-]+/g, "");
}

function addCandidate(set: Set<string>, value: string | null | undefined) {
  const trimmed = value?.trim();
  if (trimmed) set.add(trimmed);
}

function buildSearchCandidates(u: AdminUserSearchRow): string[] {
  const first = (u.first_name ?? "").trim();
  const last = (u.last_name ?? "").trim();
  const display = (u.display_name ?? "").trim();
  const name = (u.name ?? "").trim();
  const email = (u.email ?? "").trim();
  const emailLocal = email.includes("@") ? email.split("@")[0] ?? "" : email;
  const emailDomain = email.includes("@") ? email.split("@")[1] ?? "" : "";
  const company = (u.company_name ?? "").trim();

  const candidates = new Set<string>();

  for (const value of [
    first,
    last,
    display,
    name,
    email,
    emailLocal,
    emailDomain,
    u.service,
    u.role,
    company,
    u.user_id,
    adminUserSearchDisplayName(u),
  ]) {
    addCandidate(candidates, value);
  }

  if (first && last) {
    for (const value of [
      `${first} ${last}`,
      `${last} ${first}`,
      `${last}, ${first}`,
      `${first}, ${last}`,
      `${first}${last}`,
      `${last}${first}`,
    ]) {
      addCandidate(candidates, value);
    }
  }

  if (company && (first || last)) {
    addCandidate(candidates, `${company} (${`${first} ${last}`.trim()})`);
  }

  return [...candidates];
}

/** Exact match, or either side contains the other (supports Chris ↔ Christopher). */
function exactOrContains(query: string, candidate: string): boolean {
  const q = normalize(query);
  const c = normalize(candidate);
  if (!q || !c) return false;
  if (c === q) return true;
  if (c.includes(q)) return true;
  if (q.includes(c) && c.length >= 2) return true;

  const compactQuery = normalizeCompact(query);
  const compactCandidate = normalizeCompact(candidate);
  if (!compactQuery || !compactCandidate) return false;
  if (compactCandidate === compactQuery) return true;
  if (compactCandidate.includes(compactQuery)) return true;
  if (compactQuery.includes(compactCandidate) && compactCandidate.length >= 2) return true;

  return false;
}

function candidateMatchesQuery(query: string, candidate: string): boolean {
  return exactOrContains(query, candidate);
}

function tokenMatchesCandidates(token: string, candidates: string[], joinedHaystack: string): boolean {
  const normalizedToken = normalize(token);
  if (!normalizedToken) return false;
  if (joinedHaystack.includes(normalizedToken)) return true;
  return candidates.some((candidate) => candidateMatchesQuery(token, candidate));
}

/**
 * Case-insensitive admin user search across display name, first/last name
 * combinations, email (full, local part, domain), service, role, company, and user id.
 * Supports exact matches and partial/contains matches.
 */
export function matchesAdminUserSearch(u: AdminUserSearchRow, rawQuery: string): boolean {
  const q = normalize(rawQuery);
  if (!q) return true;

  const candidates = buildSearchCandidates(u);
  const joinedHaystack = candidates.map(normalize).join(" ");

  if (joinedHaystack.includes(q)) return true;
  if (candidates.some((candidate) => candidateMatchesQuery(q, candidate))) return true;

  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) {
    return tokens.every((token) => tokenMatchesCandidates(token, candidates, joinedHaystack));
  }

  return false;
}
