"use client";
import { FACET_OPTIONS, type FacetKey, type JobFacetOverrides } from "../../lib/jobFacets";
import { useTheme } from "../../lib/ThemeContext";
export default function JobFacetEditor({ value, onChange }: { value: JobFacetOverrides; onChange: (value: JobFacetOverrides) => void }) {
  const { t } = useTheme();
  const labels: Record<FacetKey, string> = { relevance: "EOD relevance", education: "Education", clearance: "Clearance", clearanceStatus: "Clearance timing", workplace: "Work arrangement", employment: "Employment", payPeriod: "Pay period", payDisclosure: "Pay source" };
  return <fieldset style={{ border: `1px solid ${t.border}`, padding: 14, borderRadius: 10 }}>
    <legend>Search filter corrections</legend>
    <p style={{ fontSize: 13, color: t.textMuted }}>Use a correction only when verified against the posting. Automatic uses source details and posting text. Import refreshes preserve these corrections.</p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
      {(Object.keys(FACET_OPTIONS) as FacetKey[]).map(key => <label key={key} style={{ display: "grid", gap: 6, fontSize: 13 }}>{labels[key]}
        <select value={value[key] ?? ""} onChange={e => { const next = { ...value }; if (e.target.value) Object.assign(next, { [key]: e.target.value }); else delete next[key]; onChange(next); }} style={{ padding: 10, background: t.input, color: t.text, border: `1px solid ${t.inputBorder}`, borderRadius: 8 }}>
          <option value="">Automatic</option>{Object.entries(FACET_OPTIONS[key]).map(([id, text]) => <option key={id} value={id}>{text}</option>)}
        </select>
      </label>)}
    </div>
  </fieldset>;
}
