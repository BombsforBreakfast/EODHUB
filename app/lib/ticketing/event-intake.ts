import { eventStartFromLocal, type PilotEvent } from "./model";

export type CoordinatorProfile = {
  name: string;
  email: string;
  phone: string;
  organization: string;
  affiliation: "EOD" | "PSBT" | "Other" | "None";
  affiliationDetails: string;
};
export type CoordinatorDraft = Omit<CoordinatorProfile, "affiliation"> & { affiliation: string };
export type TicketTypeDraft = { id: string; name: string; price: string; capacity: string };
export const MAX_TICKET_TYPES = 6;

export type EventDraft = {
  title: string;
  category: PilotEvent["category"];
  organizer: string;
  localStart: string;
  localEnd: string;
  timeZone: string;
  venue: string;
  address: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  description: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  hostUrl: string;
  flyerUrl: string;
  ticketPrice: string;
  capacity: string;
  ticketTypes?: TicketTypeDraft[];
  wizardStep: number;
  _autosaveId?: string;
};
export type EventTextField = Exclude<keyof EventDraft, "ticketTypes" | "wizardStep" | "_autosaveId">;

export type EventSubmission = {
  eventId: string;
  submittedBy: string;
  revision: number;
  approval: "draft" | "pending" | "approved" | "changes_requested" | "rejected";
  salesSetup: "not_configured" | "demo_ready";
  reviewNote: string;
  createdAt: string;
  history: Array<{ action: string; by: string; at: string; note: string }>;
};

export type SubmissionView = EventSubmission & { event: PilotEvent; draft: EventDraft; submitter?: CoordinatorProfile };

export function intakeText(value: unknown, minimum: number, maximum: number, label: string) {
  if (typeof value !== "string" || value.trim().length < minimum || value.trim().length > maximum) throw new Error(`Enter a valid ${label}.`);
  return value.trim();
}

export function intakeEmail(value: unknown) {
  const email = intakeText(value, 5, 254, "email address").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
  return email;
}

function phoneNumber(value: unknown) {
  const phone = intakeText(value, 7, 40, "phone number");
  if (!/^[+\d\s().x-]+$/i.test(phone) || phone.replace(/\D/g, "").length < 7) throw new Error("Enter a valid phone number.");
  return phone;
}

export function parseCoordinatorProfile(body: Record<string, unknown>, identityEmail: string): CoordinatorProfile {
  if (intakeEmail(body.email) !== intakeEmail(identityEmail)) throw new Error("Use the email belonging to this signed-in account. This form cannot change your login email.");
  const affiliation = body.affiliation;
  if (!["EOD", "PSBT", "Other", "None"].includes(String(affiliation))) throw new Error("Choose an affiliation, including None if applicable.");
  return {
    name: intakeText(body.name, 2, 100, "full name"), email: intakeEmail(identityEmail), phone: phoneNumber(body.phone),
    organization: intakeText(body.organization, 2, 160, "organization, or enter Independent / none"),
    affiliation: affiliation as CoordinatorProfile["affiliation"], affiliationDetails: intakeText(body.affiliationDetails ?? "", 0, 300, "affiliation details"),
  };
}

export function cleanCoordinatorDraft(body: Record<string, unknown>, identityEmail: string): CoordinatorDraft {
  const text = (key: string, max: number) => typeof body[key] === "string" ? (body[key] as string).trim().slice(0, max) : "";
  return { name: text("name", 100), email: intakeEmail(identityEmail), phone: text("phone", 40), organization: text("organization", 160), affiliation: text("affiliation", 20), affiliationDetails: text("affiliationDetails", 300) };
}

export function coordinatorProfileState(value: Record<string, unknown> | null, email: string) {
  let profile: CoordinatorProfile | null = null;
  try { if (value) profile = parseCoordinatorProfile(value, email); } catch { /* Incomplete organizer details are private drafts, not completed profiles. */ }
  const pending = value?._draft;
  const profileDraft = pending && typeof pending === "object" && !Array.isArray(pending) ? cleanCoordinatorDraft(pending as Record<string, unknown>, email) : null;
  return { profile, profileDraft };
}

