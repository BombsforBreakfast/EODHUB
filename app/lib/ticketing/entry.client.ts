/** Reuse an in-flight entry during React effect replay. Serialize a different
 * email link so two responses cannot race to replace the ticketing cookie. */
export function createTicketingEntryLoader<Workspace>(verify: (token: string) => Promise<unknown>, load: () => Promise<Workspace | null>) {
  type Result = { workspace: Workspace | null; verifiedLink: boolean };
  let pending: { token: string | null; promise: Promise<Result> } | null = null;
  return (value?: string | null) => {
    const token = value || null;
    if (pending && (!token || token === pending.token)) return pending.promise;
    const previous = pending?.promise;
    const promise = (async (): Promise<Result> => {
      if (previous) await previous.catch(() => undefined);
      if (token) await verify(token);
      return { workspace: await load(), verifiedLink: token !== null };
    })();
    const entry = { token, promise };
    pending = entry;
    const finish = () => { if (pending === entry) pending = null; };
    void promise.then(finish, finish);
    return promise;
  };
}

export function ticketingEntryDestination(workspace: { actor: { admin: boolean; can_create: boolean }; events: { can_manage: boolean }[] }) {
  if (workspace.actor.admin) return "/ticketing/admin";
  if (workspace.actor.can_create || workspace.events.some(event => event.can_manage)) return "/ticketing/workspace";
  if (workspace.events.length) return "/ticketing/scan";
  return "/ticketing/manage";
}
