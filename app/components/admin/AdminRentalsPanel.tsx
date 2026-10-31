"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/app/lib/lib/supabaseClient";
import { useTheme } from "@/app/lib/ThemeContext";
import type { RentalStatus } from "@/app/lib/rentals/availability";
import AdminRentalProvidersPanel from "./AdminRentalProvidersPanel";
import AdminRentalDelistingsPanel from "./AdminRentalDelistingsPanel";
import RentalAnalytics from "@/app/components/rentals/RentalAnalytics";
import AdminRentalFlagsPanel, { rentalFlagsRequest } from "./AdminRentalFlagsPanel";
import type { AnalyticsReport } from "@/app/lib/rentals/analytics";

async function loadAnalytics(query: string, signal?: AbortSignal): Promise<AnalyticsReport> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Sign in with your owner admin account.");
  const response = await fetch(`/api/admin/rentals/analytics?${query}`, { signal, headers: { Authorization: `Bearer ${data.session.access_token}` }, cache: "no-store" });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || "Could not load analytics."); return result;
}

type Item = { id: string; address: string; status: RentalStatus; projectedAvailabilityDate: string };
async function adminFetch(init?: RequestInit) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Sign in with your owner admin account.");
  const response = await fetch("/api/admin/rentals", { ...init, headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Could not update rental availability.");
  return body;
}
export default function AdminRentalsPanel() {
  const { t } = useTheme();
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"manage" | "analytics" | "flags" | "delistings">("manage");
  const [flagCount, setFlagCount] = useState<number | null>(null);
  useEffect(() => { void rentalFlagsRequest("?count=1").then(data => setFlagCount(data.active)).catch(() => {}); }, []);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setItems((await adminFetch()).items); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load rentals."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return <section style={{ marginTop: 24, maxWidth: 720 }} aria-labelledby="rental-admin-title">
    <h2 id="rental-admin-title" style={{ fontSize: 24, fontWeight: 800 }}>Rentals</h2>
    <nav aria-label="Rentals sections" style={{ display: "flex", flexWrap: "wrap", gap: 12, margin: "20px 0", borderBottom: `1px solid ${t.border}` }}>{([['manage', 'Manage rentals'], ['analytics', 'Analytics'], ['delistings', 'Delisting & refunds'], ['flags', `Flagged listings${flagCount === null ? '' : ` (${flagCount})`}`]] as const).map(([id, title]) => <button key={id} type="button" aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)} style={{ padding: "12px 4px", background: "transparent", border: 0, borderBottom: `2px solid ${tab === id ? t.text : 'transparent'}`, color: tab === id ? t.text : t.textMuted, fontWeight: 700 }}>{title}</button>)}</nav>
    {tab === "delistings" ? <AdminRentalDelistingsPanel/> : tab === "analytics" ? <RentalAnalytics scope="admin" loadReport={loadAnalytics}/> : tab === "flags" ? <AdminRentalFlagsPanel onCount={setFlagCount}/> : <>
    <AdminRentalProvidersPanel />
    <h3 style={{ marginTop: 36, fontSize: 20, fontWeight: 800 }}>Listing availability</h3>
    <p style={{ color: t.textMuted, margin: "8px 0 20px" }}>Update availability on the public rentals page. Projected dates appear only when provided.</p>
    <a href="/promote/rentals" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>View public rentals</a>
    {loading ? <p role="status">Loading rentals…</p> : null}
    {error ? <div role="alert"><p>{error}</p><button type="button" onClick={() => void load()}>Retry</button></div> : null}
    {!loading && !error ? items.map(item => <RentalEditor key={item.id} item={item} />) : null}
    </>}
  </section>;
}
function RentalEditor({ item }: { item: Item }) {
  const { t } = useTheme();
  const [status, setStatus] = useState(item.status);
  const [date, setDate] = useState(item.projectedAvailabilityDate);
  const [saved, setSaved] = useState(item);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const dirty = status !== saved.status || date !== saved.projectedAvailabilityDate;
  const control = { width: "100%", minHeight: 44, minWidth: 0, padding: "10px 12px", borderRadius: 10, border: `1px solid ${t.inputBorder}`, background: t.input, color: t.text, fontSize: 16 };
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await adminFetch({ method: "PATCH", body: JSON.stringify({ id: item.id, status, projectedAvailabilityDate: date || null }) });
      setSaved({ ...item, status, projectedAvailabilityDate: date });
      setMessage("Saved. The public listing is updated.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save availability."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={save} aria-label={item.address} style={{ marginTop: 20, padding: 20, border: `1px solid ${t.border}`, borderRadius: 16, background: t.surface }}>
    <h3 style={{ fontWeight: 800, marginBottom: 16 }}>{item.address}</h3>
    <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 14, minWidth: 0 }}>
      <label style={{ display: "grid", gap: 6 }}>Status<select value={status} onChange={e => { setStatus(e.target.value as RentalStatus); setMessage(""); }} style={control}><option value="available-now">Available</option><option value="pending">Pending</option><option value="unavailable">Unavailable</option></select></label>
      <label style={{ display: "grid", gap: 6 }}>Projected availability date (optional)<input type="date" value={date} onChange={e => { setDate(e.target.value); setMessage(""); }} style={control} /></label>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button type="button" disabled={!date} onClick={() => { setDate(""); setMessage(""); }} style={{ ...control, width: "auto", cursor: "pointer" }}>Clear date</button>
        <button type="submit" disabled={!dirty || busy} style={{ ...control, width: "auto", background: t.text, color: t.surface, fontWeight: 800, cursor: "pointer", opacity: !dirty || busy ? 0.5 : 1 }}>{busy ? "Saving…" : "Save availability"}</button>
      </div>
    </fieldset>
    {error ? <p role="alert" style={{ marginTop: 12, color: "#ef4444" }}>{error}</p> : null}
    {message ? <p role="status" style={{ marginTop: 12 }}>{message}</p> : null}
  </form>;
}