export function parseTicketPrice(value: unknown) {
  const price = intakeText(value, 1, 10, "ticket price");
  if (!/^\d{1,5}(?:\.\d{1,2})?$/.test(price)) throw new Error("Use a dollar amount with no more than two decimal places.");
  const [dollars, fraction = ""] = price.split(".");
  const cents = Number(dollars) * 100 + Number(fraction.padEnd(2, "0"));
  if (cents > 1000000) throw new Error("The pilot supports ticket prices up to $10,000.");
  return cents;
}

export function cleanTicketTypeDrafts(value: unknown): TicketTypeDraft[] {
  if (!Array.isArray(value) || !value.length || value.length > MAX_TICKET_TYPES) throw new Error("Use between 1 and 6 ticket types.");
  const ids = new Set<string>();
  return value.map(row => {
    if (!row || typeof row !== "object" || typeof row.id !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(row.id) || ids.has(row.id)) throw new Error("Reload this event to restore its ticket type identifiers.");
    ids.add(row.id);
    const text = (key: string, max: number) => typeof row[key] === "string" ? row[key].trim().slice(0, max) : "";
    return { id: row.id, name: text("name", 60), price: text("price", 10), capacity: text("capacity", 6) };
  });
}

export function draftTicketTypes(draft: Pick<EventDraft, "ticketTypes" | "ticketPrice" | "capacity">): TicketTypeDraft[] {
  return draft.ticketTypes ?? [{ id: "general", name: "General admission", price: draft.ticketPrice, capacity: draft.capacity }];
}

export function parseTicketTypes(body: Pick<EventDraft, "ticketTypes" | "ticketPrice" | "capacity">) {
  const drafts = cleanTicketTypeDrafts(draftTicketTypes(body));
  const names = new Set<string>();
  const types = drafts.map(row => {
    const name = intakeText(row.name, 1, 60, "ticket type name");
    if (names.has(name.toLowerCase())) throw new Error("Give each ticket type a different name.");
    names.add(name.toLowerCase());
    const capacity = Number(row.capacity);
    if (!/^\d+$/.test(row.capacity) || !Number.isInteger(capacity) || capacity < 1 || capacity > 100000) throw new Error(`Enter between 1 and 100,000 available tickets for ${name}.`);
    return { id: row.id, name, priceCents: parseTicketPrice(row.price), capacity };
  });
  const capacity = types.reduce((total, row) => total + row.capacity, 0);
  if (capacity > 100000) throw new Error("The pilot supports up to 100,000 tickets across all types.");
  return { drafts, types, capacity, priceCents: Math.min(...types.map(row => row.priceCents)) };
}

export function parseEventSchedule(body: Record<string, unknown>) {
  const timeZone = intakeText(body.timeZone, 1, 100, "event time zone");
  const localStart = intakeText(body.localStart, 16, 16, "event start date and time");
  const localEnd = intakeText(body.localEnd, 16, 16, "event finish date and time");
  const startsAt = eventStartFromLocal(localStart, timeZone);
  const endsAt = eventStartFromLocal(localEnd, timeZone);
  if (Date.parse(endsAt) <= Date.parse(startsAt)) throw new Error("Event finish must be after the start. For an overnight event, choose the next day's finish date.");
  return { timeZone, localStart, localEnd, startsAt, endsAt };
}

