import type { PilotEvent, PilotTicketType } from "./model";
import { ticketPrice } from "./model";
import { ticketingOrigin, uuidPattern } from "./access";

export function noCardPilotAllowed(env: NodeJS.ProcessEnv = process.env) {
  return env.TICKETING_NO_CARD_PILOT_ENABLED === "1" && ticketingOrigin(env) !== null;
}

export type PilotCheckoutEvent = Pick<PilotEvent, "id" | "title" | "description" | "location" | "startsAt" | "endsAt" | "timeZone"> & {
  ticketTypes: (PilotTicketType & { remaining: number })[];
};
export type PilotOrder = {
  id: string; requestId: string; eventId: string; event: PilotCheckoutEvent; ticketType: string; quantity: number;
  regularSubtotalCents: number; regularHubFeeCents: number; amountCollectedCents: 0; hubFeeCents: 0; processingFeeCents: 0;
  mode: "no_card_pilot"; createdAt: string;
  tickets: { id: string; qr: string; manualCode: string }[];
};
export type PilotTicketPage = { events: PilotCheckoutEvent[]; orders: PilotOrder[]; next: string | null };

export function pilotTicketQuote(priceCents: number, quantity: number) {
  const regular = ticketPrice(priceCents, quantity);
  return { regularSubtotalCents: regular.baseCents, regularHubFeeCents: regular.feeCents,
    amountCollectedCents: 0, hubFeeCents: 0, processingFeeCents: 0, mode: "no_card_pilot" as const };
}

export function parsePilotCheckout(body: Record<string, unknown>) {
  if (typeof body.eventId !== "string" || !uuidPattern.test(body.eventId)
    || typeof body.requestId !== "string" || !uuidPattern.test(body.requestId)
    || typeof body.ticketTypeId !== "string" || body.ticketTypeId.length < 1 || body.ticketTypeId.length > 100
    || !Number.isInteger(body.quantity) || Number(body.quantity) < 1 || Number(body.quantity) > 8) throw new Error("Choose a ticket type and between 1 and 8 tickets.");
  return { eventId: body.eventId, requestId: body.requestId, ticketTypeId: body.ticketTypeId, quantity: Number(body.quantity) };
}

export function pilotQrValue(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error("Invalid pilot ticket.");
  return `EODHUB-PILOT:1:${token}`;
}
