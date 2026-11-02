"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import NavBar from "@/app/components/NavBar";
import { supabase } from "@/app/lib/lib/supabaseClient";
import { supportDollars } from "@/app/lib/hubSupport";
import { useTheme } from "@/app/lib/ThemeContext";
import styles from "@/app/components/support/hubSupport.module.css";

type Contribution = { id: string; amount_cents: number; refunded_cents: number; disputed_cents: number; frequency: string; status: string; livemode: boolean; created_at: string; paid_at: string | null; contributor_name: string | null; contributor_email: string | null; contributor_details_status: "available" | "unavailable" | "different_mode" };
type Subscriber = { id: string; amount_cents: number; livemode: boolean; status: string; cancel_at_period_end: boolean; current_period_end: string | null; contributor_name: string | null; contributor_email: string | null };
type BillingIssue = { incident_key: string; kind: string; detail: string; stripe_object_id: string; created_at: string };
export default function SupportAdminPage() {
  const { t } = useTheme();
  const [items, setItems] = useState<Contribution[]>([]);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]), [issues, setIssues] = useState<BillingIssue[]>([]), [pendingEmails, setPendingEmails] = useState(0);
  const [tab, setTab] = useState<"payments" | "monthly" | "issues">("payments");
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
      setSubscribers(body.subscribers ?? []); setIssues(body.issues ?? []); setPendingEmails(body.pendingEmails ?? 0);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load contributions."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function resolveIssue(incidentKey: string) {
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw Error("Sign in with your administrator account.");
      const result = await fetch("/api/admin/hub-support", { method: "PATCH", headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ incidentKey }) });
      if (!result.ok) throw Error("Could not mark the issue reviewed.");
      setIssues(current => current.filter(row => row.incident_key !== incidentKey));
    } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); }
  }
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
    <Link href="/admin">Admin panel</Link><h1>Hub contributions</h1><p>Voluntary one-time and monthly support. Confirmed payments are separate from recurring commitments. Amounts below are before Stripe processing fees. Reconcile payouts, review disputes, and issue refunds in Stripe.</p>
    <button type="button" onClick={() => void load()} disabled={loading}>Refresh contributions</button>
    {!error && !loading ? <p><button type="button" onClick={() => void testAlert()} disabled={testing}>{testing ? "Sending test alert…" : "Send me a test alert"}</button></p> : null}
    <p role="status">{testMessage}</p>
    {error ? <p role="alert">{error}</p> : null}
    <div role="group" aria-label="Support reports" style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>{(["payments", "monthly", "issues"] as const).map(value => <button key={value} aria-pressed={tab === value} onClick={() => setTab(value)} style={{ minHeight: 44, fontWeight: tab === value ? 800 : 400 }}>{value === "payments" ? "Confirmed payments" : value === "monthly" ? "Monthly supporters" : `Billing review (${issues.length})`}</button>)}</div>
    {pendingEmails ? <p role="status">{pendingEmails} live billing email(s) queued for delivery or retry.</p> : null}
    {loading ? <p role="status">Loading…</p> : tab === "monthly" ? <><p>Most recent 100 monthly subscriptions. Amounts are commitments, not collected funds. Cancelled subscriptions remain here for reference.</p>{subscribers.length ? <ul style={{ listStyle: "none", padding: 0 }}>{subscribers.map(row => <li key={row.id} style={{ padding: "16px 0", borderBottom: `1px solid ${t.border}`, overflowWrap: "anywhere" }}><strong>{supportDollars(row.amount_cents)}/month</strong> · {row.status.replaceAll("_", " ")} · {row.livemode ? "Live" : "Test"}<div>{row.contributor_name || "Name not provided"} · {row.contributor_email || "Email temporarily unavailable"}</div><div>{row.cancel_at_period_end ? "Renewal cancelled" : ["active", "trialing"].includes(row.status) ? "Auto-renewing" : "Check billing status"}{row.current_period_end ? ` · Current period ends ${new Date(row.current_period_end).toLocaleDateString()}` : ""}</div></li>)}</ul> : <p>No monthly supporters yet.</p>}</> : tab === "issues" ? <>{issues.length ? <ul>{issues.map(row => <li key={row.incident_key} style={{ padding: "16px 0", overflowWrap: "anywhere" }}><strong>{row.kind.replaceAll("_", " ")}</strong><div>{row.detail}</div><small>{row.stripe_object_id} · {new Date(row.created_at).toLocaleString()}</small><button onClick={() => void resolveIssue(row.incident_key)}>Mark reviewed</button></li>)}</ul> : <p>No open billing issues.</p>}<p>Payment failures clear automatically after recovery. Refund, fraud, and dispute reviews remain visible for reconciliation in Stripe. No automatic refunds are issued.</p></> : items.length ? <ul style={{ listStyle: "none", padding: 0 }}>{items.map(item => <li key={item.id} style={{ padding: "16px 0", borderBottom: `1px solid ${t.border}` }}><strong>{supportDollars(item.amount_cents)}</strong> · {item.frequency === "monthly" ? "Monthly" : "One-time"} · {item.status.replaceAll("_", " ")} · {item.livemode ? "Live" : "Test"}<br /><small style={{ margin: "4px 0" }}>{new Date(item.paid_at || item.created_at).toLocaleString()}{item.refunded_cents ? ` · Refunded ${supportDollars(item.refunded_cents)}` : ""}{item.disputed_cents ? ` · Disputed ${supportDollars(item.disputed_cents)}` : ""}</small>
      <div style={{ fontSize: 14, lineHeight: 1.6, overflowWrap: "anywhere" }}>
        {item.contributor_details_status === "available" ? <><div>{item.contributor_name || "Name not provided"}</div><div style={{ color: t.textMuted }}>{item.contributor_email || "Email not provided"}</div></> : <span style={{ color: t.textMuted }}>{item.contributor_details_status === "different_mode" ? "Contact details are in the matching Stripe payment environment." : "Contributor details are temporarily unavailable. Refresh to try again."}</span>}
      </div>
    </li>)}</ul> : !error ? <p>No contributions yet.</p> : null}
    <small>Checkout names and receipt emails are private to this owner report. Names are supplied at checkout and are not identity verification.</small>
    <small>Most recent 100 confirmed contributions. Unfinished checkouts are excluded. No membership status is created or changed.</small>
  </main></div>;
}
