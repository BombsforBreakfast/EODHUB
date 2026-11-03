/** Accept a typed wall-clock time without applying the browser's time zone. */
export function parseManualTime(value: string): string | null {
  const match = /^(\d{1,2})(?::([0-5]\d))?\s*(am|pm)?$/i.exec(value.trim());
  if (!match) return null;
  let hour = Number(match[1]);
  const period = match[3]?.toLowerCase();
  if (period) {
    if (hour < 1 || hour > 12) return null;
    hour = hour % 12 + (period === "pm" ? 12 : 0);
  } else if (hour > 23) return null;
  return `${String(hour).padStart(2, "0")}:${match[2] ?? "00"}`;
}

export function displayManualTime(value: string): string {
  if (!/^\d{2}:[0-5]\d$/.test(value) || Number(value.slice(0, 2)) > 23) return value;
  const hour = Number(value.slice(0, 2));
  return `${hour % 12 || 12}:${value.slice(3)} ${hour < 12 ? "AM" : "PM"}`;
}
