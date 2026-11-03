import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createTicketingEntryLoader, ticketingEntryDestination } from "../app/lib/ticketing/entry.client";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

test("effect replay shares verification and loads only after the cookie is set", async () => {
  const gate = deferred(), steps: string[] = [];
  const entry = createTicketingEntryLoader(async token => { steps.push(token); await gate.promise; steps.push("cookie"); }, async () => { steps.push("workspace"); return { id: "coordinator-a" }; });
  const first = entry("single-use-link");
  assert.equal(entry(), first);
  assert.equal(entry("single-use-link"), first);
  assert.deepEqual(steps, ["single-use-link"]);
  gate.resolve();
  assert.deepEqual(await first, { workspace: { id: "coordinator-a" }, verifiedLink: true });
  assert.deepEqual(steps, ["single-use-link", "cookie", "workspace"]);
});

test("a second email link waits so an older response cannot replace its session", async () => {
  const gate = deferred(), steps: string[] = [];
  let cookie = "signed-out";
  const entry = createTicketingEntryLoader(async token => {
    steps.push(`verify:${token}`);
    if (token === "first") await gate.promise;
    cookie = token;
  }, async () => { steps.push(`load:${cookie}`); return cookie; });
  const first = entry("first"), second = entry("second");
  assert.deepEqual(steps, ["verify:first"]);
  assert.equal(entry(), second);
  gate.resolve();
  assert.equal((await first).workspace, "first");
  assert.equal((await second).workspace, "second");
  assert.equal(cookie, "second");
  assert.deepEqual(steps, ["verify:first", "load:first", "verify:second", "load:second"]);
});

test("failed verification never loads an existing workspace and a new link can recover", async () => {
  let loads = 0;
  const entry = createTicketingEntryLoader(async token => { if (token === "expired") throw new Error("Request a fresh link"); }, async () => { loads++; return "assigned"; });
  await assert.rejects(entry("expired"), /fresh link/);
  assert.equal(loads, 0);
  assert.equal((await entry("fresh")).workspace, "assigned");
  assert.equal(loads, 1);
});

test("completed verification is not cached across sign-out or consumed-link replay", async () => {
  let verified = false, workspace: string | null = "assigned";
  const entry = createTicketingEntryLoader(async () => { if (verified) throw new Error("Already used"); verified = true; }, async () => workspace);
  await entry("one-use");
  workspace = null;
  assert.deepEqual(await entry(), { workspace: null, verifiedLink: false });
  await assert.rejects(entry("one-use"), /Already used/);
});

test("a failed first link does not block the next in-flight link", async () => {
  const entry = createTicketingEntryLoader(async token => { if (token === "invalid") throw new Error("Invalid link"); }, async () => "workspace");
  const invalid = entry("invalid"), fresh = entry("fresh");
  await assert.rejects(invalid, /Invalid link/);
  assert.equal((await fresh).workspace, "workspace");
});

test("entry destination follows server-returned capabilities without granting access", () => {
  const actor = { admin: false, can_create: false };
  assert.equal(ticketingEntryDestination({ actor: { ...actor, admin: true }, events: [] }), "/ticketing/admin");
  assert.equal(ticketingEntryDestination({ actor: { ...actor, can_create: true }, events: [] }), "/ticketing/workspace");
  assert.equal(ticketingEntryDestination({ actor, events: [{ can_manage: true }] }), "/ticketing/workspace");
  assert.equal(ticketingEntryDestination({ actor, events: [{ can_manage: false }] }), "/ticketing/scan");
  assert.equal(ticketingEntryDestination({ actor, events: [] }), "/ticketing/manage");
});
