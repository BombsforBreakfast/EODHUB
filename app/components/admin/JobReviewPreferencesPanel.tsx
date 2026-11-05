"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/lib/supabaseClient";
import { useTheme } from "../../lib/ThemeContext";
import type { JobPriorityRule } from "../../lib/jobMissionPriority";
type Props = { target: { id: string; title: string | null } | null; queueSize: number; onClose: () => void; onChanged: () => Promise<void> };
export default function JobReviewPreferencesPanel({ queueSize, onClose, onChanged }: Props) {
  const { t } = useTheme();
  const [priorities, setPriorities] = useState<JobPriorityRule[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function request(body?: object) {
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch("/api/admin/job-review-preferences", { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${session?.access_token ?? ""}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not load priorities");
    return result;
  }
  useEffect(() => { void request().then(result => setPriorities(result.priorities ?? [])).catch(err => setError(err.message)); }, [queueSize]);
  async function remove(id: string) {
    setBusy(true); setError("");
    try { await request({ action: "remove_priority", id }); setPriorities(current => current.filter(rule => rule.id !== id)); await onChanged(); onClose(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not remove priority"); }
    finally { setBusy(false); }
  }
  return <div style={{ marginBottom: 16, color: t.text, fontSize: 13 }}>
    <details><summary style={{ cursor: "pointer" }}>Positive scoring · manual approval · {priorities.length} priority rules</summary>
      <p>Every imported listing stays in review. Scores rank positive evidence; no title exclusions, learned penalties, degree penalties, or automatic approval apply.</p>
      <p>100: Explosive Ordnance Disposal or Explosive Ordnance in title or description; UXO, Bomb Tech/Technician, or CWMD in title; Countering Weapons of Mass Destruction in title or description.</p>
      <p>85: UXO in description. Explosive/explosives: 75 in title, 60 in description. Other positive mission evidence and explicit priority rules can raise scores. All jobs are visible by default, highest scores first.</p>
      <p>Approve or choose a Job of the Day yourself. Not relevant removes only that listing; it does not teach a negative title pattern.</p>
      {priorities.map(rule => <div key={rule.id} style={{ marginBottom: 8 }}><strong>{rule.phrase}</strong> · {rule.target_score}/100{rule.job_id ? " · this job only" : ""}{rule.mission_required ? " · mission evidence required" : ""} <button disabled={busy} onClick={() => void remove(rule.id)}>Remove priority rule</button></div>)}
    </details>{error && <p role="alert">{error}</p>}
  </div>;
}
