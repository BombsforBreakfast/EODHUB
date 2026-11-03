"use client";
import { useId, useState } from "react";
import type { TicketTypeDraft } from "@/app/lib/ticketing/event-intake";
import { ticketMoney, TICKETING_HUB_FEE } from "@/app/lib/ticketing/model";
import { projectTicketRevenue, TICKET_PROCESSING_ESTIMATE } from "@/app/lib/ticketing/revenue";
import styles from "./ticketing.module.css";

const count = (value: number) => value.toLocaleString("en-US");
export default function TicketRevenuePreview({ value, compact = false }: { value: TicketTypeDraft[]; compact?: boolean }) {
  const id = useId();
  const [ticketsPerOrder, setTicketsPerOrder] = useState(1);
  let estimate: ReturnType<typeof projectTicketRevenue> | null = null;
  try { estimate = projectTicketRevenue(value, ticketsPerOrder); } catch { /* Incomplete ticket types do not produce misleading event totals. */ }
  return <section className={styles.revenuePanel} aria-labelledby={id}>
    <div className={styles.sectionHeading}><h3 id={id}>Potential revenue · 100% sold</h3><span className={styles.tag}>Estimate</span></div>
    {!estimate ? <p className={styles.muted}>Complete each ticket type&apos;s name, price and quantity to calculate the full-capacity forecast.</p> : <>
      <p className={styles.finePrint}>{count(estimate.totals.tickets)} tickets total · {count(estimate.totals.paidTickets)} paid · {count(estimate.totals.freeTickets)} free. Assumes every available ticket is sold or claimed.</p>
      <div className={styles.revenueMetrics}>
        <div><span>Potential ticket sales</span><strong>{ticketMoney(estimate.totals.ticketSalesCents)}</strong><small>Ticket face value</small></div>
        <div><span>EOD-HUB service-fee revenue</span><strong>{ticketMoney(estimate.totals.hubRevenueCents)}</strong><small>Added to the buyer&apos;s price</small></div>
        <div><span>Card processing · estimated</span><strong>{ticketMoney(estimate.totals.processingCents)}</strong><small>Deducted from organizer proceeds</small></div>
        <div className={styles.revenueNet}><span>Organizer proceeds · estimated</span><strong>{ticketMoney(estimate.totals.organizerProceedsCents)}</strong><small>Ticket sales less processing</small></div>
      </div>
      <dl className={styles.revenueTotals}><div><dt>Total paid by buyers</dt><dd>{ticketMoney(estimate.totals.buyerCollectionsCents)}</dd></div><div><dt>Estimated paid orders</dt><dd>{count(estimate.totals.paidOrders)}</dd></div></dl>
      <p className={styles.finePrint}>Buyers pay the Hub service fee. Card processing comes out of the organizer&apos;s ticket revenue. Hub service-fee revenue is before taxes and operating costs.</p>
      {estimate.totals.organizerProceedsCents < 0 ? <p className={styles.notice}>At these prices, estimated processing exceeds ticket revenue. Increase the ticket price or review the fee assumptions.</p> : null}
      <details className={styles.revenueDetails}>
        <summary>Fee assumptions{compact ? " & ticket breakdown" : " & breakdown by ticket type"}</summary>
        <label className={styles.field}>Paid tickets per order (estimate)<select value={ticketsPerOrder} onChange={event => setTicketsPerOrder(Number(event.target.value))}>{[1, 2, 3, 4, 5, 6, 7, 8].map(quantity => <option key={quantity} value={quantity}>{quantity} {quantity === 1 ? "ticket" : "tickets"}</option>)}</select></label>
        <p className={styles.finePrint}>Hub fee: {ticketMoney(TICKETING_HUB_FEE.fixedCents)} + {TICKETING_HUB_FEE.basisPoints / 100}% per paid ticket. Processing estimate: {TICKET_PROCESSING_ESTIMATE.basisPoints / 100}% + {ticketMoney(TICKET_PROCESSING_ESTIMATE.fixedCents)} per paid order, charged on the ticket price plus the Hub fee. Free tickets have no estimated Hub or processing fee.</p>
        <p className={styles.finePrint}>Orders are grouped by ticket type, with a smaller final order when needed. Uses <a href={TICKET_PROCESSING_ESTIMATE.source} target="_blank" rel="noopener noreferrer" className={styles.revenueSource}>Stripe&apos;s standard U.S. domestic-card pricing</a>. Actual fees depend on your Stripe pricing and payment mix. Taxes, refunds, discounts and additional Stripe charges are excluded.</p>
        <div className={styles.revenueTableWrap}><table className={styles.revenueTable}><caption>Projected totals if every ticket is sold</caption><thead><tr><th scope="col">Ticket type</th><th scope="col">Tickets</th><th scope="col">Ticket sales</th><th scope="col">Hub fees</th><th scope="col">Processing</th><th scope="col">Organizer proceeds</th></tr></thead><tbody>{estimate.rows.map(row => <tr key={row.id}><th scope="row">{row.name}</th><td>{count(row.capacity)}</td><td>{ticketMoney(row.ticketSalesCents)}</td><td>{ticketMoney(row.hubRevenueCents)}</td><td>{ticketMoney(row.processingCents)}</td><td>{ticketMoney(row.organizerProceedsCents)}</td></tr>)}</tbody></table></div>
      </details>
    </>}
  </section>;
}
