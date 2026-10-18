"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { supabase } from "@/app/lib/lib/supabaseClient";
import { useTheme } from "@/app/lib/ThemeContext";
import { PROMOTION_STATUSES, type PromotionRequest } from "@/app/lib/promotions";
import NavBar from "@/app/components/NavBar";
import styles from "./promotions.module.css";

type ReviewRequest = Omit<PromotionRequest, "attachments"> & { attachments: { path: string; name: string; size: number; url: string | null }[] };
async function adminFetch(url: string, init?: RequestInit) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Sign in with your promotions administrator account to open this queue.");
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "Could not load promotions.");
  return body;
}
export default function PromotionsAdminPage() {
  const { t } = useTheme();
  const [items, setItems] = useState<ReviewRequest[]>([]);
  const [selected, setSelected] = useState<ReviewRequest | null>(null);
  const [filter, setFilter] = useState("new");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("new");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setItems((await adminFetch(`/api/admin/promotions?status=${filter}`)).items); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load promotions."); }
    finally { setLoading(false); }
  }, [filter]);
  const open = useCallback(async (id: string) => {
    setError(""); setSaved("");
    try {
      const item = (await adminFetch(`/api/admin/promotions?id=${encodeURIComponent(id)}`)).items[0];
      if (!item) throw new Error("That request is no longer available.");
      setSelected(item); setNotes(item.admin_notes); setStatus(item.status);
      window.history.replaceState(null, "", `/admin/promotions?request=${id}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not open request."); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("request");
    if (id) void open(id);
  }, [open]);
  async function save() {
    if (!selected) return;
    setSaving(true); setSaved(""); setError("");
    try {
      await adminFetch("/api/admin/promotions", { method: "PATCH", body: JSON.stringify({ id: selected.id, status, notes }) });
      setSelected(previous => previous ? { ...previous, status, admin_notes: notes } : null);
      setSaved("Review saved. Nothing was published or charged.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save review."); }
    finally { setSaving(false); }
  }
  return <div className={styles.shell} style={{ background: t.bg, color: t.text }}>
    <NavBar />
    <main className={styles.main}>
      <header className={styles.heading}><div><Link href="/admin">Admin panel</Link><h1>Promotions review</h1><p>Review the brief here. Coordinate by email and invoice manually through Square.</p></div><button type="button" onClick={() => void load()} disabled={loading}>Refresh queue</button></header>
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
      <div className={styles.layout}>
        <section className={styles.panel} style={{ background: t.surface, borderColor: t.border }} aria-label="Promotion queue">
          <label>Show requests<select value={filter} onChange={e => setFilter(e.target.value)}><option value="">All recent requests</option>{PROMOTION_STATUSES.map(value => <option key={value} value={value}>{value === "new" ? "New — needs review" : value}</option>)}</select></label>
          {loading ? <p role="status">Loading requests…</p> : items.length === 0 ? <p>No requests in this view.</p> : <ul className={styles.queue}>{items.map(item => <li key={item.id}><button type="button" aria-pressed={selected?.id === item.id} onClick={() => void open(item.id)}><strong>{item.business || item.name}</strong><span>{item.package} · {item.promotion_type}</span><small>{item.status} · {new Date(item.submitted_at).toLocaleDateString()}</small></button></li>)}</ul>}
          <small>Most recent 100 in this view.</small>
        </section>
        <section className={styles.panel} style={{ background: t.surface, borderColor: t.border }} aria-label="Promotion request details">
          {selected ? <>
            <p className={styles.badge}>{selected.package} package interest · {selected.id.slice(0,8).toUpperCase()}</p><h2>{selected.business || selected.name}</h2>
            <dl className={styles.details}><dt>Contact</dt><dd>{selected.name}<br /><a href={`mailto:${selected.email}`}>{selected.email}</a>{selected.phone ? <><br /><a href={`tel:${selected.phone.replace(/[^+0-9]/g, "")}`}>{selected.phone}</a></> : null}</dd><dt>Promotion type</dt><dd>{selected.promotion_type}</dd><dt>Brief</dt><dd>{selected.description}</dd>{selected.destination ? <><dt>Destination</dt><dd><a href={selected.destination} target="_blank" rel="noopener noreferrer">{selected.destination}</a></dd></> : null}{selected.timing ? <><dt>Preferred timing</dt><dd>{selected.timing}</dd></> : null}<dt>Received</dt><dd>{new Date(selected.submitted_at).toLocaleString()}</dd></dl>
            <h3>Submitted images ({selected.attachments.length})</h3><p className={styles.hint}>Private review copies. If an image link expires, reopen the request to refresh it.</p>
            <div className={styles.images}>{selected.attachments.map(file => <figure key={file.path}>{file.url ? <><Image unoptimized src={file.url} alt={file.name} width={600} height={400} style={{ objectFit: "contain", width: "100%", height: "auto", maxHeight: 360 }} /><figcaption><a href={file.url} target="_blank" rel="noopener noreferrer">Open {file.name}</a> · {Math.round(file.size / 1024)} KB</figcaption></> : <figcaption>Image unavailable — reopen this request.</figcaption>}</figure>)}</div>
            <label>Review status<select value={status} onChange={e => setStatus(e.target.value)} disabled={saving}>{PROMOTION_STATUSES.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
            <label>Private coordination notes<textarea rows={7} maxLength={12000} value={notes} onChange={e => setNotes(e.target.value)} disabled={saving} placeholder="Follow-up, agreed scope, Square invoice reference, payment confirmation…" /></label>
            <p className={styles.hint}>Status and notes are internal. Confirm scope, collect payment and publish manually.</p>
            <button type="button" className={styles.save} disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save review"}</button>
            {saved ? <p role="status">{saved}</p> : null}
          </> : <p>Choose a request to review its contact details, brief and images.</p>}
        </section>
      </div>
    </main>
  </div>;
}
