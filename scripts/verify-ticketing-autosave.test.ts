import { strict as assert } from "node:assert";
import { test, beforeEach } from "node:test";
import { createEventEditor, createSerialAutosave, openEventEditor, readEditorRecovery, type EditorRecovery } from "../app/lib/ticketing/editor-autosave";
import { emptyEventDraft, parseTicketTypes, wizardStepComplete, type CoordinatorProfile, type EventDraft } from "../app/lib/ticketing/event-intake";

const userId = "11111111-1111-4111-8111-111111111111", draftId = "22222222-2222-4222-8222-222222222222";
const profile: CoordinatorProfile = { name: "QA Organizer", email: "qa@example.invalid", phone: "555-555-1234", organization: "QA Events", affiliation: "None", affiliationDetails: "" };
let storage: Map<string, string>;
beforeEach(() => {
  storage = new Map();
  Object.defineProperty(globalThis, "window", { configurable: true, value: { sessionStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) } } });
});
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

test("ticket types support legacy admission, independent prices, free tickets and six total types", () => {
  const legacy = parseTicketTypes({ ...emptyEventDraft(), ticketPrice: "0", capacity: "25" });
  assert.equal(legacy.types[0].name, "General admission"); assert.equal(legacy.priceCents, 0);
  const ticketTypes = Array.from({ length: 6 }, (_, index) => ({ id: `type-${index}`, name: `Type ${index}`, price: index ? "10.00" : "0", capacity: "5" }));
  const parsed = parseTicketTypes({ ...emptyEventDraft(), ticketTypes });
  assert.equal(parsed.capacity, 30); assert.equal(parsed.priceCents, 0); assert.equal(parsed.types.length, 6);
  assert.throws(() => parseTicketTypes({ ...emptyEventDraft(), ticketTypes: [...ticketTypes, { ...ticketTypes[0], id: "extra" }] }), /1 and 6/);
  assert.throws(() => parseTicketTypes({ ...emptyEventDraft(), ticketTypes: [] }), /1 and 6/);
  assert.throws(() => parseTicketTypes({ ...emptyEventDraft(), ticketTypes: [{ ...ticketTypes[0], name: "" }] }), /ticket type name/);
  assert.throws(() => parseTicketTypes({ ...emptyEventDraft(), ticketTypes: [ticketTypes[0], { ...ticketTypes[1], name: ticketTypes[0].name }] }), /different name/);
  assert.throws(() => parseTicketTypes({ ...emptyEventDraft(), ticketTypes: [{ ...ticketTypes[0], capacity: "0" }] }), /available tickets/);
});

test("navigation completion reflects required sections while an empty flyer stays optional", () => {
  const draft = emptyEventDraft();
  assert(wizardStepComplete(0, draft, profile, profile.email));
  assert(!wizardStepComplete(1, draft, profile, profile.email));
  assert(!wizardStepComplete(2, draft, profile, profile.email));
  assert(wizardStepComplete(3, draft, profile, profile.email));
  assert(wizardStepComplete(4, draft, profile, profile.email));
  assert(!wizardStepComplete(4, { ...draft, ticketTypes: [{ id: "adult", name: "Adult", price: "", capacity: "" }] }, profile, profile.email));
});

test("serial autosave coalesces edits and never has two writes in flight", async () => {
  const gate = deferred(), started = deferred(), saved: number[] = [];
  let active = 0, peak = 0;
  const saver = createSerialAutosave<number>(async snapshot => {
    active++; peak = Math.max(peak, active);
    if (snapshot === 1) { started.resolve(); await gate.promise; }
    saved.push(snapshot); active--;
  }, () => undefined, 0, 0);
  const writing = saver.flush(1);
  await started.promise;
  saver.schedule(2); saver.schedule(3);
  gate.resolve(); await writing;
  assert.deepEqual(saved, [1, 3]); assert.equal(peak, 1);
  saver.stop();
});

test("a failed save retains the newest snapshot and retries only when flushed", async () => {
  let fail = true;
  const saved: number[] = [];
  const saver = createSerialAutosave<number>(async snapshot => { if (fail) throw new Error("Offline"); saved.push(snapshot); }, () => undefined, 0, 0);
  await assert.rejects(saver.flush(1), /Offline/);
  saver.schedule(2); saver.schedule(3);
  assert.deepEqual(saved, []);
  fail = false; await saver.flush(); assert.deepEqual(saved, [3]);
  saver.stop();
});

