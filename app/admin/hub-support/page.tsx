"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import NavBar from "@/app/components/NavBar";
import { supabase } from "@/app/lib/lib/supabaseClient";
import { supportDollars } from "@/app/lib/hubSupport";
import { useTheme } from "@/app/lib/ThemeContext";
import styles from "@/app/components/support/hubSupport.module.css";

type Contribution = { id: string; amount_cents: number; refunded_cents: number; status: string; livemode: boolean; created_at: string; paid_at: string | null; contributor_name: string | null; contributor_email: string | null; contributor_details_status: "available" | "unavailable" | "different_mode" };
export default function SupportAdminPage() {
  const { t } = useTheme();
  const [items, setItems] = useState<Contribution[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("Sign in with your administrator account.");
      const response = await fetch("/api/admin/hub-support", { headers: { Authorization: `Bearer ${data.session.access_token}` } });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load contributions.");
      setItems(body.items);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load contributions."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function testAlert() {
    if (testing) return;
    setTesting(true); setTestMessage("");
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("Sign in with your administrator account.");
      const response = await fetch("/api/admin/hub-support", { method: "POST", headers: { Authorization: `Bearer ${data.session.access_token}` } });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not send a test alert.");
      setTestMessage(body.message);
    } catch (e) { setTestMessage(e instanceof Error ? e.message : "Could not send a test alert."); }
    finally { setTesting(false); }
  }
  return <div style={{ minHeight: "100vh", background: t.bg, color: t.text }}><NavBar /><main className={styles.page}>
    <Link href="/admin">Admin panel</Link><h1>Hub contributions</h1><p>Confirmed voluntary, one-time support. Amounts below are before Stripe processing fees. Reconcile payouts and manage refunds in Stripe.</p>
    <button type="button" onClick={() => void load()} disabled={loading}>Refresh contributions</button>
    {!error && !loading ? <p><button type="button" onClick={() => void testAlert()} disabled={testing}>{testing ? "Sending test alert…" : "Send me a test alert"}</button></p> : null}
    <p role="status">{testMessage}</p>
    {error ? <p role="alert">{error}</p> : null}
    {loading ? <p role="status">Loading…</p> : items.length ? <ul style={{ listStyle: "none", padding: 0 }}>{items.map(item => <li key={item.id} style={{ padding: "16px 0", borderBottom: `1px solid ${t.border}` }}><strong>{supportDollars(item.amount_cents)}</strong> · {item.status.replaceAll("_", " ")} · {item.livemode ? "Live" : "Test"}<br /><small style={{ margin: "4px 0" }}>{new Date(item.paid_at || item.created_at).toLocaleString()}{item.refunded_cents ? ` · Refunded ${supportDollars(item.refunded_cents)}` : ""}</small>
      <div style={{ fontSize: 14, lineHeight: 1.6, overflowWrap: "anywhere" }}>
        {item.contributor_details_status === "available" ? <><div>{item.contributor_name || "Name not provided"}</div><div style={{ color: t.textMuted }}>{item.contributor_email || "Email not provided"}</div></> : <span style={{ color: t.textMuted }}>{item.contributor_details_status === "different_mode" ? "Contact details are in the matching Stripe payment environment." : "Contributor details are temporarily unavailable. Refresh to try again."}</span>}
      </div>
    </li>)}</ul> : !error ? <p>No contributions yet.</p> : null}
    <small>Checkout names and receipt emails are private to this owner report. Names are supplied at checkout and are not identity verification.</small>
    <small>Most recent 100 confirmed contributions. Unfinished checkouts are excluded. No membership status is created or changed.</small>
  </main></div>;
}
