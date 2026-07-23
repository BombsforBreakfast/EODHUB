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

const GATHERINGS_URL = `${EODWF_BASE}/eod-monthly-gatherings/`;

type CityBlock = {
  city: string;
  html: string;
};

function extractCityBlocks(html: string): CityBlock[] {
  // Page uses h3 city headings after "Monthly Gathering Calendar"
  const parts = html.split(/<h3[^>]*>/i);
  const blocks: CityBlock[] = [];
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    const close = part.indexOf("</h3>");
    if (close < 0) continue;
    const city = stripHtml(part.slice(0, close)).trim();
    if (!city || /monthly gathering calendar|types of|contact/i.test(city)) continue;
    // Stop at next major section-ish heading content end: take until next h2 or end
    let body = part.slice(close + 5);
    const h2 = body.search(/<h2[\s>]/i);
    if (h2 >= 0) body = body.slice(0, h2);
    blocks.push({ city, html: body });
  }
  return blocks;
}

function firstMailto(html: string): string | null {
  const m = html.match(/mailto:([^"'?\s]+)/i);
  if (!m) return null;
  return decodeURIComponent(m[1]).trim() || null;
}

/**
 * Parse free-form gathering lines like:
 * "Jan 31 – Children's Book Reading Event – EODWF – 12 – 2 PM"
 * "Oct 25 – Mission BBQ, 5602 W Waters Ave., Tampa – 11 AM – 1 PM"
 */
function parseGatheringLine(
  rawLine: string,
  city: string,
  pocEmail: string | null,
  now: Date,
): NormalizedEodwfEvent | null {
  let line = decodeHtmlEntities(rawLine).replace(/\u00a0/g, " ").trim();
  line = line.replace(/\s*[–—−]\s*/g, " – ").replace(/\s+/g, " ").trim();
  if (!line || line.length < 8) return null;

  // Month day at start
  const m = line.match(
    /^(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})\s*[–—\-]\s*(.+)$/i,
  );
  if (!m) return null;

  const monthIdx = parseMonthName(m[1]);
  const day = Number(m[2]);
  if (monthIdx == null || !day || day < 1 || day > 31) return null;

  let rest = m[3].trim();
  // Split trailing time range from the end when present (incl. "5 PM – Closing")
  let event_time: string | null = null;
  const timeTail = rest.match(
    /\s*[–—\-]\s*((?:\d{1,2}(?::\d{2})?\s*(?:AM|PM))(?:\s*[–—\-]\s*(?:\d{1,2}(?::\d{2})?\s*(?:AM|PM)?|Closing))?|(?:Closing))\s*$/i,
  );
  if (timeTail) {
    event_time = timeTail[1].replace(/\s*[–—\-]\s*/g, " – ").trim();
    rest = rest.slice(0, timeTail.index).trim();
    // If we only captured "Closing", pull a prior "N PM" back into the time
    if (/^closing$/i.test(event_time)) {
      const prior = rest.match(/\s*[–—\-]\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM))\s*$/i);
      if (prior) {
        event_time = `${prior[1]} – Closing`;
        rest = rest.slice(0, prior.index).trim();
      }
    }
  }

  // Remaining may still have " – time – time" if first time was mid-string — try again
  if (!event_time) {
    const midTime = rest.match(
      /^(.+?)\s*[–—\-]\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM)(?:\s*[–—\-]\s*(?:\d{1,2}(?::\d{2})?\s*(?:AM|PM)?|Closing))?)\s*$/i,
    );
    if (midTime) {
      rest = midTime[1].trim();
      event_time = midTime[2].replace(/\s*[–—\-]\s*/g, " – ").trim();
    }
  }

  // Strip trailing "EODWF" org markers from title chunk
  const title = rest.replace(/\s*[–—\-]\s*EODWF\s*$/i, "").trim();
  if (!title) return null;

  const { date, yearAssumed, uncertain } = resolveMonthDayToDate(monthIdx, day, now);
  const source_url = `eodwf://gathering/${slugifyKey([city, date, title])}`;

  const descriptionParts = [
    `EOD Monthly Gathering — ${city}`,
    event_time ? `Time: ${event_time}` : null,
    pocEmail ? `Contact: ${pocEmail}` : null,
    `Source: ${GATHERINGS_URL}`,
  ].filter(Boolean);

  return {
    title: `${title} (${city})`,
    description: descriptionParts.join("\n"),
    date,
    event_time,
    location: city,
    organization: EODWF_ORG,
    signup_url: GATHERINGS_URL,
    poc_name: pocEmail,
    poc_phone: null,
    image_remote_url: null,
    source_type: "eodwf_gathering",
    source_url,
    source_event_id: null,
    import_metadata: {
      city,
      raw_line: line,
      year_assumed: yearAssumed,
      date_uncertain: uncertain,
      page_url: GATHERINGS_URL,
    },
  };
}

function listItemTexts(html: string): string[] {
  const texts: string[] = [];
  const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let m: RegExpExecArray | null;
  while ((m = liRe.exec(html))) {
    const t = stripHtml(m[1]).trim();
    if (t) texts.push(t);
  }
  // Also catch bare paragraphs that look like date lines
  const pRe = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  while ((m = pRe.exec(html))) {
    const t = stripHtml(m[1]).trim();
    if (/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(t)) texts.push(t);
  }
  return texts;
}

export async function fetchMonthlyGatherings(now = new Date()): Promise<NormalizedEodwfEvent[]> {
  const res = await fetch(GATHERINGS_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; EODHub/1.0; +https://www.eod-hub.com)",
      Accept: "text/html",
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Gatherings page HTTP ${res.status}`);
  const html = await res.text();
  const blocks = extractCityBlocks(html);
  const out: NormalizedEodwfEvent[] = [];
  const seen = new Set<string>();

  for (const block of blocks) {
    const poc = firstMailto(block.html);
    for (const line of listItemTexts(block.html)) {
      const ev = parseGatheringLine(line, block.city, poc, now);
      if (!ev) continue;
      if (seen.has(ev.source_url)) continue;
      seen.add(ev.source_url);
      out.push(ev);
    }
  }

  return out;
}