test("a status subscriber flushing synchronously cannot start a second writer", async () => {
  const saved: number[] = [];
  let once = true, active = 0, peak = 0;
  const saver = createSerialAutosave<number>(async snapshot => { active++; peak = Math.max(peak, active); await Promise.resolve(); saved.push(snapshot); active--; }, status => {
    if (status === "saving" && once) { once = false; void saver.flush(2); }
  }, 0, 0);
  await saver.flush(1);
  assert.deepEqual(saved, [1, 2]); assert.equal(peak, 1); saver.stop();
});

test("remounting an open editor keeps the same queue and acknowledged revision", async () => {
  let revision = 0;
  const options = { userId, email: profile.email, draftId, profile, post: async <Result,>() => ({ id: draftId, revision: ++revision } as Result), onProfileSaved: () => undefined };
  const first = openEventEditor(options);
  first.changeDraft({ ...first.getSnapshot().draft, title: "Survives remount" }); await first.flush();
  const remounted = openEventEditor({ ...options, head: { id: draftId, revision: 0 } });
  assert.equal(remounted, first); assert.equal(remounted.getSnapshot().head?.revision, 1);
  remounted.changeDraft({ ...remounted.getSnapshot().draft, title: "Next edit" }); await remounted.flush();
  assert.equal(remounted.getSnapshot().head?.revision, 2); remounted.close();
  const fresh = openEventEditor(options); assert.notEqual(fresh, first); fresh.discard();
});

test("returning to an unedited event uses a newer server version", async () => {
  const options = { userId, email: profile.email, draftId, profile, serverDraft: { ...emptyEventDraft(), title: "Old title" }, head: { id: draftId, revision: 1 }, post: async <Result,>() => ({ id: draftId, revision: 3 } as Result), onProfileSaved: () => undefined };
  const first = openEventEditor(options); first.resume();
  const returned = openEventEditor({ ...options, serverDraft: { ...options.serverDraft, title: "New server title" }, head: { id: draftId, revision: 2 } });
  assert.notEqual(returned, first); assert.equal(returned.getSnapshot().draft.title, "New server title");
  assert(!returned.getSnapshot().conflict); returned.close();
});

test("opening an existing submitted event makes no autosave or profile write", async () => {
  const editor = createEventEditor({ userId, email: profile.email, draftId, profile, serverDraft: { ...emptyEventDraft(), title: "Approved event", wizardStep: 5 }, head: { id: draftId, revision: 4 }, post: async () => { throw new Error("Unexpected write"); }, onProfileSaved: () => undefined });
  editor.resume(); await editor.flush();
  assert.equal(editor.getSnapshot().head?.revision, 4);
  editor.close();
});

test("a new event starts with the saved organizer and autosaves under one stable ID", async () => {
  const requests: Record<string, unknown>[] = [];
  let revision = 0;
  const editor = createEventEditor({ userId, email: profile.email, draftId, profile, post: async <Result,>(body: Record<string, unknown>) => { requests.push(body); return { id: draftId, revision: ++revision } as Result; }, onProfileSaved: () => undefined });
  assert.equal(editor.getSnapshot().personal.name, profile.name);
  assert.equal(editor.getSnapshot().draft.organizer, profile.organization);
  assert.equal(editor.getSnapshot().draft.wizardStep, 1);
  editor.changeDraft({ ...editor.getSnapshot().draft, title: "My event" }); await editor.flush();
  editor.changeDraft({ ...editor.getSnapshot().draft, wizardStep: 4, ticketTypes: [{ id: "adult", name: "Adult", price: "15", capacity: "40" }] }); await editor.flush();
  assert.equal(requests[0].draftId, draftId); assert.equal(requests[1].eventId, draftId); assert.equal(requests[1].expectedRevision, 1);
  assert(requests.every(row => row.action === "save-draft" && row.editorUserId === userId));
  const recovery = readEditorRecovery(userId)!;
  assert.equal(recovery.draft.wizardStep, 4); assert.equal(recovery.draft.ticketTypes?.[0].name, "Adult"); assert.equal(recovery.head?.revision, 2);
  assert(!recovery.eventDirty);
  editor.close();
});

