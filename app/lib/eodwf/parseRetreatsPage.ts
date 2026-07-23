import {
  decodeHtmlEntities,
  EODWF_BASE,
  EODWF_ORG,
  parseMonthName,
  resolveMonthDayToDate,
  slugifyKey,
  stripHtml,
  type NormalizedEodwfEvent,
} from "./types";

const RETREATS_URL = `${EODWF_BASE}/retreats-calendar/`;

/**
 * Parse lines like:
 * "EOD Veterans Track Heroes – Spartanburg, SC; May 17 – 20 – Registration Closed"
 * "SongwritingWith:Soldiers (Gold Star Parents & Spouses) – Smithville, TN; October 23 – 25 Application Open"
 */
function parseRetreatLine(raw: string, now: Date): NormalizedEodwfEvent | null {
  let line = decodeHtmlEntities(raw).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  if (!line || line.length < 12) return null;
  if (/types of retreats|please follow us|foundation provides/i.test(line)) return null;

  // Must include a month name somewhere
  const hasMonth =
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b/i.test(
      line,
    );
  if (!hasMonth) return null;

  // Split title / location / dates roughly on semicolon first
  let titlePart = line;
  let afterSemi = "";
  const semi = line.indexOf(";");
  if (semi >= 0) {
    titlePart = line.slice(0, semi).trim();
    afterSemi = line.slice(semi + 1).trim();
  }

  // Title may still contain " – City, ST"
  let title = titlePart;
  let location: string | null = null;
  const titleLoc = titlePart.match(/^(.+?)\s*[–—\-]\s*([A-Za-z].+,\s*[A-Z]{2})\s*$/);
  if (titleLoc) {
    title = titleLoc[1].trim();
    location = titleLoc[2].trim();
  }

  const dateChunk = afterSemi || titlePart;
  const dateMatch = dateChunk.match(
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:\s*[–—\-]\s*(\d{1,2}))?\b/i,
  );
  if (!dateMatch) return null;

  const monthIdx = parseMonthName(dateMatch[1]);
  const dayStart = Number(dateMatch[2]);
  const dayEnd = dateMatch[3] ? Number(dateMatch[3]) : null;
  if (monthIdx == null || !dayStart) return null;

  const { date, yearAssumed, uncertain } = resolveMonthDayToDate(monthIdx, dayStart, now);
  let event_time: string | null = null;
  if (dayEnd && dayEnd !== dayStart) {
    event_time = `${dateMatch[1]} ${dayStart} – ${dayEnd}`;
  }

  let registration: string | null = null;
  const reg = line.match(/\b(Registration\s+Closed|Application\s+Open|Registration\s+Open|Application\s+Closed)\b/i);
  if (reg) registration = reg[1];

  if (!title || title.length < 3) return null;

  const source_url = `eodwf://retreat/${slugifyKey([date, title])}`;
  const descriptionParts = [
    "EOD Warrior Foundation Hope & Wellness Retreat",
    location ? `Location: ${location}` : null,
    event_time ? `Dates: ${event_time}` : null,
    registration ? `Status: ${registration}` : null,
    `Source: ${RETREATS_URL}`,
  ].filter(Boolean);

  return {
    title,
    description: descriptionParts.join("\n"),
    date,
    event_time,
    location,
    organization: EODWF_ORG,
    signup_url: RETREATS_URL,
    poc_name: null,
    poc_phone: null,
    image_remote_url: null,
    source_type: "eodwf_retreat",
    source_url,
    source_event_id: null,
    import_metadata: {
      raw_line: line,
      year_assumed: yearAssumed,
      date_uncertain: uncertain,
      registration,
      page_url: RETREATS_URL,
    },
  };
}

export async function fetchRetreats(now = new Date()): Promise<NormalizedEodwfEvent[]> {
  const res = await fetch(RETREATS_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; EODHub/1.0; +https://www.eod-hub.com)",
      Accept: "text/html",
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Retreats page HTTP ${res.status}`);
  const html = await res.text();

  const candidates: string[] = [];
  const pRe = /<(?:p|li|h3|h4)[^>]*>([\s\S]*?)<\/(?:p|li|h3|h4)>/gi;
  let m: RegExpExecArray | null;
  while ((m = pRe.exec(html))) {
    const t = stripHtml(m[1]).trim();
    if (t) candidates.push(t);
  }

  const out: NormalizedEodwfEvent[] = [];
  const seen = new Set<string>();
  for (const line of candidates) {
    const ev = parseRetreatLine(line, now);
    if (!ev) continue;
    if (seen.has(ev.source_url)) continue;
    seen.add(ev.source_url);
    out.push(ev);
  }
  return out;
}
