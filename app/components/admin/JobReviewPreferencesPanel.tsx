"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/lib/supabaseClient";
import { useTheme } from "../../lib/ThemeContext";
import type { JobTypeExclusion } from "../../lib/jobReviewPreferences";
import { JOB_TITLE_TERM_EXCLUSIONS } from "../../lib/jobImportExclusions";

type Target = { id: string; title: string | null };
type Preview = { phrase: string; count: number; previewToken: string; examples: Array<{ id: string; title: string }> };
export default function JobReviewPreferencesPanel({ target, queueSize, onClose, onChanged }: { target: Target | null; queueSize: number; onClose: () => void; onChanged: () => Promise<void> }) {
  const { t } = useTheme();
  const [rules, setRules] = useState<JobTypeExclusion[]>([]);
  const [priorities,setPriorities]=useState<import("../../lib/jobMissionPriority").JobPriorityRule[]>([]);
  const [phrase, setPhrase] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function request(body?: object) {
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch("/api/admin/job-review-preferences", { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${session?.access_token ?? ""}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not update job preferences");
    return result;
  }
  async function load() {
    const result = await request();
    setRules(result.exclusions??[]);setPriorities(result.priorities??[]);
  }
  useEffect(() => { void load().catch(err => setError(String(err.message))); }, [queueSize]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setPhrase(target?.title ?? ""); setPreview(null); if (target) { setError(""); setMessage(""); }
  }, [target]);
  async function act(body: object) {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await request(body);
      await load(); await onChanged();
      setMessage(result.message || ("removed" in result ? `Exact title excluded. ${result.removed} pending listings removed.` : "Preferences updated."));
      if(!result.failed)onClose();
      setPreview(null);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save preferences"); }
    finally { setBusy(false); }
  }
  const button = { padding: "7px 11px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.input, color: t.text, cursor: "pointer" };
  return <div style={{ marginBottom: 16, color: t.text, fontSize: 13 }}>
    <details>
      <summary style={{ cursor: "pointer" }}>Exact-title exclusions · {rules.length} rules · {priorities.length} priority rules</summary>
      <p>Title-term import exclusions: <strong>{JOB_TITLE_TERM_EXCLUSIONS.join(" · ")}</strong>. These terms match anywhere in a title (including “paramedics”), ignoring case. Mentions only in descriptions or employer names do not block a job. Already approved listings stay live.</p>
      <p>All imports require manual approval. Explicit exclusions block only the complete title you enter; scoring stays positive and Not relevant does not teach a broader pattern.</p>
      <p>All saved exclusions match complete titles. “Program Manager” excludes only that title; “Senior Program Manager” remains available. Capitalization, punctuation and spacing are ignored.</p>
      {rules.map(rule => <div key={rule.id} style={{ marginBottom: 5 }}><strong>{rule.phrase}</strong> <button style={button} disabled={busy} onClick={() => void act({ action: "remove_exclusion", id: rule.id })}>Remove rule</button></div>)}
      <h4>Priority rules</h4><p>Use Gold highlight → Set a review priority on a job to add a role pattern. These rules raise review scores without approving jobs or adding public labels.</p>
      {priorities.map(rule=><div key={rule.id} style={{marginBottom:8}}><strong>{rule.phrase}</strong> · {rule.target_score}/100{rule.job_id?" · this job only":""}{rule.mission_required?" · mission evidence required":""} <button style={button} disabled={busy} onClick={()=>void act({action:"remove_priority",id:rule.id})}>Remove priority rule</button></div>)}
      <p>Removing a rule allows future matching listings. Previously deleted listings stay in deletion memory.</p>
    </details>
    {message && <p role="status">{message}</p>}
    {error && <p role="alert" style={{ color: "#dc2626" }}>{error}</p>}
    {target && <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 1200, display: "grid", placeItems: "center", padding: 20 }}>
      <section role="dialog" aria-modal="true" aria-labelledby="exclude-job-type-title" style={{ background: t.input, color: t.text, borderRadius: 14, padding: 24, width: "min(560px, 100%)", maxHeight: "85vh", overflowY: "auto" }}>
        <h3 id="exclude-job-type-title">Exclude this exact title</h3>
        <p>Only the complete title entered below will be blocked in future imports from every source, and pending imported matches will be removed. Approved listings stay live.</p>
        <label>Complete job title<input autoFocus disabled={busy} maxLength={100} value={phrase} onChange={e => { setPhrase(e.target.value); setPreview(null); }} style={{ width: "100%", padding: 9, marginTop: 8, border: `1px solid ${t.border}`, borderRadius: 8, color: t.text, background: t.input }} /></label>
        <p>Adding, removing or reordering words makes a different title. Capitalization, punctuation and spacing are ignored. Descriptions and employer names are not matched. This applies to the complete title across the pending queue, regardless of your current search.</p>
        {preview && <div><strong>{preview.count} pending listings exactly match “{preview.phrase}”</strong><ul>{preview.examples.map(job => <li key={job.id}>{job.title}</li>)}</ul></div>}
        {error && <p role="alert" style={{ color: "#dc2626" }}>{error}</p>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={button} disabled={busy} onClick={onClose}>Cancel</button>
          <button style={button} disabled={busy || !phrase.trim()} onClick={async () => { setBusy(true); setError(""); try { setPreview(await request({ action: "preview_exclusion", phrase })); } catch (err) { setError(err instanceof Error ? err.message : "Preview failed"); } finally { setBusy(false); } }}>Preview matches</button>
          {preview && <button style={{ ...button, background: "#b91c1c", color: "white" }} disabled={busy} onClick={() => void act({ action: "add_exclusion", phrase: preview.phrase, previewToken: preview.previewToken })}>{busy ? "Saving…" : `Exclude exact title & remove ${preview.count} pending`}</button>}
        </div>
      </section>
    </div>}
  </div>;
}
