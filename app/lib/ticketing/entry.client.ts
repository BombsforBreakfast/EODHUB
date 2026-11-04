export {createEmailEntryLoader as createTicketingEntryLoader} from "../auth/emailEntry.client";

export function ticketingEntryDestination(workspace: { actor: { admin: boolean; can_create: boolean }; events: { can_manage: boolean }[] }) {
  if (workspace.actor.admin) return "/ticketing/admin";
  if (workspace.actor.can_create || workspace.events.some(event => event.can_manage)) return "/ticketing/workspace";
  if (workspace.events.length) return "/ticketing/scan";
  return "/ticketing/manage";
}
