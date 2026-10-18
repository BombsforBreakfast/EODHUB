"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "@/app/lib/ThemeContext";
import { HUB_SUPPORT_COSTS, HUB_SUPPORT_DISCLOSURE, HUB_SUPPORT_PRESETS, parseSupportAmount, supportDollars } from "@/app/lib/hubSupport";
import type { SupportView } from "./HubSupportProvider";
import styles from "./hubSupport.module.css";

export default function HubSupportModal({ view, onChange, onClose }: { view: SupportView; onChange: (view: SupportView) => void; onClose: () => void }) {
  const { t } = useTheme();
  const dialog = useRef<HTMLDialogElement>(null);
  const [selection, setSelection] = useState<number | "custom">(300);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState<{ id: string; amount: number } | null>(null);
  const amount = selection === "custom" ? parseSupportAmount(custom) : selection;
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, []);

  async function checkout(e: React.FormEvent) {
    e.preventDefault();
    if (busy || amount === null) return;
    setBusy(true); setError("");
    const request = attempt?.amount === amount ? attempt : { id: crypto.randomUUID(), amount };
    setAttempt(request);
    try {
      const response = await fetch("/api/hub-support/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amountCents: amount, requestId: request.id }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Checkout could not open. Please try again.");
      const url = new URL(body.url);
      if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com") throw new Error("Checkout could not open. Please try again.");
      window.location.assign(url.href);
    } catch (e) { setError(e instanceof Error ? e.message : "Checkout could not open. Please try again."); setBusy(false); }
  }

  return createPortal(<dialog ref={dialog} className={styles.dialog} aria-labelledby="hub-support-title" onCancel={onClose}
    onClick={e => { if (e.target === e.currentTarget) { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose(); } }}
    style={{ "--support-surface": t.surface, "--support-text": t.text, "--support-muted": t.textMuted, "--support-border": t.border, "--support-input": t.input } as CSSProperties}>
    <div className={styles.content}>
      <div className={styles.top}><span className={styles.eyebrow}>COMMUNITY SUPPORTED</span><button autoFocus className={styles.close} type="button" aria-label="Close support dialog" onClick={onClose}>×</button></div>
      <h2 id="hub-support-title">{view === "why" ? "A little energy. A stronger Hub." : "Buy the Hub an energy drink."}</h2>
      {view === "why" ? <>
        <p className={styles.lead}>For the price of an energy drink, you can help keep EOD-HUB running.</p>
        <h3>Built for our community</h3>
        <p>EOD-HUB connects Explosive Ordnance Disposal professionals and Public Service Bomb Technicians with opportunities, resources, and one another. Your support helps maintain the platform and supports the ongoing work of building a useful home for this community.</p>
        <h3>What keeps the Hub running</h3>
        <dl className={styles.costs}>{HUB_SUPPORT_COSTS.map(([label, cost]) => <div key={label}><dt>{label}</dt><dd>{cost}</dd></div>)}</dl>
        <p><strong>About $173.25 per month</strong> in recurring operating costs, averaged over the year, before payment processing and labor.</p>
        <p><strong>40 hours each month</strong> maintaining, improving, and managing the Hub.</p>
        <button type="button" className={styles.primary} onClick={() => onChange("contribute")}>Support the Hub</button>
      </> : <>
        <p className={styles.lead}>A small boost helps keep the Hub running.</p>
        <form onSubmit={checkout}>
          <fieldset disabled={busy} className={styles.fieldset}><legend>Choose a one-time contribution · USD</legend><div className={styles.amounts}>
            {HUB_SUPPORT_PRESETS.map(cents => <button key={cents} type="button" aria-pressed={selection === cents} onClick={() => { setSelection(cents); setError(""); }}>{supportDollars(cents).replace(".00", "")}</button>)}
            <button type="button" aria-pressed={selection === "custom"} onClick={() => { setSelection("custom"); setError(""); }}>Custom</button>
          </div>{selection === "custom" ? <label className={styles.custom}>Custom amount (USD)<input autoFocus inputMode="decimal" type="text" value={custom} onChange={e => setCustom(e.target.value)} placeholder="10.00" maxLength={6} aria-describedby="support-amount-help" /><small id="support-amount-help">Enter $1–$500, with up to two decimal places.</small></label> : null}</fieldset>
          <p className={styles.note}>If you think EOD-HUB is a worthwhile mission, or it has helped you or someone you know, please consider contributing.</p>
          <button className={styles.primary} type="submit" disabled={busy || amount === null}>{busy ? "Opening secure checkout…" : `Continue${amount !== null ? ` with ${supportDollars(amount)}` : " to checkout"}`}</button>
          <p className={styles.hint}>One-time payment. No subscription. No account required.</p>
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
        </form>
        <button type="button" className={styles.textButton} onClick={() => onChange("why")}>Why support the Hub?</button>
      </>}
      <p className={styles.disclosure}>{HUB_SUPPORT_DISCLOSURE}</p>
    </div>
  </dialog>, document.body);
}
