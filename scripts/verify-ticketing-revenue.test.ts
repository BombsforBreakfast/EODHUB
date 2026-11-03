import { strict as assert } from "node:assert";
import { test } from "node:test";
import { estimatedCardFee, projectTicketRevenue } from "../app/lib/ticketing/revenue";

const ticket = (id: string, price: string, capacity: string) => ({ id, name: id, price, capacity });

test("sellout separates Hub revenue from processing without deducting Hub fees twice", () => {
  const { totals } = projectTicketRevenue([ticket("Competitor", "30", "100")]);
  assert.equal(totals.ticketSalesCents, 300000);
  assert.equal(totals.hubRevenueCents, 16000);
  assert.equal(totals.buyerCollectionsCents, 316000);
  assert.equal(totals.processingCents, 12200);
  assert.equal(totals.organizerProceedsCents, 287800);
  assert.equal(totals.paidOrders, 100);
  assert.equal(totals.buyerCollectionsCents, totals.hubRevenueCents + totals.processingCents + totals.organizerProceedsCents);
});

test("grouped orders change processor fixed fees while admission and Hub revenue stay the same", () => {
  const single = projectTicketRevenue([ticket("Competitor", "30", "100")], 1).totals;
  const paired = projectTicketRevenue([ticket("Competitor", "30", "100")], 2).totals;
  assert.equal(paired.paidOrders, 50);
  assert.equal(paired.processingCents, 10650);
  assert.equal(paired.organizerProceedsCents, 289350);
  assert.equal(paired.ticketSalesCents, single.ticketSalesCents);
  assert.equal(paired.hubRevenueCents, single.hubRevenueCents);
  assert.equal(paired.buyerCollectionsCents, single.buyerCollectionsCents);
});

test("a partial final order uses its actual charge and one processor fixed fee", () => {
  const { totals } = projectTicketRevenue([ticket("Adult", "10", "7")], 3);
  assert.equal(totals.paidOrders, 3);
  assert.equal(totals.ticketSalesCents, 7000);
  assert.equal(totals.hubRevenueCents, 840);
  assert.equal(totals.processingCents, 316);
  assert.equal(totals.organizerProceedsCents, 6684);
});

test("mixed ticket prices use each type's quantity and free tickets add no fees", () => {
  const { rows, totals } = projectTicketRevenue([ticket("Adult", "20", "10"), ticket("Child", "10", "5"), ticket("Spectator", "0", "7")]);
  assert.equal(totals.tickets, 22); assert.equal(totals.paidTickets, 15); assert.equal(totals.freeTickets, 7);
  assert.equal(totals.ticketSalesCents, 25000); assert.equal(totals.hubRevenueCents, 2000);
  assert.equal(totals.processingCents, 1230); assert.equal(totals.organizerProceedsCents, 23770);
  assert.equal(rows[2].paidOrders, 0); assert.equal(rows[2].processingCents, 0); assert.equal(rows[2].hubRevenueCents, 0);
});

test("all-free inventory has zero buyer collections, fees and organizer proceeds", () => {
  const { totals } = projectTicketRevenue([ticket("Free", "0", "100")], 8);
  assert.equal(totals.freeTickets, 100); assert.equal(totals.paidOrders, 0);
  for (const amount of [totals.ticketSalesCents, totals.hubRevenueCents, totals.processingCents, totals.buyerCollectionsCents, totals.organizerProceedsCents]) assert.equal(amount, 0);
});

test("incomplete or invalid types cannot produce misleading full-event totals", () => {
  for (const row of [ticket("Adult", "", "10"), ticket("Adult", "10", ""), ticket("Adult", "10", "1.5")]) assert.throws(() => projectTicketRevenue([row]));
  for (const group of [0, 9, 1.5]) assert.throws(() => projectTicketRevenue([ticket("Adult", "10", "10")], group));
  assert.throws(() => estimatedCardFee(-1)); assert.throws(() => estimatedCardFee(1.5));
});

test("a loss at very low prices remains visible and charge rounding happens per order", () => {
  const { totals } = projectTicketRevenue([ticket("Small", "0.01", "1")]);
  assert.equal(totals.buyerCollectionsCents, 101); assert.equal(totals.processingCents, 33);
  assert.equal(totals.organizerProceedsCents, -32);
  assert.equal(estimatedCardFee(3160), 122); assert.equal(estimatedCardFee(0), 0);
});

test("maximum supported inventory keeps all money totals as safe integer cents", () => {
  const { totals } = projectTicketRevenue([ticket("Maximum", "10000", "100000")], 8);
  assert.equal(totals.ticketSalesCents, 100000000000);
  for (const amount of [totals.hubRevenueCents, totals.processingCents, totals.buyerCollectionsCents, totals.organizerProceedsCents]) assert(Number.isSafeInteger(amount));
  assert.equal(totals.buyerCollectionsCents, totals.hubRevenueCents + totals.processingCents + totals.organizerProceedsCents);
});
