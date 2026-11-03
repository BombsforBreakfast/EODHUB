"use client";
import { Plus, Trash2 } from "lucide-react";
import { MAX_TICKET_TYPES, parseTicketPrice, type TicketTypeDraft } from "@/app/lib/ticketing/event-intake";
import { ticketMoney, ticketPrice } from "@/app/lib/ticketing/model";
import styles from "./ticketing.module.css";

export default function TicketTypesEditor({ value, onChange }: { value: TicketTypeDraft[]; onChange: (value: TicketTypeDraft[]) => void }) {
  const change = (id: string, field: "name" | "price" | "capacity", next: string) => onChange(value.map(row => row.id === id ? { ...row, [field]: next } : row));
  return <>
    <h3>Ticket types</h3>
    <p className={styles.finePrint}>Name tickets for your audience: Attendee, Competitor, Spectator, Adult, Child, or Military / Veteran. Each type has its own price and number available. Enter $0 for a free ticket.</p>
    {value.map((row, index) => {
      let example: ReturnType<typeof ticketPrice> | null = null;
      try { example = ticketPrice(parseTicketPrice(row.price), 1); } catch { /* Unfinished prices remain editable. */ }
      return <fieldset key={row.id} className={styles.ticketTypeEditor}>
        <legend>Ticket type {index + 1}</legend>
        <div className={styles.ticketTypeFields}>
          <label>Ticket type name<input value={row.name} onChange={event => change(row.id, "name", event.target.value)} required maxLength={60} placeholder="For example: Competitor or Adult" /></label>
          <label>Ticket price (USD)<input type="number" min="0" max="10000" step="0.01" value={row.price} onChange={event => change(row.id, "price", event.target.value)} required placeholder="0.00" /></label>
          <label>Tickets available<input type="number" min="1" max="100000" step="1" value={row.capacity} onChange={event => change(row.id, "capacity", event.target.value)} required placeholder="For example: 50" /></label>
        </div>
        <div className={styles.ticketTypeFooter}>{example ? <small className={styles.finePrint}>Example buyer total: {ticketMoney(example.totalCents)} · includes {ticketMoney(example.feeCents)} Hub fee</small> : <span />}{value.length > 1 ? <button type="button" className={styles.textButton} onClick={() => onChange(value.filter(item => item.id !== row.id))}><Trash2 size={15} />Remove ticket type {index + 1}</button> : null}</div>
      </fieldset>;
    })}
    <div className={styles.buttonRow}><button type="button" className={styles.secondary} disabled={value.length >= MAX_TICKET_TYPES} onClick={() => onChange([...value, { id: crypto.randomUUID(), name: "", price: "", capacity: "" }])}><Plus size={16} />Add ticket type</button><span className={styles.finePrint}>{value.length} of {MAX_TICKET_TYPES} ticket types · one initial type plus five additions</span></div>
    <p className={styles.notice}>Ticket sales are disabled during this pilot. Final fees, taxes and refund terms will be confirmed before checkout opens.</p>
  </>;
}