test("incomplete personal edits save independently without creating an empty event", async () => {
  const requests: Record<string, unknown>[] = [];
  const editor = createEventEditor({ userId, email: profile.email, draftId, profile: null, post: async <Result,>(body: Record<string, unknown>) => { requests.push(body); return { profile: null, profileDraft: body } as Result; }, onProfileSaved: () => undefined });
  editor.changePersonal({ ...editor.getSnapshot().personal, name: "Partial organizer" }); await editor.flush();
  assert.equal(requests.length, 1); assert.equal(requests[0].action, "save-profile-draft"); assert.equal(requests[0].editorUserId, userId);
  assert.equal(editor.getSnapshot().head, null);
  assert.equal(readEditorRecovery(userId)?.personal.name, "Partial organizer");
  editor.close();
});

test("lost acknowledgments recover their revision while keeping edits made during the request", async () => {
  const gate = deferred(), started = deferred();
  let committed: EventDraft | undefined;
  const first = createEventEditor({ userId, email: profile.email, draftId, profile, post: async (body: Record<string, unknown>) => {
    committed = { ...(body.draft as EventDraft), _autosaveId: String(body.writeId) };
    started.resolve();
    await gate.promise; throw new Error("Connection closed before acknowledgment");
  }, onProfileSaved: () => undefined });
  first.changeDraft({ ...first.getSnapshot().draft, title: "First edit" });
  const attempt = first.flush();
  await started.promise;
  first.changeDraft({ ...first.getSnapshot().draft, title: "Newer local edit" });
  gate.resolve(); await assert.rejects(attempt, /Connection closed/);
  const recovery = readEditorRecovery(userId)!;
  assert(recovery.pendingWriteId); first.close();
  const requests: Record<string, unknown>[] = [];
  const restored = createEventEditor({ userId, email: profile.email, draftId, profile, recovery, serverDraft: committed, head: { id: draftId, revision: 1 }, post: async <Result,>(body: Record<string, unknown>) => { requests.push(body); return { id: draftId, revision: 2 } as Result; }, onProfileSaved: () => undefined });
  assert(!restored.getSnapshot().conflict);
  assert.equal(restored.getSnapshot().draft.title, "Newer local edit");
  await restored.flush(); assert.equal(requests[0].expectedRevision, 1);
  assert.equal(restored.getSnapshot().head?.revision, 2); restored.close();
});

test("a different writer's newer revision blocks autosave and preserves local entries", async () => {
  const recovery: EditorRecovery = { version: 1, userId, draftId, profileOnly: false, open: true, updatedAt: Date.now(), draft: { ...emptyEventDraft(), title: "Unsynced local title" }, personal: profile, head: { id: draftId, revision: 1 }, eventDirty: true, profileDirty: false, hasEvent: true, pendingWriteId: null, pendingSignature: null };
  let writes = 0;
  const editor = createEventEditor({ userId, email: profile.email, draftId, profile, recovery, serverDraft: { ...emptyEventDraft(), title: "Other device title" }, head: { id: draftId, revision: 2 }, post: async () => { writes++; throw new Error("Unexpected write"); }, onProfileSaved: () => undefined });
  await assert.rejects(editor.flush(), /newer version/);
  assert.equal(writes, 0); assert.equal(editor.getSnapshot().draft.title, "Unsynced local title");
  editor.discard();
});

test("recovery is scoped to the authenticated user and expires after a day", async () => {
  const editor = createEventEditor({ userId, email: profile.email, draftId, profile, post: async <Result,>() => ({ id: draftId, revision: 1 } as Result), onProfileSaved: () => undefined });
  editor.changeDraft({ ...editor.getSnapshot().draft, title: "Private draft" }); await editor.flush();
  const copy = readEditorRecovery(userId)!;
  assert.equal(readEditorRecovery("33333333-3333-4333-8333-333333333333"), null);
  assert.equal(readEditorRecovery(userId, undefined, copy.updatedAt + 86400001), null);
  editor.close();
});
