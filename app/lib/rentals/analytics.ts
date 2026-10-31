export const engagementKinds = ["impression", "property_open", "contact_open", "email_copy", "phone_click", "application_click", "ad_click"] as const;
export type EngagementKind = typeof engagementKinds[number];
export type AnalyticsSubject = "property" | "advertiser";
export const metricLabels = {
  impressions: "Listing appearances", property_opens: "Property opens", contact_opens: "Contact opens",
  email_copies: "Email copies", phone_clicks: "Phone clicks", application_clicks: "Application link clicks", ad_clicks: "Logo clicks",
} as const;
export type MetricKey = keyof typeof metricLabels;
export type Counts = Record<MetricKey, number>;
export const emptyCounts = (): Counts => ({ impressions: 0, property_opens: 0, contact_opens: 0, email_copies: 0, phone_clicks: 0, application_clicks: 0, ad_clicks: 0 });
export type AnalyticsProperty = { id: string; ownerId: string; owner: string; address: string; state: string; city: string };
export type AnalyticsDay = Counts & { day: string; subject_id: string };
export type AnalyticsReport = {
  start: string; end: string; generatedAt: string; subject: AnalyticsSubject;
  owners: { id: string; name: string }[]; properties: AnalyticsProperty[];
  selected: AnalyticsProperty[]; rows: AnalyticsDay[];
};
export function totalCounts(rows: Counts[]): Counts {
  return rows.reduce((sum, row) => {
    for (const key of Object.keys(metricLabels) as MetricKey[]) sum[key] += Number(row[key] ?? 0);
    return sum;
  }, emptyCounts());
}
export function analyticsDates(start: string | null, end: string | null, now = new Date()) {
  const last = end ?? now.toISOString().slice(0, 10);
  const valid = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
  if (!valid(last)) throw new Error("Choose a valid end date.");
  const first = start ?? new Date(Date.parse(`${last}T00:00:00Z`) - 29 * 86400000).toISOString().slice(0, 10);
  if (!valid(first) || !valid(last) || first > last || Date.parse(last) - Date.parse(first) > 365 * 86400000 || last > now.toISOString().slice(0, 10)) throw new Error("Choose a valid date range of up to 366 days, ending today or earlier.");
  return { start: first, end: last };
}
// Quoting alone does not prevent spreadsheet formula execution in owner-entered text.
function csvCell(value: string | number) {
  let s = String(value);
  if (/^[\s]*[=+@-]/.test(s) || /^[\t\r\n]/.test(s)) s = `'${s}`;
  return `"${s.replaceAll('"', '""')}"`;
}
export function rentalAnalyticsCsv(report: AnalyticsReport): string {
  const keys: MetricKey[] = report.subject === "advertiser" ? ["impressions", "ad_clicks"] : ["impressions", "property_opens", "contact_opens", "email_copies", "phone_clicks", "application_clicks"];
  const headers = ["Period start (UTC)", "Period end (UTC)", "Date (UTC)", "State", "City", "Owner / advertiser", "Owner ID", "Property / placement", "Property / advertiser ID", ...keys.map(key => key === "impressions" && report.subject === "advertiser" ? "Ad appearances" : metricLabels[key])];
  const lines: (string | number)[][] = [headers];
  const byProperty = new Map<string, AnalyticsDay[]>();
  for (const row of report.rows) { const group = byProperty.get(row.subject_id) ?? []; group.push(row); byProperty.set(row.subject_id, group); }
  for (const property of report.selected) {
    const rows = byProperty.get(property.id) ?? [];
    for (const row of rows.length ? rows : [{ ...emptyCounts(), day: "", subject_id: property.id }]) {
      lines.push([report.start, report.end, row.day, property.state, property.city, property.owner, property.ownerId, property.address, property.id, ...keys.map(key => row[key])]);
    }
  }
  return "\uFEFF" + lines.map(line => line.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
