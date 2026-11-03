import { cleanCoordinatorDraft, cleanTicketTypeDrafts, draftTicketTypes, emptyEventDraft, normalizeHostWebsite, type CoordinatorDraft, type CoordinatorProfile, type EventDraft } from "./event-intake";

export type DraftHead = { id: string; revision: number };
export type EditorRecovery = {
  version: 1; userId: string; draftId: string; profileOnly: boolean; open: boolean; updatedAt: number;
  draft: EventDraft; personal: CoordinatorDraft; head: DraftHead | null;
  eventDirty: boolean; profileDirty: boolean; hasEvent: boolean; pendingWriteId: string | null; pendingSignature: string | null;
  instanceId?: string;
};
export type SaveStatus = "saved" | "waiting" | "saving" | "error";
export type EditorView = EditorRecovery & { status: SaveStatus; saveError: string; conflict: boolean };
type Post = <Result = unknown>(body: Record<string, unknown>) => Promise<Result>;
type ProfileState = { profile: CoordinatorProfile | null; profileDraft: CoordinatorDraft | null };
const cacheKey = (userId: string) => `ticketing-editor-v1:${userId}`;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DAY = 86400000;

export function prepareEditorDraft(value?: Partial<EventDraft>): EventDraft {
  const draft = { ...emptyEventDraft(), ...value };
  for (const key of Object.keys(emptyEventDraft()) as (keyof EventDraft)[]) {
    if (key !== "wizardStep" && typeof draft[key] !== "string") throw new Error("Invalid draft recovery data.");
  }
  draft.wizardStep = Number.isInteger(draft.wizardStep) ? Math.max(0, Math.min(5, draft.wizardStep)) : 0;
  draft.ticketTypes = cleanTicketTypeDrafts(draftTicketTypes(draft));
  return draft;
}

export function readEditorRecovery(userId: string, storage?: Pick<Storage, "getItem">, now = Date.now()): EditorRecovery | null {
  try {
    const raw = (storage ?? window.sessionStorage).getItem(cacheKey(userId));
    if (!raw) return null;
    const value = JSON.parse(raw) as EditorRecovery;
    if (value.version !== 1 || value.userId !== userId || !uuid.test(value.draftId) || typeof value.open !== "boolean" || typeof value.profileOnly !== "boolean" || !Number.isFinite(value.updatedAt) || now - value.updatedAt > DAY || value.updatedAt > now + 60000) return null;
    if (value.head && (!uuid.test(value.head.id) || value.head.id !== value.draftId || !Number.isInteger(value.head.revision) || value.head.revision < 1)) return null;
    if (!value.personal || typeof value.personal.email !== "string") return null;
    if (![value.eventDirty, value.profileDirty, value.hasEvent].every(flag => typeof flag === "boolean") || (value.pendingWriteId !== null && !uuid.test(value.pendingWriteId))) return null;
    if (value.pendingSignature !== null && typeof value.pendingSignature !== "string") return null;
    value.personal = cleanCoordinatorDraft(value.personal, value.personal.email);
    value.draft = prepareEditorDraft(value.draft);
    return value;
  } catch { return null; }
}

export function clearEditorRecovery(userId: string) {
  try { window.sessionStorage.removeItem(cacheKey(userId)); } catch { /* Server saves remain available when storage is blocked. */ }
}

const draftSignature = (draft: EventDraft) => {
  const copy = { ...prepareEditorDraft(draft), hostUrl: normalizeHostWebsite(draft.hostUrl) };
  delete copy._autosaveId;
  return JSON.stringify(copy);
};
const profileSignature = (personal: CoordinatorDraft) => JSON.stringify(cleanCoordinatorDraft(personal, personal.email));

/** One writer, newest queued snapshot, and a pause after failure. A flush wakes
 * the timer for page changes; revisions are read only when the write begins. */
