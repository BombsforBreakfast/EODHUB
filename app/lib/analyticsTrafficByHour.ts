/** Default timezone for traffic charts — most EOD HUB members are US-based. */
export const DEFAULT_ANALYTICS_TIMEZONE = "America/New_York";

export type TrafficSessionRow = {
  user_id: string | null;
  started_at: string;
  active_ms: number | null;
};

export type TrafficHourBucket = {
  hour: number;
  label: string;
  sessions: number;
  sessions_per_day: number;
  unique_users: number;
  active_ms: number;
  active_ms_per_day: number;
};

export type TrafficByHourSummary = {
  timezone: string;
  timezone_label: string;
  days_in_range: number;
  buckets: TrafficHourBucket[];
  peak_hours: Array<{ hour: number; label: string; sessions_per_day: number }>;
  peak_window_label: string | null;
};

export function daysInEngagementRange(range: "today" | "7d" | "30d"): number {
  if (range === "today") return 1;
  if (range === "7d") return 7;
  return 30;
}

export function timezoneDisplayLabel(timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "short",
    }).formatToParts(new Date());
    const tz = parts.find((p) => p.type === "timeZoneName")?.value;
    return tz ?? timeZone;
  } catch {
    return timeZone;
  }
}

export function localHourInTimezone(iso: string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const hour = parts.find((p) => p.type === "hour")?.value;
  return hour != null ? parseInt(hour, 10) : 0;
}

export function formatHour12(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

function formatHourRange(startHour: number, endHour: number, tzLabel: string): string {
  const endExclusive = (endHour + 1) % 24;
  return `${formatHour12(startHour)}–${formatHour12(endExclusive)} ${tzLabel}`;
}

function findPeakWindow(
  buckets: TrafficHourBucket[],
  tzLabel: string,
): { peak_hours: TrafficByHourSummary["peak_hours"]; peak_window_label: string | null } {
  const ranked = [...buckets]
    .filter((b) => b.sessions > 0)
    .sort((a, b) => b.sessions_per_day - a.sessions_per_day || a.hour - b.hour);

  if (ranked.length === 0) {
    return { peak_hours: [], peak_window_label: null };
  }

  const maxPerDay = ranked[0].sessions_per_day;
  const threshold = maxPerDay * 0.7;
  const strongHours = ranked.filter((b) => b.sessions_per_day >= threshold).map((b) => b.hour);
  strongHours.sort((a, b) => a - b);

  // Expand to a contiguous window around the busiest block.
  let bestStart = strongHours[0];
  let bestEnd = strongHours[0];
  let runStart = strongHours[0];
  let runEnd = strongHours[0];

  for (let i = 1; i < strongHours.length; i++) {
    if (strongHours[i] === runEnd + 1 || (runEnd === 23 && strongHours[i] === 0)) {
      runEnd = strongHours[i];
    } else {
      const runLen = runEnd >= runStart ? runEnd - runStart + 1 : 24 - runStart + runEnd + 1;
      const bestLen = bestEnd >= bestStart ? bestEnd - bestStart + 1 : 24 - bestStart + bestEnd + 1;
      if (runLen > bestLen) {
        bestStart = runStart;
        bestEnd = runEnd;
      }
      runStart = strongHours[i];
      runEnd = strongHours[i];
    }
  }
  const finalLen = runEnd >= runStart ? runEnd - runStart + 1 : 24 - runStart + runEnd + 1;
  const bestLen = bestEnd >= bestStart ? bestEnd - bestStart + 1 : 24 - bestStart + bestEnd + 1;
  if (finalLen > bestLen) {
    bestStart = runStart;
    bestEnd = runEnd;
  }

  const peak_hours = ranked.slice(0, 3).map((b) => ({
    hour: b.hour,
    label: b.label,
    sessions_per_day: b.sessions_per_day,
  }));

  const peak_window_label =
    bestStart === bestEnd
      ? `${formatHour12(bestStart)} ${tzLabel}`
      : formatHourRange(bestStart, bestEnd, tzLabel);

  return { peak_hours, peak_window_label };
}

export function buildTrafficByHour(
  sessions: TrafficSessionRow[],
  opts: { daysInRange: number; timeZone?: string },
): TrafficByHourSummary {
  const timeZone = opts.timeZone ?? DEFAULT_ANALYTICS_TIMEZONE;
  const tzLabel = timezoneDisplayLabel(timeZone);
  const daysInRange = Math.max(1, opts.daysInRange);

  const hourSessions = Array.from({ length: 24 }, () => 0);
  const hourActiveMs = Array.from({ length: 24 }, () => 0);
  const hourUsers = Array.from({ length: 24 }, () => new Set<string>());

  for (const row of sessions) {
    if (!row.started_at) continue;
    const hour = localHourInTimezone(row.started_at, timeZone);
    hourSessions[hour] += 1;
    hourActiveMs[hour] += row.active_ms ?? 0;
    if (row.user_id) hourUsers[hour].add(row.user_id);
  }

  const buckets: TrafficHourBucket[] = hourSessions.map((sessionsCount, hour) => ({
    hour,
    label: formatHour12(hour),
    sessions: sessionsCount,
    sessions_per_day: Math.round((sessionsCount / daysInRange) * 10) / 10,
    unique_users: hourUsers[hour].size,
    active_ms: hourActiveMs[hour],
    active_ms_per_day: Math.round(hourActiveMs[hour] / daysInRange),
  }));

  const { peak_hours, peak_window_label } = findPeakWindow(buckets, tzLabel);

  return {
    timezone: timeZone,
    timezone_label: tzLabel,
    days_in_range: daysInRange,
    buckets,
    peak_hours,
    peak_window_label,
  };
}
