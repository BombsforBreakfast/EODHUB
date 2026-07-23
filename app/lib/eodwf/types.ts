/** Shared types + HTML helpers for EODWF event import. */

export type EodwfSourceType = "eodwf_calendar" | "eodwf_gathering" | "eodwf_retreat";

export type NormalizedEodwfEvent = {
  title: string;
  description: string | null;
  date: string; // yyyy-mm-dd
  event_time: string | null;
  location: string | null;
  organization: string;
  signup_url: string | null;
  poc_name: string | null;
  poc_phone: string | null;
  image_remote_url: string | null;
  source_type: EodwfSourceType;
  source_url: string;
  source_event_id: string | null;
  import_metadata: Record<string, unknown>;
};

export const EODWF_ORG = "EOD Warrior Foundation";
export const EODWF_BASE = "https://eod-wf.org";

export function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&#038;/g, "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

export function stripHtml(html: string): string {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ");
  const text = withBreaks.replace(/<[^>]+>/g, " ");
  return decodeHtmlEntities(text)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** First Register/Apply/Sign up style href from HTML, else null. */
export function extractSignupHref(html: string): string | null {
  const re =
    /<a[^>]+href=["']([^"']+)["'][^>]*>[\s\S]*?(?:Register|Sign\s*up|Sign\s*up|Apply|Application)[\s\S]*?<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const href = match[1]?.trim();
    if (!href || href.startsWith("#") || href.startsWith("mailto:")) continue;
    if (/google\.com\/calendar|outlook\.(office|live)|ical=1/i.test(href)) continue;
    return href;
  }
  // Fallback: fusion-button / donorperfect / raceroster style CTAs
  const btn = html.match(
    /href=["'](https?:\/\/[^"']+(?:raceroster|donorperfect|bishopsevents|eventbrite|givebutter|forms\.gle)[^"']*)["']/i,
  );
  return btn?.[1] ?? null;
}

export function formatVenue(parts: {
  venue?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): string | null {
  const chunks = [
    parts.venue?.trim(),
    [parts.address, parts.city, parts.state, parts.zip].filter(Boolean).join(", ").trim() || null,
  ].filter(Boolean);
  return chunks.length ? chunks.join(" — ") : null;
}

export function formatTimeRange(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
  allDay: boolean,
): string | null {
  if (allDay) return "All day";
  if (!startIso) return null;
  const start = new Date(startIso.replace(" ", "T"));
  if (Number.isNaN(start.getTime())) return null;
  const fmt = (d: Date) =>
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  if (!endIso) return fmt(start);
  const end = new Date(endIso.replace(" ", "T"));
  if (Number.isNaN(end.getTime())) return fmt(start);
  return `${fmt(start)} – ${fmt(end)}`;
}

const MONTH_MAP: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

/** Resolve a month/day (no year) to yyyy-mm-dd; if already past this year, use next year. */
export function resolveMonthDayToDate(
  monthIndex: number,
  day: number,
  now = new Date(),
): { date: string; yearAssumed: number; uncertain: boolean } {
  const y = now.getFullYear();
  const candidate = new Date(y, monthIndex, day, 12, 0, 0);
  let year = y;
  // Compare calendar days only
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (candidate < today) {
    year = y + 1;
  }
  const date = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { date, yearAssumed: year, uncertain: true };
}

export function parseMonthName(token: string): number | null {
  const key = token.replace(/\./g, "").trim().toLowerCase();
  return key in MONTH_MAP ? MONTH_MAP[key] : null;
}

export function slugifyKey(parts: string[]): string {
  return parts
    .map((p) =>
      p
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
    )
    .filter(Boolean)
    .join("/");
}
