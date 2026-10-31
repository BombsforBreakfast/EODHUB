"use client";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { BarChart3, Download, RefreshCw } from "lucide-react";
import { useTheme } from "@/app/lib/ThemeContext";
import { emptyCounts, metricLabels, rentalAnalyticsCsv, totalCounts, type AnalyticsReport, type AnalyticsSubject, type MetricKey } from "@/app/lib/rentals/analytics";
import s from "./RentalAnalytics.module.css";

export type LoadRentalAnalytics = (query: string, signal?: AbortSignal) => Promise<AnalyticsReport>;
function recentDates(days: number) {
  const end = new Date().toISOString().slice(0, 10);
  return { start: new Date(Date.parse(end) - (days - 1) * 86400000).toISOString().slice(0, 10), end };
}
export default function RentalAnalytics({ scope, loadReport }: { scope: "admin" | "provider"; loadReport: LoadRentalAnalytics }) {
  const { t } = useTheme();
  const [subject, setSubject] = useState<AnalyticsSubject>("property");
  const [owner, setOwner] = useState(""), [property, setProperty] = useState(""), [state, setState] = useState("");
  const [range, setRange] = useState("30"), [dates, setDates] = useState(() => recentDates(30)), [custom, setCustom] = useState(() => recentDates(30));
  const [report, setReport] = useState<AnalyticsReport | null>(null), [loadedQuery, setLoadedQuery] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(true), [refresh, setRefresh] = useState(0);
  const revision = useRef(0);
  const query = useMemo(() => new URLSearchParams({ subject, owner, property, state, ...dates }).toString(), [subject, owner, property, state, dates]);
  useEffect(() => {
    const controller = new AbortController(), version = ++revision.current;
    void (async () => {
      setBusy(true); setError("");
      try { const data = await loadReport(query, controller.signal); if (version === revision.current && !controller.signal.aborted) { setReport(data); setLoadedQuery(query); } }
      catch (e) { if (!controller.signal.aborted && version === revision.current) setError(e instanceof Error ? e.message : "Could not load analytics."); }
      finally { if (!controller.signal.aborted && version === revision.current) setBusy(false); }
    })();
    return () => controller.abort();
  }, [query, refresh, loadReport]);
  const current = !!report && loadedQuery === query && !busy && !error;
  const keys: MetricKey[] = subject === "advertiser" ? ["impressions", "ad_clicks"] : ["impressions", "property_opens", "contact_opens", "email_copies", "phone_clicks", "application_clicks"];
  const totals = totalCounts(current ? report.rows : []);
  const byProperty = new Map<string, ReturnType<typeof emptyCounts>>();
  for (const row of current ? report.rows : []) byProperty.set(row.subject_id, totalCounts([byProperty.get(row.subject_id) ?? emptyCounts(), row]));
  const properties = (report?.properties ?? []).filter(p => (!owner || p.ownerId === owner) && (!state || p.state === state));
  const states = [...new Set((report?.properties ?? []).map(p => p.state).filter(Boolean))].sort();
  const daily = new Map<string, ReturnType<typeof emptyCounts>>();
  for (const row of current ? report.rows : []) daily.set(row.day, totalCounts([daily.get(row.day) ?? emptyCounts(), row]));
  const chart: { day: string; opens: number }[] = [];
  for (let ms = current ? Date.parse(dates.start) : NaN; ms <= Date.parse(dates.end); ms += 86400000) {
    const day = new Date(ms).toISOString().slice(0, 10), counts = daily.get(day) ?? emptyCounts();
    chart.push({ day, opens: subject === "advertiser" ? counts.ad_clicks : counts.property_opens });
  }
  const max = Math.max(1, ...chart.map(d => d.opens));
  const label = (key: MetricKey) => key === "impressions" && subject === "advertiser" ? "Ad appearances" : metricLabels[key];
  function download() {
    if (!report || !current) return;
    const url = URL.createObjectURL(new Blob([rentalAnalyticsCsv(report)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `${subject === "advertiser" ? "eod-home-buying" : "rental-properties"}-analytics-${report.start}-to-${report.end}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const style = { "--ra-bg": t.surface, "--ra-text": t.text, "--ra-muted": t.textMuted, "--ra-border": t.border, "--ra-input": t.input } as CSSProperties;
  return <section className={s.report} style={style} aria-label="Rental engagement analytics">
    <header className={s.header}><div><p className={s.eyebrow}>EOD-HUB RENTALS</p><h2>Engagement analytics</h2><p>Understand which properties people explore and how they choose to reach out.</p></div><BarChart3 aria-hidden="true" size={28}/></header>
    {scope === "admin" ? <nav className={s.tabs} aria-label="Analytics reports"><button type="button" aria-pressed={subject === "property"} onClick={() => { setSubject("property"); setOwner(""); setProperty(""); setState(""); }}>Properties</button><button type="button" aria-pressed={subject === "advertiser"} onClick={() => { setSubject("advertiser"); setOwner(""); setProperty(""); setState(""); }}>EOD Home Buying</button></nav> : null}
    <div className={s.filters}>
      {subject === "property" ? <>
        {scope === "admin" ? <label>Owner<select value={owner} onChange={e => { setOwner(e.target.value); setProperty(""); }}><option value="">All owners</option>{report?.owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label> : null}
        <label>State<select value={state} onChange={e => { setState(e.target.value); setProperty(""); }}><option value="">All states</option>{states.map(code => <option key={code}>{code}</option>)}</select></label>
        <label className={s.propertyFilter}>Property<select value={property} onChange={e => setProperty(e.target.value)}><option value="">All matching properties</option>{properties.map(p => <option key={p.id} value={p.id}>{p.address} · {p.city}, {p.state}</option>)}</select></label>
      </> : <p className={s.advertiser}>EOD Home Buying · Rentals page logo</p>}
      <label>Date range<select value={range} onChange={e => { const v = e.target.value; setRange(v); if (v !== "custom") { const d = recentDates(Number(v)); setDates(d); setCustom(d); } }}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="custom">Custom dates</option></select></label>
    </div>
    {range === "custom" ? <form className={s.customDates} onSubmit={e => { e.preventDefault(); setDates(custom); }}><label>From (UTC)<input type="date" required value={custom.start} max={custom.end} onChange={e => setCustom(d => ({ ...d, start: e.target.value }))}/></label><label>Through (UTC)<input type="date" required value={custom.end} min={custom.start} max={new Date().toISOString().slice(0, 10)} onChange={e => setCustom(d => ({ ...d, end: e.target.value }))}/></label><button type="submit">Apply dates</button></form> : null}
    <div className={s.actions}><span>{dates.start} – {dates.end} · UTC</span><button type="button" disabled={busy} onClick={() => setRefresh(v => v + 1)}><RefreshCw size={15} aria-hidden="true"/> Refresh</button><button type="button" disabled={!current || !report.selected.length} onClick={download}><Download size={15} aria-hidden="true"/> Export CSV</button></div>
    {busy ? <p role="status">Loading engagement report…</p> : error ? <p role="alert" className={s.error}>{error}</p> : current ? <>
      <div className={s.stats}>{(subject === "advertiser" ? [["Ad appearances", totals.impressions], ["Logo clicks", totals.ad_clicks]] : [["Listing appearances", totals.impressions], ["Property opens", totals.property_opens], ["Contact opens", totals.contact_opens], ["Direct contact actions", totals.email_copies + totals.phone_clicks + totals.application_clicks]]).map(([name, value]) => <div key={name}><strong>{Number(value).toLocaleString()}</strong><span>{name}</span></div>)}</div>
      <section className={s.chart} aria-label={`${subject === "advertiser" ? "Logo clicks" : "Property opens"} by day`}><h3>{subject === "advertiser" ? "Logo clicks" : "Property opens"} over time</h3><svg viewBox="0 0 720 130" role="img" aria-label={`${chart.reduce((n, d) => n + d.opens, 0)} ${subject === "advertiser" ? "logo clicks" : "property opens"} in the selected date range`} preserveAspectRatio="none"><line x1="0" y1="125" x2="720" y2="125" stroke="currentColor" opacity=".25"/>{chart.map((d, i) => <rect key={d.day} x={i * 720 / chart.length + 1} y={125 - d.opens / max * 115} width={Math.max(1, 720 / chart.length - 2)} height={d.opens / max * 115} fill="currentColor"><title>{d.day}: {d.opens}</title></rect>)}</svg><div><span>{dates.start}</span><span>{dates.end}</span></div></section>
      {!report.rows.length ? <p className={s.empty}>No recorded engagement for this selection and date range. New click metrics begin when collection is enabled.</p> : null}
      <div className={s.tableWrap}><table><caption>{subject === "advertiser" ? "EOD Home Buying performance" : "Property performance"}</caption><thead><tr><th scope="col">{subject === "advertiser" ? "Placement" : "Property / owner"}</th>{subject === "property" ? <th scope="col">State</th> : null}{keys.map(k => <th scope="col" key={k}>{label(k)}</th>)}</tr></thead><tbody>{report.selected.map(p => { const counts = byProperty.get(p.id) ?? emptyCounts(); return <tr key={p.id}><th scope="row">{subject === "property" ? <button type="button" onClick={() => setProperty(p.id)}>{p.address}</button> : p.address}<small>{p.owner}{p.city ? ` · ${p.city}` : ""}</small></th>{subject === "property" ? <td>{p.state || "—"}</td> : null}{keys.map(k => <td key={k}>{counts[k].toLocaleString()}</td>)}</tr>; })}</tbody></table></div>
      <p className={s.updated}>Updated {new Date(report.generatedAt).toLocaleString()}</p>
    </> : null}
    <details className={s.definitions}><summary>What these numbers mean</summary><p>Appearances count a listing’s cover photo or the advertiser logo becoming at least half visible. Property opens count photo-gallery opens. Contact opens count opening “Ask about this rental.” Email copies, phone clicks, and application links are separate actions; they do not confirm a message, call, application, or rental.</p><p>The same action on the same property or ad is counted at most once per 30 minutes in one browser tab where browser storage is available. Counts are interactions, not unique people. Common bots are filtered, but browser privacy tools and automated traffic can affect totals. Earlier portal appearance/contact counts are retained; historical property opens and original-property activity cannot be reconstructed.</p><p>CSV exports contain daily aggregate counts with owner, state, and property fields for filtering. They contain no visitor identities. Dates use UTC.</p></details>
  </section>;
}
