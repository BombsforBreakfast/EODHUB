import { strict as assert } from "node:assert";
import { test } from "node:test";
import { noCardPilotAllowed, parsePilotCheckout, pilotQrValue, pilotTicketQuote } from "../app/lib/ticketing/pilot-checkout";
import { issuePilotOrder, newPilotTicketIdentifiers, pilotOrderPage, setNoCardPilot } from "../app/lib/ticketing/pilot-checkout-server";
import { TicketingError, type TicketingActor } from "../app/lib/ticketing/server";

const userId = "00000000-0000-4000-8000-000000000001";
const body = { eventId: "00000000-0000-4000-8000-000000000002", ticketTypeId: "general", quantity: 2, requestId: "00000000-0000-4000-8000-000000000003" };
test("no-card pilot needs its own server flag and can never run in production", () => {
  const env = { NODE_ENV: "development", TICKETING_PILOT_ENABLED: "1", TICKETING_PILOT_ORIGIN: "http://127.0.0.1:65465" } as NodeJS.ProcessEnv;
  assert.equal(noCardPilotAllowed(env), false);
  assert.equal(noCardPilotAllowed({ ...env, TICKETING_NO_CARD_PILOT_ENABLED: "1" }), true);
  assert.equal(noCardPilotAllowed({ ...env, TICKETING_NO_CARD_PILOT_ENABLED: "1", VERCEL_ENV: "production" }), false);
  assert.equal(noCardPilotAllowed({ ...env, NEXT_PUBLIC_TICKETING_NO_CARD_PILOT_ENABLED: "1" }), false);
});
test("normally paid tickets retain reference pricing while all actual pilot charges are zero", () => {
  assert.deepEqual(pilotTicketQuote(2500, 2), { regularSubtotalCents: 5000, regularHubFeeCents: 300, amountCollectedCents: 0, hubFeeCents: 0, processingFeeCents: 0, mode: "no_card_pilot" });
  assert.equal(pilotTicketQuote(0, 8).regularHubFeeCents, 0);
  assert.equal(pilotTicketQuote(1000000, 8).amountCollectedCents, 0);
});
test("checkout accepts only bounded quantities and stable request IDs, never client prices or fees", () => {
  assert.deepEqual(parsePilotCheckout({ ...body, priceCents: 1, hubFeeCents: -500, amountCollectedCents: 2000 }), body);
  for (const quantity of [0, 9, 1.5, "2", NaN]) assert.throws(() => parsePilotCheckout({ ...body, quantity }));
  assert.throws(() => parsePilotCheckout({ ...body, requestId: "not-stable" }));
  assert.throws(() => parsePilotCheckout({ ...body, eventId: "wrong" }));
});
test("only an owner actor can even reach the mode-setting RPC", async () => {
  const actor = { admin: false, db: { rpc() { assert.fail("must not call database"); } } } as unknown as TicketingActor;
  await assert.rejects(setNoCardPilot(actor, {}), (error: unknown) => error instanceof TicketingError && error.status === 403);
});
test("a sign-in change cannot issue tickets under a different buyer", async () => {
  const actor = { user: { id: userId }, db: { rpc() { assert.fail("must not call database"); } } } as unknown as TicketingActor;
  await assert.rejects(issuePilotOrder(actor, { ...body, buyerUserId: "another-user" }), (error: unknown) => error instanceof TicketingError && error.status === 403);
});
test("ticket retrieval always filters by the verified buyer, with bounded pagination", async () => {
  const filters: [string, unknown][] = [];
  let limit = 0;
  const query = {
    select() { return query; }, eq(key: string, value: unknown) { filters.push([key, value]); return query; },
    order() { return query; }, limit(value: number) { limit = value; return query; },
    then(resolve: (value: unknown) => void) { resolve({ data: [], error: null }); },
  };
  const actor = { user: { id: userId }, db: { from(name: string) { assert.equal(name, "ticketing_pilot_orders"); return query; } } } as unknown as TicketingActor;
  assert.deepEqual(await pilotOrderPage(actor, null), { orders: [], next: null });
  assert.deepEqual(filters, [["buyer_id", userId]]);
  assert.equal(limit, 21);
  await assert.rejects(pilotOrderPage(actor, Buffer.from("null").toString("base64url")), /Invalid ticket page/);
});
test("QR identifiers are cryptographically random, opaque and distinct from short manual codes", () => {
  const tickets = Array.from({ length: 300 }, newPilotTicketIdentifiers);
  assert.equal(new Set(tickets.map(ticket => ticket.qr)).size, tickets.length);
  assert.equal(new Set(tickets.map(ticket => ticket.manual)).size, tickets.length);
  for (const ticket of tickets) {
    assert.match(ticket.qr, /^[A-Za-z0-9_-]{43}$/);
    assert.match(ticket.manual, /^[2-9A-HJ-NP-Z]{8}$/);
    assert.equal(pilotQrValue(ticket.qr), `EODHUB-PILOT:1:${ticket.qr}`);
  }
  assert.throws(() => pilotQrValue("<unsafe>"));
});
