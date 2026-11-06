import "server-only";
import { randomBytes } from "node:crypto";
import { eventTicketTypes, MANUAL_CODE_ALPHABET, type PilotEvent } from "./model";
import { parsePilotCheckout, type PilotCheckoutEvent, type PilotOrder } from "./pilot-checkout";
import { uuidPattern } from "./access";
import { checkTicketingDb, ticketingLimit, TicketingError, type TicketingActor } from "./server";

function checkoutFailure(error: { code?: string; message: string } | null) {
  if (error?.code === "PT409") throw new TicketingError("Ticket availability or pilot access changed. Refresh and check My tickets before retrying.", 409);
  if (error?.code === "22023") throw new TicketingError("Choose a valid ticket type and between 1 and 8 tickets.");
  if (error?.code === "P0002") throw new TicketingError("This pilot event is unavailable.", 404);
  checkTicketingDb(error);
}

export async function setNoCardPilot(actor: TicketingActor, body: Record<string, unknown>) {
  if (!actor.admin) throw new TicketingError("Only the Hub owner can change the no-card pilot switch.", 403);
  if (!uuidPattern.test(String(body.eventId)) || typeof body.enabled !== "boolean" || !Number.isInteger(body.expectedRevision) || Number(body.expectedRevision) < 1) throw new TicketingError("Reload the event before changing its pilot switch.");
  await ticketingLimit(actor.db, "pilot-mode", actor.user.id, 60, 600);
  const result = await actor.db.rpc("ticketing_set_no_card_pilot", { p_actor: actor.user.id, p_event: body.eventId, p_expected: body.expectedRevision, p_enabled: body.enabled });
  checkoutFailure(result.error);
  return { enabled: body.enabled, revision: result.data };
}

export function newPilotTicketIdentifiers() {
  return { qr: randomBytes(32).toString("base64url"), manual: [...randomBytes(8)].map(byte => MANUAL_CODE_ALPHABET[byte & 31]).join("") };
}

type OrderRow = {
  id: string; request_id: string; event_id: string; event_snapshot: PilotCheckoutEvent; ticket_type_name: string; quantity: number;
  regular_subtotal_cents: number; regular_hub_fee_cents: number; created_at: string;
  ticketing_pilot_tickets: { id: string; qr_token: string; manual_code: string }[];
};
const orderFields = "id,request_id,event_id,event_snapshot,ticket_type_name,quantity,regular_subtotal_cents,regular_hub_fee_cents,created_at,ticketing_pilot_tickets(id,qr_token,manual_code)";
const orderView = (row: OrderRow): PilotOrder => ({ id: row.id, requestId: row.request_id, eventId: row.event_id, event: row.event_snapshot,
  ticketType: row.ticket_type_name, quantity: row.quantity, regularSubtotalCents: row.regular_subtotal_cents, regularHubFeeCents: row.regular_hub_fee_cents,
  amountCollectedCents: 0, hubFeeCents: 0, processingFeeCents: 0, mode: "no_card_pilot", createdAt: row.created_at,
  tickets: row.ticketing_pilot_tickets.map(ticket => ({ id: ticket.id, qr: ticket.qr_token, manualCode: ticket.manual_code })),
});

export async function issuePilotOrder(actor: TicketingActor, body: Record<string, unknown>) {
  if (body.buyerUserId !== actor.user.id) throw new TicketingError("Your sign-in changed. Reopen ticketing before requesting tickets.", 403);
  let input; try { input = parsePilotCheckout(body); } catch (error) { throw new TicketingError((error as Error).message); }
  await ticketingLimit(actor.db, "pilot-claim", actor.user.id, 30, 600);
  let orderId: string | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await actor.db.rpc("ticketing_issue_pilot_order", { p_actor: actor.user.id, p_event: input.eventId,
      p_type: input.ticketTypeId, p_quantity: input.quantity, p_request: input.requestId,
      p_tickets: Array.from({ length: input.quantity }, newPilotTicketIdentifiers),
    });
    // A rare short manual-code collision rolls back the entire claim before retry.
    if (result.error?.code === "23505" && attempt < 2) continue;
    checkoutFailure(result.error); orderId = result.data; break;
  }
  if (!orderId) throw new TicketingError("Could not issue pilot tickets. Check My tickets before retrying.", 503);
  const result = await actor.db.from("ticketing_pilot_orders").select(orderFields).eq("id", orderId).eq("buyer_id", actor.user.id).single();
  checkTicketingDb(result.error);
  return orderView(result.data as unknown as OrderRow);
}

export async function pilotCatalog(actor: TicketingActor): Promise<PilotCheckoutEvent[]> {
  const result = await actor.db.from("ticketing_events").select("id,event").eq("review_status", "approved").eq("no_card_pilot_enabled", true).order("created_at", { ascending: false }).limit(100);
  checkTicketingDb(result.error);
  const events = (result.data ?? []).filter(row => Date.parse(row.event?.endsAt || row.event?.startsAt) > Date.now());
  if (!events.length) return [];
  const inventory = await actor.db.rpc("ticketing_pilot_inventory", { p_events: events.map(row => row.id) });
  checkTicketingDb(inventory.error);
  const counts = new Map<string, { counts: Record<string, number>; total: number }>((inventory.data ?? []).map((row: { event_id: string; counts: Record<string, number>; total: number }) => [row.event_id, row]));
  return events.map(row => {
    const event = row.event as PilotEvent;
    const issued = counts.get(row.id);
    return { id: row.id, title: event.title, description: event.description, location: event.location, startsAt: event.startsAt, endsAt: event.endsAt, timeZone: event.timeZone,
      ticketTypes: eventTicketTypes(event).map(type => ({ ...type, remaining: Math.max(0, Math.min(type.capacity - Number(issued?.counts[type.id] ?? 0), event.capacity - Number(issued?.total ?? 0))) })),
    };
  });
}

export async function pilotOrderPage(actor: TicketingActor, cursor: string | null) {
  let query = actor.db.from("ticketing_pilot_orders").select(orderFields).eq("buyer_id", actor.user.id).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(21);
  if (cursor) {
    let value: { at: string; id: string };
    try { value = JSON.parse(Buffer.from(cursor, "base64url").toString()); } catch { throw new TicketingError("Invalid ticket page."); }
    if (!value || typeof value !== "object" || !uuidPattern.test(value.id) || !/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|\+00:00)$/.test(value.at) || !Number.isFinite(Date.parse(value.at))) throw new TicketingError("Invalid ticket page.");
    query = query.or(`created_at.lt.${value.at},and(created_at.eq.${value.at},id.lt.${value.id})`);
  }
  const result = await query; checkTicketingDb(result.error);
  const rows = (result.data ?? []) as unknown as OrderRow[];
  const page = rows.slice(0, 20), last = page.at(-1);
  return { orders: page.map(orderView), next: rows.length > 20 && last ? Buffer.from(JSON.stringify({ at: last.created_at, id: last.id })).toString("base64url") : null };
}
