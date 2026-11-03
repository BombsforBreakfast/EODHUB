import { parseTicketTypes, type TicketTypeDraft } from "./event-intake";
import { ticketPrice } from "./model";

// Standard U.S. domestic-card estimate, verified 2026-11-03. Account-specific,
// international, Connect/payout and other additional fees are not modeled.
export const TICKET_PROCESSING_ESTIMATE = { basisPoints: 290, fixedCents: 30, source: "https://stripe.com/pricing" } as const;

export function estimatedCardFee(chargeCents: number) {
  if (!Number.isSafeInteger(chargeCents) || chargeCents < 0) throw new Error("Enter a valid charge amount.");
  return chargeCents === 0 ? 0 : Math.round(chargeCents * TICKET_PROCESSING_ESTIMATE.basisPoints / 10000) + TICKET_PROCESSING_ESTIMATE.fixedCents;
}

export function projectTicketRevenue(value: TicketTypeDraft[], ticketsPerOrder = 1) {
  if (!Number.isInteger(ticketsPerOrder) || ticketsPerOrder < 1 || ticketsPerOrder > 8) throw new Error("Choose between 1 and 8 tickets per order.");
  const { types } = parseTicketTypes({ ticketTypes: value, ticketPrice: "", capacity: "" });
  const rows = types.map(type => {
    const fullOrders = Math.floor(type.capacity / ticketsPerOrder), remainder = type.capacity % ticketsPerOrder;
    const full = ticketPrice(type.priceCents, ticketsPerOrder);
    const last = remainder ? ticketPrice(type.priceCents, remainder) : null;
    const ticketSalesCents = type.priceCents * type.capacity;
    const hubRevenueCents = full.feeCents * fullOrders + (last?.feeCents ?? 0);
    const processingCents = estimatedCardFee(full.totalCents) * fullOrders + (last ? estimatedCardFee(last.totalCents) : 0);
    return {
      ...type, ticketSalesCents, hubRevenueCents, processingCents,
      buyerCollectionsCents: ticketSalesCents + hubRevenueCents,
      organizerProceedsCents: ticketSalesCents - processingCents,
      paidOrders: type.priceCents === 0 ? 0 : fullOrders + (remainder ? 1 : 0),
    };
  });
  const totals = rows.reduce((sum, row) => ({
    tickets: sum.tickets + row.capacity,
    paidTickets: sum.paidTickets + (row.priceCents > 0 ? row.capacity : 0),
    freeTickets: sum.freeTickets + (row.priceCents === 0 ? row.capacity : 0),
    paidOrders: sum.paidOrders + row.paidOrders,
    ticketSalesCents: sum.ticketSalesCents + row.ticketSalesCents,
    hubRevenueCents: sum.hubRevenueCents + row.hubRevenueCents,
    processingCents: sum.processingCents + row.processingCents,
    buyerCollectionsCents: sum.buyerCollectionsCents + row.buyerCollectionsCents,
    organizerProceedsCents: sum.organizerProceedsCents + row.organizerProceedsCents,
  }), { tickets: 0, paidTickets: 0, freeTickets: 0, paidOrders: 0, ticketSalesCents: 0, hubRevenueCents: 0, processingCents: 0, buyerCollectionsCents: 0, organizerProceedsCents: 0 });
  return { rows, totals, ticketsPerOrder };
}
