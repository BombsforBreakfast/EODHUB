"use client";
import { useState, type CSSProperties } from "react";
import { useTheme } from "../../lib/ThemeContext";
import { FACET_OPTIONS, type FacetKey } from "../../lib/jobFacets";
import { DEFAULT_JOB_FILTERS, jobFilterChips, type JobFilterState, type JobRegionOption } from "../../lib/jobFilters";

export default function AdvancedJobFilters({ value, onChange, regions, count, total, loading }: {
  value: JobFilterState; onChange: (next: JobFilterState) => void; regions: JobRegionOption[];
  count: number; total: number; loading: boolean;
}) {
  const { t } = useTheme();
  const [advanced, setAdvanced] = useState(false);
  const [locationSearch, setLocationSearch] = useState("");
  const set = (patch: Partial<JobFilterState>) => onChange({ ...value, ...patch });
  const input: CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, background: t.input, color: t.text, fontSize: 14, boxSizing: "border-box" };
  const button: CSSProperties = { padding: "8px 12px", border: `1px solid ${t.border}`, background: t.surface, color: t.text, borderRadius: 8, cursor: "pointer" };
  const label: CSSProperties = { display: "grid", gap: 6, fontSize: 13, fontWeight: 600 };
  const chips = jobFilterChips(value);
  function facet(key: FacetKey, title: string) {
    const selected = value.selections?.[key] ?? [];
    return <fieldset style={{ border: `1px solid ${t.border}`, borderRadius: 10, padding: 12, margin: 0 }}>
      <legend style={{ fontSize: 13, fontWeight: 700 }}>{title}</legend>
      {Object.entries(FACET_OPTIONS[key]).map(([id, text]) => <label key={id} style={{ display: "flex", gap: 8, alignItems: "start", margin: "8px 0", fontSize: 13 }}>
        <input type="checkbox" checked={selected.includes(id)} onChange={() => set({ selections: { ...value.selections, [key]: selected.includes(id) ? selected.filter(v => v !== id) : [...selected, id] } })} />{text}
      </label>)}
    </fieldset>;
  }
  return <section aria-label="Filter jobs" style={{ border: `1px solid ${t.border}`, borderRadius: t.radius, background: t.surface, padding: 16, marginBottom: 14 }}>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
      <label style={label}>Keywords
        <input value={value.keyword} onChange={e => set({ keyword: e.target.value })} placeholder={'e.g. UXO instructor, "program manager"'} style={input} />
      </label>
      <details style={{ border: `1px solid ${t.border}`, borderRadius: 8, padding: 10 }}>
        <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 14 }}>Locations {(value.regions?.length ?? 0) > 0 ? `(${value.regions?.length} selected)` : "— any"}</summary>
        <input aria-label="Find a state or country" value={locationSearch} onChange={e => setLocationSearch(e.target.value)} placeholder="Find a state or country" style={{ ...input, marginTop: 10 }} />
        <div style={{ maxHeight: 210, overflowY: "auto" }}>
          {regions.filter(r => r.label.toLowerCase().includes(locationSearch.toLowerCase())).map(region => <label key={region.value} style={{ display: "flex", gap: 8, margin: "10px 0", fontSize: 13 }}>
            <input type="checkbox" checked={value.regions?.includes(region.value) ?? false} onChange={() => set({ regions: value.regions?.includes(region.value) ? value.regions.filter(r => r !== region.value) : [...(value.regions ?? []), region.value] })} />{region.label}
          </label>)}
        </div>
      </details>
    </div>
    <div style={{ marginTop: 14 }}>{facet("relevance", "Type of opportunity — select any that interest you")}</div>
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 14 }}>
      <button type="button" style={button} aria-expanded={advanced} aria-controls="advanced-job-options" onClick={() => setAdvanced(!advanced)}>{advanced ? "Hide advanced filters" : "Advanced filters"}</button>
      {chips.length > 0 && <button type="button" style={button} onClick={() => onChange(DEFAULT_JOB_FILTERS)}>Clear all</button>}
      <span role="status" style={{ fontSize: 13, color: t.textMuted }}>{loading ? "Loading active jobs…" : `${count.toLocaleString()} matching ${count === 1 ? "job" : "jobs"} · ${total.toLocaleString()} active listings`}</span>
    </div>
    {advanced && <div id="advanced-job-options" style={{ marginTop: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 14 }}>
        <label style={label}>Search in<select style={input} value={value.searchScope} onChange={e => set({ searchScope: e.target.value as "all" | "title" })}><option value="all">Title, employer and description</option><option value="title">Job title only</option></select></label>
        <label style={label}>Exclude words or phrases<input style={input} value={value.excludeKeywords} onChange={e => set({ excludeKeywords: e.target.value })} placeholder={'sales "business development"'} /></label>
        <label style={label}>Geography<select style={input} value={value.geography} onChange={e => set({ geography: e.target.value as JobFilterState["geography"] })}><option value="">Anywhere</option><option value="conus">CONUS (48 states + DC)</option><option value="oconus">OCONUS (includes Alaska and Hawaii)</option></select></label>
        <label style={label}>Added to EOD-HUB<select style={input} value={value.postedWithin} onChange={e => set({ postedWithin: e.target.value as JobFilterState["postedWithin"] })}><option value="">All active listings</option><option value="7">Last 7 days</option><option value="14">Last 14 days</option></select></label>
      </div>
      <p style={{ color: t.textMuted, fontSize: 12 }}>All search words must match. Put a phrase in double quotes. Any excluded word or phrase removes a match.</p>
      <label style={{ fontSize: 13 }}><input type="checkbox" checked={value.includeUnknownLocation} onChange={e => set({ includeUnknownLocation: e.target.checked })} /> Include listings with an unspecified location</label>
      <fieldset style={{ border: `1px solid ${t.border}`, borderRadius: 10, padding: 12, margin: "16px 0" }}>
        <legend style={{ fontWeight: 700, fontSize: 13 }}>Pay in USD</legend>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
          <label style={label}>Minimum amount<input type="number" min="0" step="any" value={value.minimumPay} onChange={e => set({ minimumPay: e.target.value })} placeholder={value.payPeriod === "hour" ? "35" : "75000"} style={input} /></label>
          <label style={label}>Pay period<select style={input} value={value.payPeriod} onChange={e => set({ payPeriod: e.target.value as "year" | "hour" })}><option value="year">Annual</option><option value="hour">Hourly</option></select></label>
          <label style={label}>Match when<select style={input} value={value.payMatch} onChange={e => set({ payMatch: e.target.value as "range" | "starting" })}><option value="range">The range reaches this amount</option><option value="starting">Starting pay meets this amount</option></select></label>
        </div>
        <label style={{ display: "block", marginTop: 12, fontSize: 13 }}><input type="checkbox" checked={value.includeUnknownPay} onChange={e => set({ includeUnknownPay: e.target.checked })} /> Include jobs without comparable USD pay information</label>
        <label style={{ display: "block", marginTop: 8, fontSize: 13 }}><input type="checkbox" checked={value.advertisedPayOnly} onChange={e => set({ advertisedPayOnly: e.target.checked })} /> Employer-advertised pay only (exclude estimates and unconfirmed sources)</label>
        <p style={{ fontSize: 12, color: t.textMuted }}>Hourly and annual pay are kept separate. Currency and pay periods are not guessed or converted.</p>
      </fieldset>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 14 }}>
        {facet("education", "Education")}{facet("clearance", "Clearance level")}{facet("clearanceStatus", "Clearance timing")}{facet("employment", "Employment type")}
      </div>
    </div>}
    {chips.length > 0 && <div aria-label="Active filters" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>{chips.map((chip, index) => <button key={`${chip.label}-${index}`} type="button" style={{ ...button, fontSize: 12, borderRadius: 20 }} aria-label={`Remove ${chip.label}`} onClick={() => set(chip.clear)}>{chip.label} ×</button>)}</div>}
    <p style={{ color: t.textMuted, fontSize: 12, marginBottom: 0 }}>Tags use the available posting text and source details. “Not specified” means the information is missing or unclear; check the employer’s full posting before applying.</p>
  </section>;
}
