import {
  decodeHtmlEntities,
  EODWF_BASE,
  EODWF_ORG,
  extractSignupHref,
  formatTimeRange,
  formatVenue,
  stripHtml,
  type NormalizedEodwfEvent,
} from "./types";

type TribeVenue = {
  venue?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  stateprovince?: string;
};

type TribeImage = {
  url?: string;
};

type TribeEvent = {
  id: number;
  url?: string;
  title?: string;
  description?: string;
  website?: string;
  all_day?: boolean;
  start_date?: string;
  end_date?: string;
  image?: TribeImage | false | null;
  venue?: TribeVenue | TribeVenue[] | false | null;
  categories?: Array<{ slug?: string; name?: string }>;
};

type TribeListResponse = {
  events?: TribeEvent[];
  total_pages?: number;
  next_rest_url?: string;
};

async function tribeFetch(url: string): Promise<TribeListResponse> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; EODHub/1.0; +https://www.eod-hub.com)",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Tribe events HTTP ${res.status}`);
  return (await res.json()) as TribeListResponse;
}

function venueOf(ev: TribeEvent): TribeVenue | null {
  const v = ev.venue;
  if (!v) return null;
  if (Array.isArray(v)) return v[0] ?? null;
  return v;
}

function imageUrlOf(ev: TribeEvent): string | null {
  const img = ev.image;
  if (!img || typeof img !== "object") return null;
  const url = img.url?.trim();
  return url || null;
}

function normalizeTribeEvent(ev: TribeEvent): NormalizedEodwfEvent | null {
  const title = decodeHtmlEntities(stripHtml(ev.title ?? "")).trim();
  if (!title) return null;
  const start = ev.start_date?.trim();
  if (!start || start.length < 10) return null;
  const date = start.slice(0, 10);
  const html = ev.description ?? "";
  const description = stripHtml(html) || null;
  const venue = venueOf(ev);
  const location = venue
    ? formatVenue({
        venue: venue.venue,
        address: venue.address,
        city: venue.city,
        state: venue.state ?? venue.stateprovince,
        zip: venue.zip,
      })
    : null;
  const signupFromHtml = extractSignupHref(html);
  const website = ev.website?.trim() || null;
  const pageUrl = ev.url?.trim() || `${EODWF_BASE}/event/${ev.id}/`;
  const signup_url = website || signupFromHtml || pageUrl;

  return {
    title,
    description,
    date,
    event_time: formatTimeRange(ev.start_date, ev.end_date, Boolean(ev.all_day)),
    location,
    organization: EODWF_ORG,
    signup_url,
    poc_name: null,
    poc_phone: null,
    image_remote_url: imageUrlOf(ev),
    source_type: "eodwf_calendar",
    source_url: pageUrl,
    source_event_id: String(ev.id),
    import_metadata: {
      categories: (ev.categories ?? []).map((c) => c.slug ?? c.name).filter(Boolean),
      start_date: ev.start_date,
      end_date: ev.end_date,
    },
  };
}

/**
 * Paginate upcoming Tribe events from now through +18 months.
 */
export async function fetchTribeCalendarEvents(now = new Date()): Promise<NormalizedEodwfEvent[]> {
  const start = now.toISOString().slice(0, 10);
  const endDate = new Date(now);
  endDate.setMonth(endDate.getMonth() + 18);
  const end = endDate.toISOString().slice(0, 10);

  const perPage = 50;
  let page = 1;
  const out: NormalizedEodwfEvent[] = [];
  const seen = new Set<string>();

  while (page <= 20) {
    const url =
      `${EODWF_BASE}/wp-json/tribe/events/v1/events` +
      `?per_page=${perPage}&page=${page}` +
      `&start_date=${encodeURIComponent(`${start} 00:00:00`)}` +
      `&end_date=${encodeURIComponent(`${end} 23:59:59`)}` +
      `&status=publish`;
    const data = await tribeFetch(url);
    const batch = data.events ?? [];
    if (batch.length === 0) break;

    for (const ev of batch) {
      const normalized = normalizeTribeEvent(ev);
      if (!normalized) continue;
      if (seen.has(normalized.source_url)) continue;
      seen.add(normalized.source_url);
      out.push(normalized);
    }

    const totalPages = data.total_pages ?? page;
    if (page >= totalPages || !data.next_rest_url) break;
    page += 1;
  }

  return out;
}