export function createSerialAutosave<Snapshot>(write: (snapshot: Snapshot) => Promise<void>, onStatus: (status: SaveStatus, error?: Error) => void, debounce = 750, interval = 3000) {
  let latest: Snapshot | undefined, running: Promise<void> | null = null, blocked = false, forced = false, stopped = false;
  let editedAt = 0, startedAt = 0, wake: (() => void) | null = null;
  const wait = (ms: number) => new Promise<void>(resolve => {
    const timer = setTimeout(() => { wake = null; resolve(); }, ms);
    wake = () => { clearTimeout(timer); wake = null; resolve(); };
  });
  const start = (): Promise<void> => {
    if (running) return running;
    if (stopped || blocked || latest === undefined) return Promise.resolve();
    // Claim the writer before publishing status: a subscriber can synchronously
    // flush during a remount, and must receive this same in-flight promise.
    const task = Promise.resolve().then(async () => {
      while (latest !== undefined && !stopped) {
        while (!forced && !stopped) {
          const delay = Math.max(editedAt + debounce, startedAt + interval) - Date.now();
          if (delay <= 0) break;
          await wait(delay);
        }
        if (stopped) return;
        const snapshot = latest;
        latest = undefined; startedAt = Date.now(); onStatus("saving");
        try { await write(snapshot); }
        catch (failure) {
          if (latest === undefined) latest = snapshot;
          blocked = true;
          const error = failure instanceof Error ? failure : new Error("Could not save your changes.");
          onStatus("error", error); throw error;
        }
      }
      if (!stopped) onStatus("saved");
    });
    running = task;
    const finish = () => { if (running === task) running = null; };
    void task.then(finish, finish);
    return task;
  };
  return {
    schedule(snapshot: Snapshot) {
      if (stopped) return;
      latest = snapshot; editedAt = Date.now();
      if (!blocked) { onStatus("waiting"); void start().catch(() => undefined); }
    },
    async flush(snapshot?: Snapshot) {
      if (stopped) return;
      if (snapshot !== undefined) latest = snapshot;
      blocked = false; forced = true; wake?.();
      try { await start(); } finally { forced = false; }
    },
    stop() { stopped = true; latest = undefined; wake?.(); },
  };
}