export function normalizeHostWebsite(value: string) {
  const input = value.trim();
  const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(input);
  const hostWithPort = /^[^/?#:\s]+:\d+(?:[/?#]|$)/.test(input);
  if (!input || (hasScheme && !hostWithPort)) return input;
  return input.startsWith("//") ? `https:${input}` : `https://${input}`;
}

export function parseHostWebsite(value: unknown) {
  const input = normalizeHostWebsite(intakeText(value ?? "", 0, 500, "host website"));
  if (!input) return "";
  let url: URL;
  try { url = new URL(input); } catch { throw new Error("Enter a valid website, such as eod-hub.com."); }
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("The host website must use HTTPS without embedded credentials.");
  const normalized = url.href;
  if (normalized.length > 500) throw new Error("Keep the host website address under 500 characters.");
  return normalized;
}

export function wizardStepComplete(step: number, draft: EventDraft, personal: CoordinatorDraft, email: string): boolean {
  try {
    if (step === 0) parseCoordinatorProfile(personal, email);
    if (step === 1) {
      intakeText(draft.title, 3, 120, "event title"); intakeText(draft.organizer, 2, 160, "host organization");
      if (!["Community", "Fitness"].includes(draft.category)) return false;
      parseEventSchedule(draft); parseHostWebsite(draft.hostUrl); intakeText(draft.description, 20, 5000, "event details");
    }
    if (step === 2) {
      intakeText(draft.venue, 2, 160, "venue"); intakeText(draft.address, 3, 200, "address");
      intakeText(draft.city, 2, 100, "city"); intakeText(draft.region, 2, 100, "state or region");
      intakeText(draft.country, 2, 100, "country"); intakeText(draft.postalCode, 0, 20, "postal code");
      intakeText(draft.contactName, 2, 100, "contact name"); phoneNumber(draft.contactPhone); intakeEmail(draft.contactEmail);
    }
    if (step === 3 && draft.flyerUrl && !/^\/api\/ticketing\/flyer\?id=[0-9a-f-]{36}$/.test(draft.flyerUrl)) return false;
    if (step === 4) parseTicketTypes(draft);
    return true;
  } catch { return false; }
}

export function parseEventDraft(body: Record<string, unknown>) {
  const category = body.category;
  if (category !== "Fitness" && category !== "Community") throw new Error("Choose an event category.");
  const { timeZone, localStart, localEnd, startsAt, endsAt } = parseEventSchedule(body);
  const tickets = parseTicketTypes({ ticketTypes: body.ticketTypes as TicketTypeDraft[] | undefined, ticketPrice: String(body.ticketPrice ?? ""), capacity: String(body.capacity ?? "") });
  const hostUrl = parseHostWebsite(body.hostUrl);
  const flyerUrl = intakeText(body.flyerUrl ?? "", 0, 250, "flyer upload");
  if (flyerUrl && !/^\/api\/ticketing\/flyer\?id=[0-9a-f-]{36}$/.test(flyerUrl)) throw new Error("Upload a flyer using the event wizard.");
  const draft: EventDraft = {
    title: intakeText(body.title, 3, 120, "event title"), category, organizer: intakeText(body.organizer, 2, 160, "host organization"),
    localStart, localEnd, timeZone, venue: intakeText(body.venue, 2, 160, "venue"), address: intakeText(body.address, 3, 200, "street address"),
    city: intakeText(body.city, 2, 100, "city"), region: intakeText(body.region, 2, 100, "state or region"),
    postalCode: intakeText(body.postalCode ?? "", 0, 20, "postal code"), country: intakeText(body.country, 2, 100, "country"),
    description: intakeText(body.description, 20, 5000, "event details"), contactName: intakeText(body.contactName, 2, 100, "event contact name"),
    contactPhone: phoneNumber(body.contactPhone), contactEmail: intakeEmail(body.contactEmail), hostUrl, flyerUrl,
    ticketPrice: (tickets.priceCents / 100).toFixed(2), capacity: String(tickets.capacity), ticketTypes: tickets.drafts, wizardStep: 5,
  };
  return { draft, startsAt, endsAt, priceCents: tickets.priceCents, capacity: tickets.capacity, ticketTypes: tickets.types };
}

export function eventFields(parsed: ReturnType<typeof parseEventDraft>): Omit<PilotEvent, "id" | "slug" | "status" | "scheduleRevision"> {
  const { draft, startsAt, endsAt, priceCents, capacity, ticketTypes } = parsed;
  return {
    title: draft.title, category: draft.category, organizer: draft.organizer, startsAt, endsAt, timeZone: draft.timeZone,
    location: `${draft.venue} · ${draft.city}, ${draft.region}`, description: draft.description, capacity, priceCents, ticketTypes,
    venueAddress: [draft.address, draft.city, draft.region, draft.postalCode, draft.country].filter(Boolean).join(", "),
    contact: { name: draft.contactName, phone: draft.contactPhone, email: draft.contactEmail },
    hostUrl: draft.hostUrl || undefined, flyerUrl: draft.flyerUrl || undefined,
  };
}

export function emptyEventDraft(): EventDraft {
  return { title: "", category: "Community", organizer: "", localStart: "", localEnd: "", timeZone: "America/New_York", venue: "", address: "", city: "", region: "", postalCode: "", country: "United States", description: "", contactName: "", contactPhone: "", contactEmail: "", hostUrl: "", flyerUrl: "", ticketPrice: "30.00", capacity: "80", wizardStep: 0 };
}
