"use client";
import { useState, type CSSProperties } from "react";
import { useTheme } from "../../lib/ThemeContext";
import { FACET_OPTIONS, type FacetKey } from "../../lib/jobFacets";
import { DEFAULT_JOB_FILTERS, jobFilterChips, toggleJobRegionGroup, US_JOB_REGION_GROUPS, isUsStateAbbr, type JobFilterState, type JobRegionOption } from "../../lib/jobFilters";
import { uniqueJobEmployerOptions, type JobEmployerOption } from "../../lib/jobEmployers";

export default function AdvancedJobFilters({ value, onChange, regions, employers = uniqueJobEmployerOptions([]), count, total, loading }: {
  value: JobFilterState; onChange: (next: JobFilterState) => void; regions: JobRegionOption[];
  employers?: JobEmployerOption[];
  count: number; total: number; loading: boolean;
}) {
  const { t } = useTheme();
  const [advanced, setAdvanced] = useState(false);
  const [locationSearch, setLocationSearch] = useState("");
  const [employerSearch, setEmployerSearch] = useState("");
  const set = (patch: Partial<JobFilterState>) => onChange({ ...value, ...patch });
  const input: CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, background: t.input, color: t.text, fontSize: 14, boxSizing: "border-box" };
  const button: CSSProperties = { padding: "8px 12px", border: `1px solid ${t.border}`, background: t.surface, color: t.text, borderRadius: 8, cursor: "pointer" };
  const label: CSSProperties = { display: "grid", gap: 6, fontSize: 13, fontWeight: 600 };
  const chips = jobFilterChips(value, employers);
  const selectedGeographies = value.geographies?.length ? value.geographies : value.geography ? [value.geography] : [];
  const locationMatches = (option: JobRegionOption) => `${option.label} ${option.value}`.toLowerCase().includes(locationSearch.toLowerCase());
  const states = regions.filter(option => isUsStateAbbr(option.value) || option.value === "PR");
  const international = regions.filter(option => !isUsStateAbbr(option.value) && option.value !== "PR");
  function locationOption(region: JobRegionOption) {
    return <label key={region.value} style={{ display: "flex", gap: 8, margin: "10px 0", fontSize: 13 }}>
      <input type="checkbox" checked={value.regions?.includes(region.value) ?? false} onChange={() => set({ regions: value.regions?.includes(region.value) ? value.regions.filter(r => r !== region.value) : [...(value.regions ?? []), region.value] })} />{region.label}
    </label>;
  }
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
        <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 14 }}>Geography {(value.regions?.length ?? 0) + selectedGeographies.length > 0 ? `(${(value.regions?.length ?? 0) + selectedGeographies.length} selected)` : "— anywhere"}</summary>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", margin: "12px 0", fontSize: 13 }}>
          {([{ value: "conus", label: "CONUS (48 states + DC)" }, { value: "oconus", label: "OCONUS (includes AK, HI + PR)" }] as const).map(area => <label key={area.value} style={{ display: "flex", gap: 8 }}>
            <input type="checkbox" checked={selectedGeographies.includes(area.value)} onChange={() => set({ geography: "", geographies: selectedGeographies.includes(area.value) ? selectedGeographies.filter(selected => selected !== area.value) : [...selectedGeographies, area.value] })} />{area.label}
          </label>)}
        </div>
        <fieldset style={{ border: `1px solid ${t.border}`, borderRadius: 8, padding: 10, margin: "8px 0" }}>
          <legend style={{ fontSize: 12, fontWeight: 600 }}>Select a U.S. region</legend>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
            {US_JOB_REGION_GROUPS.map(group => {
              const selected = group.states.filter(state => value.regions?.includes(state)).length;
              return <label key={group.label} style={{ display: "flex", gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={selected === group.states.length} ref={node => { if (node) node.indeterminate = selected > 0 && selected < group.states.length; }} onChange={() => set({ regions: toggleJobRegionGroup(value.regions ?? [], group.states) })} />{group.label}
              </label>;
            })}
          </div>
        </fieldset>
        <input aria-label="Find a state or country" value={locationSearch} onChange={e => setLocationSearch(e.target.value)} placeholder="Find a state or country" style={{ ...input, marginTop: 10 }} />
        <div style={{ maxHeight: 290, overflowY: "auto", marginTop: 10 }}>
          <div style={{ color: t.textMuted, fontSize: 12 }}>All 50 states + DC + Puerto Rico</div>
          {states.filter(locationMatches).map(locationOption)}
          {international.filter(locationMatches).length > 0 && <div style={{ color: t.textMuted, fontSize: 12, marginTop: 12 }}>Other listed locations</div>}
          {international.filter(locationMatches).map(locationOption)}
        </div>
        <p style={{ color: t.textMuted, fontSize: 12, marginBottom: 0 }}>Select multiple states, or select a region and adjust its states. Every state remains selectable even with no current listings.</p>
      </details>
      <details style={{ border: `1px solid ${t.border}`, borderRadius: 8, padding: 10 }}>
        <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 14 }}>Employers {(value.employers?.length ?? 0) > 0 ? `(${value.employers?.length} selected)` : "— any"}</summary>
        <input aria-label="Find an employer" value={employerSearch} onChange={event => setEmployerSearch(event.target.value)} placeholder="CACI, SAIC, MAG…" style={{ ...input, marginTop: 10 }} />
        <div style={{ maxHeight: 290, overflowY: "auto", marginTop: 10 }}>
          {employers.filter(option => option.label.toLowerCase().includes(employerSearch.toLowerCase())).map(option => <label key={option.value} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 13, margin: "10px 0" }}>
            <input aria-label={option.label} type="checkbox" checked={value.employers?.includes(option.value) ?? false} onChange={() => set({ employers: value.employers?.includes(option.value) ? value.employers.filter(employer => employer !== option.value) : [...(value.employers ?? []), option.value] })} />
            <span>{option.label}</span><span aria-hidden="true" style={{ color: t.textMuted, marginLeft: "auto" }}>{option.count}</span>
          </label>)}
        </div>
        <p style={{ color: t.textMuted, fontSize: 12, marginBottom: 0 }}>Select any number. Counts show all active listings; other filters can narrow them further.</p>
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
