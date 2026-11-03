export type TicketingRole = "platform_admin" | "coordinator" | "checkin_staff";
export type TicketingAction = "platform" | "manage_event" | "export" | "manage_staff" | "redeem";
export type PilotTicketType = { id: string; name: string; priceCents: number; capacity: number };

export type PilotEvent = {
  id: string;
  slug: string;
  title: string;
  category: "Fitness" | "Community";
  organizer: string;
  location: string;
  startsAt: string;
  endsAt?: string;
  timeZone: string;
  scheduleRevision: number;
  description: string;
  capacity: number;
  priceCents: number;
  ticketTypes?: PilotTicketType[];
  status: "listed" | "paused" | "draft";
  donationUrl?: string;
  flyerUrl?: string;
  venueAddress?: string;
  contact?: { name: string; phone: string; email: string };
  hostUrl?: string;
};

export function eventTicketTypes(event: Pick<PilotEvent, "ticketTypes" | "priceCents" | "capacity">): PilotTicketType[] {
  return event.ticketTypes?.length ? event.ticketTypes : [{ id: "general", name: "General admission", priceCents: event.priceCents, capacity: event.capacity }];
}

export function sortEventsChronologically<Event extends Pick<PilotEvent, "startsAt">>(events: readonly Event[]) {
  return [...events].sort((earlier, later) => Date.parse(earlier.startsAt) - Date.parse(later.startsAt));
}

export function isTicketingPath(path: string) {
  return path === "/ticketing" || path.startsWith("/ticketing/");
}

export function previewAllowed(environment: string | undefined, enabled: string | undefined, hostname: string) {
  return environment === "development" && enabled === "1" && ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
}

export function canTicketing(role: TicketingRole, action: TicketingAction, assignedEvents: string[], eventId?: string) {
  if (!["platform_admin", "coordinator", "checkin_staff"].includes(role)) return false;
  if (role === "platform_admin") return true;
  if (action === "platform" || !eventId || !assignedEvents.includes(eventId)) return false;
  return action === "redeem" || role === "coordinator";
}

export function ticketPrice(priceCents: number, quantity: number) {
  if (!Number.isInteger(priceCents) || priceCents < 0 || priceCents > 1000000 || !Number.isInteger(quantity) || quantity < 1 || quantity > 8) throw new Error("Choose between 1 and 8 tickets.");
  const baseCents = priceCents * quantity;
  const feeCents = priceCents === 0 ? 0 : (100 + Math.round(priceCents * 0.02)) * quantity;
  return { baseCents, feeCents, totalCents: baseCents + feeCents };
}

export const ticketMoney = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
export const ticketDate = (date: string, timeZone = "America/New_York") => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone }).format(new Date(date));

export function eventLocalStart(date: string | number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(date));
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

export function checkInDay(event: Pick<PilotEvent, "startsAt" | "timeZone">) {
  return eventLocalStart(event.startsAt, event.timeZone).slice(0, 10);
}

export function checkInOpen(event: Pick<PilotEvent, "startsAt" | "timeZone">, now: number) {
  return checkInDay(event) === eventLocalStart(now, event.timeZone).slice(0, 10);
}

export function defaultOperatorExpiry(event: Pick<PilotEvent, "startsAt" | "timeZone">) {
  const nextDate = new Date(Date.parse(`${checkInDay(event)}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  return eventStartFromLocal(`${nextDate}T00:00`, event.timeZone);
}

export function eventStartFromLocal(localStart: string, timeZone: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localStart)) throw new Error("Enter a valid event date and time.");
  const target = Date.parse(`${localStart}:00Z`);
  if (!Number.isFinite(target) || new Date(target).toISOString().slice(0, 16) !== localStart) throw new Error("Enter a valid event date and time.");
  let candidate = target;
  for (let index = 0; index < 4; index++) {
    const rendered = eventLocalStart(candidate, timeZone);
    if (rendered === localStart) return new Date(candidate).toISOString();
    candidate += target - Date.parse(`${rendered}:00Z`);
  }
  throw new Error("That local time does not exist in this time zone. Choose another time.");
}

export const MANUAL_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export function normalizeManualCode(value: string) {
  const normalized = value.toUpperCase().replace(/[\s-]/g, "");
  return /^[2-9A-HJ-NP-Z]{8}$/.test(normalized) ? normalized : null;
}

export function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function ticketCsv(rows: Array<Record<string, unknown>>) {
  const columns = ["order_id", "event", "purchased_at", "purchaser", "email", "quantity", "currency", "ticket_subtotal", "hub_fee", "collected", "refunded", "processor_fee", "tax", "payment_reference", "status", "data_mode"];
  return [columns.map(csvCell).join(","), ...rows.map(row => columns.map(column => csvCell(row[column])).join(","))].join("\r\n");
}