export function createEventEditor(options: {
  userId: string; email: string; draftId: string; profileOnly?: boolean;
  profile: CoordinatorProfile | null; profileDraft?: CoordinatorDraft | null;
  serverDraft?: EventDraft; head?: DraftHead; recovery?: EditorRecovery | null;
  post: Post; onProfileSaved: (state: ProfileState) => void;
}) {
  const { recovery, serverDraft, head } = options;
  const personal = cleanCoordinatorDraft(options.profileDraft ?? options.profile ?? {}, options.email);
  const server = prepareEditorDraft(serverDraft);
  const sameRecord = recovery?.draftId === options.draftId && recovery.userId === options.userId;
  const useRecovery = sameRecord ? recovery : null;
  const pendingAcknowledged = !!(useRecovery?.pendingWriteId && serverDraft?._autosaveId === useRecovery.pendingWriteId);
  const conflict = !!(useRecovery?.eventDirty && head && head.revision !== (useRecovery.head?.revision ?? 0) && !pendingAcknowledged);
  const initialDraft = useRecovery && (useRecovery.eventDirty || !serverDraft) ? prepareEditorDraft(useRecovery.draft) : server;
  const initialPersonal = useRecovery?.profileDirty ? cleanCoordinatorDraft(useRecovery.personal, options.email) : personal;
  if (!serverDraft && !useRecovery && !options.profileOnly) {
    initialDraft.organizer = options.profile?.organization ?? "";
    initialDraft.wizardStep = options.profile && !options.profileDraft ? 1 : 0;
  }
  let state: EditorView = {
    version: 1, userId: options.userId, draftId: options.draftId, profileOnly: !!options.profileOnly, open: true, updatedAt: Date.now(),
    draft: initialDraft, personal: initialPersonal, head: head ?? useRecovery?.head ?? null,
    eventDirty: !!useRecovery?.eventDirty, profileDirty: !!useRecovery?.profileDirty,
    hasEvent: !!head || !!useRecovery?.hasEvent, pendingWriteId: pendingAcknowledged ? null : useRecovery?.pendingWriteId ?? null,
    pendingSignature: pendingAcknowledged ? null : useRecovery?.pendingSignature ?? null,
    instanceId: crypto.randomUUID(),
    status: conflict ? "error" : "saved", saveError: conflict ? "A newer version was saved in another tab. Your local edits are kept in this browser. Load the saved version before continuing." : "", conflict,
  };
  let lastDraft = serverDraft ? draftSignature(server) : "", lastProfile = profileSignature(personal);
  let stopped = false;
  let post = options.post, profileSaved = options.onProfileSaved;
  let pending: { id: string; signature: string } | null = state.pendingWriteId && state.pendingSignature === draftSignature(initialDraft) ? { id: state.pendingWriteId, signature: state.pendingSignature } : null;
  const listeners = new Set<() => void>();
  const publish = () => { for (const listener of listeners) listener(); };
  const cache = () => {
    try { window.sessionStorage.setItem(cacheKey(state.userId), JSON.stringify(state)); } catch { /* Keep saving to the server when browser recovery storage is unavailable. */ }
  };
  const update = (patch: Partial<EditorView>, persist = true) => {
    state = { ...state, ...patch, updatedAt: Date.now() };
    if (persist) {
      // An old editor finishing after unmount must not replace a newly opened event.
      const active = readEditorRecovery(state.userId);
      if (!active || active.instanceId === state.instanceId) cache();
    }
    publish();
  };
  const queue = createSerialAutosave<EditorView>(async snapshot => {
    if (state.conflict) throw new Error(state.saveError);
    const personalKey = profileSignature(snapshot.personal);
    if (snapshot.profileDirty && personalKey !== lastProfile) {
      const result = await post<ProfileState>({ action: "save-profile-draft", editorUserId: options.userId, ...snapshot.personal });
      lastProfile = personalKey;
      update({ profileDirty: profileSignature(state.personal) !== personalKey });
      profileSaved(result);
    } else if (snapshot.profileDirty && personalKey === lastProfile) update({ profileDirty: profileSignature(state.personal) !== personalKey });
    if (!snapshot.profileOnly && snapshot.hasEvent) {
      const signature = draftSignature(snapshot.draft);
      if (signature !== lastDraft) {
        if (!pending || pending.signature !== signature) pending = { id: crypto.randomUUID(), signature };
        update({ pendingWriteId: pending.id, pendingSignature: signature });
        const result = await post<DraftHead>({ action: "save-draft", editorUserId: options.userId, ...(state.head ? { eventId: state.head.id, expectedRevision: state.head.revision } : { draftId: state.draftId }), writeId: pending.id, draft: { ...snapshot.draft, hostUrl: normalizeHostWebsite(snapshot.draft.hostUrl) } });
        lastDraft = signature; pending = null;
        update({ head: result, pendingWriteId: null, pendingSignature: null, eventDirty: draftSignature(state.draft) !== signature });
      } else update({ eventDirty: draftSignature(state.draft) !== signature });
    }
  }, (status, error) => {
    const conflict = state.conflict || (error as (Error & { status?: number }) | undefined)?.status === 409;
    update({ status: conflict ? "error" : status, saveError: error?.message ?? (conflict ? state.saveError : ""), conflict });
  });
  const edit = (patch: Partial<EditorView>) => {
    if (stopped) return;
    update(patch, false); cache(); queue.schedule(state);
  };
  return {
    getSnapshot: () => state,
    isStopped: () => stopped,
    reconnect(next: Pick<typeof options, "post" | "onProfileSaved">) { post = next.post; profileSaved = next.onProfileSaved; },
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    changeDraft(draft: EventDraft) { edit({ draft, eventDirty: true, hasEvent: true }); },
    changePersonal(next: CoordinatorDraft) { edit({ personal: next, profileDirty: true }); },
    resume() { cache(); if (state.eventDirty || state.profileDirty) queue.schedule(state); },
    flush: () => queue.flush(state),
    close() { update({ open: false }); stopped = true; queue.stop(); },
    finish() { stopped = true; queue.stop(); clearEditorRecovery(state.userId); },
    discard() { stopped = true; queue.stop(); clearEditorRecovery(state.userId); },
  };
}

// Remounting the same editor must keep its current revision and queued writes.
// Closed editors are removed; another signed-in user never shares this entry.
const openEditors = new Map<string, ReturnType<typeof createEventEditor>>();
export function openEventEditor(options: Parameters<typeof createEventEditor>[0]) {
  const key = `${options.userId}:${options.draftId}`;
  const previous = openEditors.get(key);
  if (previous && !previous.isStopped()) {
    const current = previous.getSnapshot();
    const newerServer = options.head && options.head.revision > (current.head?.revision ?? 0);
    const ownPendingWrite = current.pendingWriteId && current.pendingWriteId === options.serverDraft?._autosaveId;
    if (!newerServer || ownPendingWrite) { previous.reconnect(options); return previous; }
    // Returning from another route may reveal a newer server revision. Preserve
    // unsynced local data, then let normal recovery detect a genuine conflict.
    options = { ...options, recovery: current }; previous.close();
  }
  const editor = createEventEditor(options);
  const wrapped = { ...editor,
    close() { editor.close(); openEditors.delete(key); },
    finish() { editor.finish(); openEditors.delete(key); },
    discard() { editor.discard(); openEditors.delete(key); },
  };
  openEditors.set(key, wrapped);
  return wrapped;
}
export function releaseEventEditors(userId: string) {
  for (const key of openEditors.keys()) if (key.startsWith(`${userId}:`)) openEditors.delete(key);
}
