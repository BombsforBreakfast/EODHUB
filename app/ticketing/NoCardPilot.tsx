"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { QRCodeSVG } from "qrcode.react";
import { pilotQrValue, pilotTicketQuote, type PilotOrder, type PilotTicketPage } from "@/app/lib/ticketing/pilot-checkout";
import { ticketMoney } from "@/app/lib/ticketing/model";
import styles from "./ticketing.module.css";

type Request = <T>(url: string, body?: Record<string, unknown>) => Promise<T>;
const endpoint = "/api/ticketing/pilot";

export function NoCardPilotSwitch({ eventId, enabled, approved, revision, request, onChanged }: {
  eventId: string; enabled: boolean; approved: boolean; revision: number; request: Request; onChanged: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  return <aside className={styles.pilotSwitch}>
    <label><input type="checkbox" checked={enabled} disabled={saving || (!approved && !enabled)} onChange={event => {
      const next = event.target.checked;
      setSaving(true); setError("");
      void request(endpoint, { action: "set-mode", eventId, expectedRevision: revision, enabled: next }).then(onChanged)
        .catch(cause => setError(cause instanceof Error ? cause.message : "Could not update pilot mode."))
        .finally(() => setSaving(false));
    }} /><strong>No-card pilot: issue tickets for $0</strong></label>
    <p>{approved ? "No card, admission payment, Hub fee or processing fee. Regular ticket prices stay saved. Turn off to stop new pilot tickets; issued tickets remain in My tickets." : "Approve this event before enabling no-card tickets."}</p>
    {saving ? <p role="status">Saving pilot setting…</p> : null}
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
  </aside>;
}

export function NoCardPilotTickets({ userId, refreshKey, request }: { userId: string; refreshKey: number; request: Request }) {
  const [page, setPage] = useState<PilotTicketPage | null>(null);
  const [selected, setSelected] = useState("");
  const [ticketType, setTicketType] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const purchase = useRef<{ key: string; id: string } | null>(null);
  const inFlight = useRef(false);
  const epoch = useRef(0);
  const load = useCallback(async () => {
    const version = ++epoch.current;
    const next = await request<PilotTicketPage>(endpoint);
    if (version !== epoch.current) return;
    setPage(next);
    setSelected(current => next.events.some(event => event.id === current) ? current : next.events[0]?.id ?? "");
  }, [request]);
  useEffect(() => {
    let active = true;
    const generation = epoch;
    void load().catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Could not load pilot tickets."); });
    return () => { active = false; generation.current++; };
  }, [userId, refreshKey, revision, load]);
  const event = page?.events.find(value => value.id === selected);
  const type = event?.ticketTypes.find(value => value.id === ticketType) ?? event?.ticketTypes[0];
  const quote = type ? pilotTicketQuote(type.priceCents, quantity) : null;

  async function claim(submit: FormEvent) {
    submit.preventDefault();
    if (!event || !type || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(""); setNotice("");
    const key = `${userId}:${event.id}:${type.id}:${quantity}`;
    if (purchase.current?.key !== key) purchase.current = { key, id: crypto.randomUUID() };
    try {
      const order = await request<PilotOrder>(endpoint, { action: "claim", buyerUserId: userId, eventId: event.id, ticketTypeId: type.id, quantity, requestId: purchase.current.id });
      purchase.current = null;
      setPage(previous => previous ? { ...previous, orders: [order, ...previous.orders.filter(value => value.id !== order.id)] } : previous);
      setNotice(`${order.quantity} pilot ticket${order.quantity === 1 ? "" : "s"} issued. No payment or fees collected.`);
      try { await load(); } catch { /* The confirmed receipt remains available above a stale catalog. */ }
    } catch (cause) {
      setError(`${cause instanceof Error ? cause.message : "Could not issue tickets."} If the connection dropped, retry the same selection to retrieve the original order.`);
    } finally { inFlight.current = false; setBusy(false); }
  }

  async function more() {
    if (!page?.next || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      const next = await request<PilotTicketPage>(`${endpoint}?before=${encodeURIComponent(page.next)}`);
      setPage(previous => previous ? { ...previous, next: next.next, orders: [...new Map([...previous.orders, ...next.orders].map(order => [order.id, order])).values()] } : previous);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load more tickets."); }
    finally { inFlight.current = false; setBusy(false); }
  }

  return <section className={styles.pilotTickets} aria-label="Pilot tickets">
    <div className={styles.row}><h2>Tickets</h2><button type="button" className={styles.textButton} disabled={busy} onClick={() => { setError(""); setRevision(value => value + 1); }}>Refresh tickets</button></div>
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    {notice ? <p role="status" className={styles.notice}>{notice}</p> : null}
    {!page ? <p role="status">Loading your tickets…</p> : <>
      {event && type && quote ? <form className={`${styles.purchaseBox} ${styles.form}`} onSubmit={submit => void claim(submit)}>
        <span className={styles.tag}>NO-CARD PILOT · $0 DUE</span>
        <h3>Get pilot tickets</h3>
        <label>Event<select value={selected} disabled={busy} onChange={change => { setSelected(change.target.value); setTicketType(""); setQuantity(1); }}>{page.events.map(value => <option key={value.id} value={value.id}>{value.title}</option>)}</select></label>
        <p className={styles.muted}>{event.location} · {new Date(event.startsAt).toLocaleString(undefined, { timeZone: event.timeZone })}</p>
        <label>Ticket type<select value={type.id} disabled={busy} onChange={change => { setTicketType(change.target.value); setQuantity(1); }}>{event.ticketTypes.map(value => <option key={value.id} value={value.id}>{value.name} · {value.remaining} remaining · normally {ticketMoney(value.priceCents)}</option>)}</select></label>
        <label>Quantity<select value={quantity} disabled={busy || !type.remaining} onChange={change => setQuantity(Number(change.target.value))}>{Array.from({ length: Math.max(1, Math.min(8, type.remaining)) }, (_, index) => <option key={index + 1}>{index + 1}</option>)}</select></label>
        <dl className={styles.pilotTotals}><div><dt>Tickets</dt><dd>$0.00</dd></div><div><dt>Hub fee</dt><dd>$0.00</dd></div><div><dt>Card processing</dt><dd>$0.00</dd></div><div><dt>Total due</dt><dd>$0.00</dd></div></dl>
        <p className={styles.finePrint}>Regular ticket value {ticketMoney(quote.regularSubtotalCents)}. This pilot order requires no card and collects no money. Pilot tickets are for testing.</p>
        <button type="submit" className={styles.primary} disabled={busy || type.remaining < quantity}>{busy ? "Issuing tickets…" : type.remaining ? "Get $0 pilot tickets" : "Sold out"}</button>
      </form> : <p className={styles.muted}>No events are currently open for no-card tickets. Your issued tickets stay available below.</p>}
      <h3 className={styles.myTicketsTitle}>My tickets</h3>
      {!page.orders.length ? <p className={styles.muted}>Your pilot tickets will appear here after registration.</p> : page.orders.map(order => <article key={order.id} className={styles.eventCard}>
        <div className={styles.cardBody}><span className={styles.tag}>PILOT · NO PAYMENT COLLECTED</span><h3>{order.event.title}</h3><p className={styles.muted}>{order.ticketType} · {order.event.location}<br />{new Date(order.event.startsAt).toLocaleString(undefined, { timeZone: order.event.timeZone })}</p>
          <div className={styles.pilotTicketGrid}>{order.tickets.map((ticket, index) => <div className={styles.pilotTicket} key={ticket.id}>
            <QRCodeSVG value={pilotQrValue(ticket.qr)} size={152} level="M" title={`Pilot ticket ${index + 1} for ${order.event.title}`} />
            <strong>{ticket.manualCode}</strong><small>Ticket {index + 1} of {order.quantity} · pilot only</small>
          </div>)}</div>
          <p className={styles.finePrint}>Total collected $0.00 · Hub fee $0.00 · processing $0.00<br />Order {order.id}</p>
        </div>
      </article>)}
      {page.next ? <button type="button" className={styles.secondary} disabled={busy} onClick={() => void more()}>Load older tickets</button> : null}
    </>}
  </section>;
}
