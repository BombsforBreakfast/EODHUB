"use client";
import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { WebSupportOnly } from "@/app/components/support/HubSupportProvider";
import { useTheme } from "@/app/lib/ThemeContext";
import styles from "@/app/components/support/hubSupport.module.css";

export default function ManageSupportPage() {
  const { t } = useTheme();
  const [email, setEmail] = useState(""), [token, setToken] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  useEffect(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (value) { setToken(value); window.history.replaceState(null, "", window.location.pathname); }
    else if (new URLSearchParams(window.location.search).has("returned")) setMessage("Your changes are saved in Stripe. Confirmation emails may take a moment. Request a new link if you need to make another change.");
  }, []);
  async function submit(payload: { email: string } | { token: string }) {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/hub-support/manage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw Error(body.error || "Please try again.");
      if (body.url) {
        const url = new URL(body.url);
        if (url.protocol !== "https:" || url.hostname !== "billing.stripe.com") throw Error("Billing could not open.");
        window.location.assign(url.href);
      } else setMessage(body.message);
    } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); }
    finally { setBusy(false); }
  }
  return <main className={styles.page} style={{ color: t.text, "--support-input": t.input, "--support-border": t.border } as CSSProperties}><Link href="/login">EOD-HUB</Link><WebSupportOnly>
    <h1>Manage monthly support</h1><p>View invoices, update your payment method, or cancel future renewals. No Hub account is required.</p>
    {token ? <p><button className={styles.primary} disabled={busy} onClick={() => void submit({ token })}>{busy ? "Opening secure billing…" : "Open secure billing"}</button></p> : null}
    <form onSubmit={e => { e.preventDefault(); void submit({ email }); }}><label className={styles.custom}>Email used at checkout<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} style={{ color: t.text }} /></label><p><button className={styles.primary} disabled={busy}>{busy ? "Sending…" : "Email me a management link"}</button></p></form>
    {message ? <p role="status">{message}</p> : null}{error ? <p role="alert">{error}</p> : null}
    <small>Cancellation stops future renewals. For questions about an existing payment or refund, contact hello@eod-hub.com.</small>
    <Link href="/support-the-hub">Back to Support the Hub</Link>
  </WebSupportOnly></main>;
}
