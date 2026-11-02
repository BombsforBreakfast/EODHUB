import { eventStartFromLocal, type PilotEvent } from "./model";

export type CoordinatorProfile = {
  name: string;
  email: string;
  phone: string;
  organization: string;
  affiliation: "EOD" | "PSBT" | "Other" | "None";
  affiliationDetails: string;
};

export type EventDraft = {
  title: string;
  category: PilotEvent["category"];
  organizer: string;
  localStart: string;
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
};

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

export function parseTicketPrice(value: unknown) {
  const price = intakeText(value, 1, 10, "ticket price");
  if (!/^\d{1,5}(?:\.\d{1,2})?$/.test(price)) throw new Error("Use a dollar amount with no more than two decimal places.");
  const [dollars, fraction = ""] = price.split(".");
  const cents = Number(dollars) * 100 + Number(fraction.padEnd(2, "0"));
  if (cents > 1000000) throw new Error("The pilot supports ticket prices up to $10,000.");
  return cents;
}

export function parseEventDraft(body: Record<string, unknown>) {
  const category = body.category;
  if (category !== "Fitness" && category !== "Community") throw new Error("Choose an event category.");
  const timeZone = intakeText(body.timeZone, 1, 100, "event time zone");
  const localStart = intakeText(body.localStart, 16, 16, "event start");
  const startsAt = eventStartFromLocal(localStart, timeZone);
  const capacityText = intakeText(body.capacity, 1, 6, "ticket capacity");
  const capacity = Number(capacityText);
  if (!/^\d+$/.test(capacityText) || !Number.isInteger(capacity) || capacity < 1 || capacity > 100000) throw new Error("Capacity must be between 1 and 100,000 tickets.");
  const hostUrl = intakeText(body.hostUrl ?? "", 0, 500, "host website");
  if (hostUrl) {
    let url: URL;
    try { url = new URL(hostUrl); } catch { throw new Error("Enter a full HTTPS host website address."); }
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("The host website must use HTTPS without embedded credentials.");
  }
  const flyerUrl = intakeText(body.flyerUrl ?? "", 0, 250, "flyer upload");
  if (flyerUrl && !/^\/api\/ticketing\/flyer\?id=[0-9a-f-]{36}$/.test(flyerUrl)) throw new Error("Upload a flyer using the event wizard.");
  const draft: EventDraft = {
    title: intakeText(body.title, 3, 120, "event title"), category, organizer: intakeText(body.organizer, 2, 160, "host organization"),
    localStart, timeZone, venue: intakeText(body.venue, 2, 160, "venue"), address: intakeText(body.address, 3, 200, "street address"),
    city: intakeText(body.city, 2, 100, "city"), region: intakeText(body.region, 2, 100, "state or region"),
    postalCode: intakeText(body.postalCode ?? "", 0, 20, "postal code"), country: intakeText(body.country, 2, 100, "country"),
    description: intakeText(body.description, 20, 5000, "event details"), contactName: intakeText(body.contactName, 2, 100, "event contact name"),
    contactPhone: phoneNumber(body.contactPhone), contactEmail: intakeEmail(body.contactEmail), hostUrl, flyerUrl,
    ticketPrice: intakeText(body.ticketPrice, 1, 10, "ticket price"), capacity: capacityText,
  };
  return { draft, startsAt, priceCents: parseTicketPrice(draft.ticketPrice), capacity };
}

export function eventFields(parsed: ReturnType<typeof parseEventDraft>): Omit<PilotEvent, "id" | "slug" | "status" | "scheduleRevision"> {
  const { draft, startsAt, priceCents, capacity } = parsed;
  return {
    title: draft.title, category: draft.category, organizer: draft.organizer, startsAt, timeZone: draft.timeZone,
    location: `${draft.venue} · ${draft.city}, ${draft.region}`, description: draft.description, capacity, priceCents,
    venueAddress: [draft.address, draft.city, draft.region, draft.postalCode, draft.country].filter(Boolean).join(", "),
    contact: { name: draft.contactName, phone: draft.contactPhone, email: draft.contactEmail },
    hostUrl: draft.hostUrl || undefined, flyerUrl: draft.flyerUrl || undefined,
  };
}

export function emptyEventDraft(): EventDraft {
  return { title: "", category: "Community", organizer: "", localStart: "", timeZone: "America/New_York", venue: "", address: "", city: "", region: "", postalCode: "", country: "United States", description: "", contactName: "", contactPhone: "", contactEmail: "", hostUrl: "", flyerUrl: "", ticketPrice: "30.00", capacity: "80" };
}
