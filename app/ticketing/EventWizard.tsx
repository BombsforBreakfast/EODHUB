"use client";

import Image from "next/image";
import { useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check, Upload, X } from "lucide-react";
import { emptyEventDraft, parseEventDraft, parseTicketPrice, type CoordinatorProfile, type EventDraft, type SubmissionView } from "@/app/lib/ticketing/event-intake";
import { eventStartFromLocal, ticketMoney, ticketPrice } from "@/app/lib/ticketing/model";
import LocalDateTimeField from "./LocalDateTimeField";
import styles from "./ticketing.module.css";

type Props = {
  admin: boolean;
  email: string;
  profile: CoordinatorProfile | null;
  initial?: SubmissionView;
  profileOnly?: boolean;
  post: <Result = unknown>(body: Record<string, unknown>) => Promise<Result>;
  close: () => void;
  complete: (eventId?: string) => Promise<void>;
};

const steps = ["Your profile", "Event details", "Location & contact", "Photo / flyer", "Tickets", "Review"];

export default function EventWizard({ email, profile, initial, profileOnly = false, post, close, complete }: Props) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<EventDraft>(() => initial ? { ...initial.draft } : emptyEventDraft());
  const [personal, setPersonal] = useState(() => ({ name: profile?.name ?? "", email, phone: profile?.phone ?? "", organization: profile?.organization ?? "", affiliation: String(profile?.affiliation ?? ""), affiliationDetails: profile?.affiliationDetails ?? "" }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmContact, setConfirmContact] = useState(false);
  const [confirmAuthority, setConfirmAuthority] = useState(false);
  const [saved, setSaved] = useState<{ id: string; revision: number } | null>(() => initial ? { id: initial.eventId, revision: initial.revision } : null);
  const fileInput = useRef<HTMLInputElement>(null);
  const titles = profileOnly ? ["Your profile"] : steps;
  const change = (field: keyof EventDraft, value: string) => setDraft(previous => ({ ...previous, [field]: value }));
  const field = (label: string, name: keyof EventDraft, options: { type?: string; required?: boolean; maxLength?: number; placeholder?: string; disabled?: boolean } = {}) => <label>{label}<input name={name} type={options.type ?? "text"} value={draft[name]} onChange={event => change(name, event.target.value)} required={options.required ?? true} maxLength={options.maxLength ?? 160} placeholder={options.placeholder} disabled={options.disabled} /></label>;

  async function upload(file: File) {
    setError("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 6 * 1024 * 1024) { setError("Choose a JPG, PNG, or WebP image under 6 MB."); return; }
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/ticketing/flyer", { method: "POST", body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not upload this image.");
      change("flyerUrl", result.flyerUrl);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not upload this image."); }
    finally { setBusy(false); }
  }

  async function next(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setBusy(true);
    try {
      if (step === 0) {
        await post({ action: "save-profile", ...personal });
        if (profileOnly) { await complete(); return; }
        setDraft(previous => ({ ...previous, organizer: previous.organizer || personal.organization }));
      }
      if (step === 1) eventStartFromLocal(draft.localStart, draft.timeZone);
      if (step === 4) parseTicketPrice(draft.ticketPrice);
      if (step === titles.length - 1) {
        parseEventDraft(draft);
        const result = await post<{ id: string }>({ action: saved ? "revise-event" : "create-event", ...draft, eventId: saved?.id, expectedRevision: saved?.revision, confirmContact, confirmAuthority });
        await complete(result.id);
      } else {
        await persistDraft();
        setStep(value => value + 1);
      }
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not save this event."); }
    finally { setBusy(false); }
  }

  async function persistDraft() {
    const result = await post<{ id: string; revision: number }>({ action: "save-draft", draft, eventId: saved?.id, expectedRevision: saved?.revision });
    setSaved(result);
    return result;
  }

  async function saveDraft() {
    setBusy(true); setError("");
    try {
      const result = await persistDraft();
      await complete(result.id);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not save this draft."); }
    finally { setBusy(false); }
  }

  let totals = { baseCents: 0, feeCents: 0, totalCents: 0 };
  try { totals = ticketPrice(parseTicketPrice(draft.ticketPrice), 1); } catch { totals = { baseCents: 0, feeCents: 0, totalCents: 0 }; }

  return <section className={styles.wizard} aria-label={profileOnly ? "Coordinator profile" : "Event creation wizard"}>
    <header className={styles.sectionHeading}>
      <div><h2>{profileOnly ? "Your coordinator profile" : initial ? "Edit event" : "Create an event"}</h2><p className={styles.muted}>Pilot workspace · your changes are saved securely. Ticket sales are disabled.</p></div>
      <button type="button" className={styles.iconButton} aria-label="Close event wizard" disabled={busy} onClick={close}><X size={20} /></button>
    </header>
    {!profileOnly ? <><p className={styles.eyebrow}>Step {step + 1} of {titles.length}</p><nav className={styles.wizardSteps} aria-label="Event wizard steps">{titles.map((title, index) => <button key={title} type="button" className={index === step ? styles.activeStep : ""} disabled={index > step || busy} aria-current={index === step ? "step" : undefined} onClick={() => { setStep(index); setError(""); }}>{index + 1}. {title}</button>)}</nav></> : null}
    <form className={styles.form} onSubmit={next}>
      <fieldset disabled={busy} className={styles.wizardFields}>
        {step === 0 ? <>
          <h3>About you</h3>
          <p className={styles.finePrint}>Private coordinator information for platform review—not your public event contact or an application for Hub community membership.</p>
          <div className={styles.wizardGrid}>
            <label>Full name<input name="profileName" value={personal.name} onChange={event => setPersonal(previous => ({ ...previous, name: event.target.value }))} required minLength={2} maxLength={100} autoComplete="name" /></label>
            <label>Account email<input type="email" value={email} readOnly aria-describedby="coordinator-email-note" /></label>
            <label>Personal phone number<input type="tel" value={personal.phone} onChange={event => setPersonal(previous => ({ ...previous, phone: event.target.value }))} required minLength={7} maxLength={40} autoComplete="tel" /></label>
            <label>Organization represented<input value={personal.organization} onChange={event => setPersonal(previous => ({ ...previous, organization: event.target.value }))} required minLength={2} maxLength={160} placeholder="Organization, or Independent / none" /></label>
            <label>EOD / PSBT affiliation<select value={personal.affiliation} onChange={event => setPersonal(previous => ({ ...previous, affiliation: event.target.value }))} required><option value="">Choose an affiliation</option><option value="EOD">EOD</option><option value="PSBT">PSBT</option><option value="Other">Other affiliation</option><option value="None">No EOD / PSBT affiliation</option></select></label>
            <label>Affiliation details (optional)<input value={personal.affiliationDetails} onChange={event => setPersonal(previous => ({ ...previous, affiliationDetails: event.target.value }))} maxLength={300} placeholder="For example: organization or role" /></label>
          </div>
          <p id="coordinator-email-note" className={styles.finePrint}>This is your verified sign-in email. Editing a profile cannot change it. Affiliation is self-declared, not verified community status.</p>
        </> : step === 1 ? <>
          <h3>Event details</h3>
          <div className={styles.wizardGrid}>
            {field("Event title", "title", { maxLength: 120 })}
            {field("Hosting organization", "organizer")}
            <label>Category<select value={draft.category} onChange={event => change("category", event.target.value)}><option value="Community">Community</option><option value="Fitness">Fitness</option></select></label>
            <LocalDateTimeField label="Event start (local date & time)" name="localStart" defaultValue={draft.localStart} onChange={value => change("localStart", value)} />
            {field("Event time zone", "timeZone", { placeholder: "America/New_York" })}
            {field("Host / original event website (optional)", "hostUrl", { type: "url", required: false, maxLength: 500, placeholder: "https://…" })}
          </div>
          <p className={styles.finePrint}>This pilot supports one admission day in the selected time zone. Changes require another review. No tickets have been sold.</p>
          <label>Event details<textarea value={draft.description} onChange={event => change("description", event.target.value)} required minLength={20} maxLength={5000} placeholder="What attendees should know, schedule, requirements, and organizer policies." /></label>
        </> : step === 2 ? <>
          <h3>Location</h3><div className={styles.wizardGrid}>
            {field("Venue name", "venue")}{field("Street address", "address", { maxLength: 200 })}{field("City", "city")}{field("State / region", "region")}{field("ZIP / postal code (optional)", "postalCode", { required: false, maxLength: 20 })}{field("Country", "country")}
          </div>
          <h3>Public event point of contact</h3><p className={styles.finePrint}>Use an appropriate public business/event contact. These details will be shown with the event, unlike your private coordinator profile.</p>
          <div className={styles.wizardGrid}>{field("Event contact name", "contactName")}{field("Event contact phone", "contactPhone", { type: "tel", maxLength: 40 })}{field("Event contact email", "contactEmail", { type: "email", maxLength: 254 })}</div>
        </> : step === 3 ? <>
          <h3>Event photo or flyer</h3>
          <div className={styles.pasteZone} tabIndex={0} role="group" aria-label="Paste an event photo or flyer here" onPaste={event => {
            const file = event.clipboardData.files[0];
            if (file) { event.preventDefault(); void upload(file); }
          }}>
            <Upload size={28} /><p>Choose a file, or click inside this area and paste an image.</p><p className={styles.finePrint}>JPG, PNG, or WebP · up to 6 MB · optional</p>
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Upload event photo or flyer" onChange={event => { const file = event.target.files?.[0]; event.currentTarget.value = ""; if (file) void upload(file); }} />
          </div>
          {draft.flyerUrl ? <div className={styles.wizardFlyer}><Image src={draft.flyerUrl} alt="Uploaded event flyer preview" width={600} height={800} unoptimized /><button type="button" className={styles.textButton} onClick={() => change("flyerUrl", "")}>Remove image</button></div> : null}
        </> : step === 4 ? <>
          <h3>General admission</h3>
          <div className={styles.wizardGrid}><label>Ticket price (USD)<input type="number" min="0" max="10000" step="0.01" value={draft.ticketPrice} onChange={event => change("ticketPrice", event.target.value)} required /></label><label>Number of tickets available<input type="number" min="1" max="100000" step="1" value={draft.capacity} onChange={event => change("capacity", event.target.value)} required /></label></div>
          <div className={styles.priceRows}><p><span>Admission</span><strong>{ticketMoney(totals.baseCents)}</strong></p><p><span>Example Hub ticketing fee</span><strong>{ticketMoney(totals.feeCents)}</strong></p><p><span>Example buyer total</span><strong>{ticketMoney(totals.totalCents)}</strong></p></div>
          <p className={styles.notice}>Ticket sales are disabled during this pilot. Final fees, taxes and refund terms will be confirmed before checkout opens.</p>
        </> : <>
          <h3>{draft.title}</h3><dl className={styles.reviewDetails}>
            <dt>Hosted by</dt><dd>{draft.organizer}</dd><dt>When</dt><dd>{draft.localStart.replace("T", " · ")} ({draft.timeZone})</dd><dt>Where</dt><dd>{draft.venue}<br />{[draft.address, draft.city, draft.region, draft.postalCode, draft.country].filter(Boolean).join(", ")}</dd>
            <dt>Public contact</dt><dd>{draft.contactName}<br />{draft.contactPhone}<br />{draft.contactEmail}</dd><dt>Host website</dt><dd>{draft.hostUrl || "Not supplied"}</dd><dt>Admission</dt><dd>{ticketMoney(totals.baseCents)} · {draft.capacity} tickets available</dd><dt>Details</dt><dd className={styles.preserveText}>{draft.description}</dd>
          </dl>
          {draft.flyerUrl ? <div className={styles.wizardFlyer}><Image src={draft.flyerUrl} alt="Event flyer to submit" width={450} height={600} unoptimized /></div> : null}
          <p className={styles.notice}>Your submission goes to the Hub owner for review. Approval does not publish this pilot event or open ticket sales.</p>
          <label className={styles.acknowledgment}><input type="checkbox" checked={confirmContact} onChange={event => setConfirmContact(event.target.checked)} required /><span>The event POC details are appropriate to display publicly. My coordinator profile remains private.</span></label>
          <label className={styles.acknowledgment}><input type="checkbox" checked={confirmAuthority} onChange={event => setConfirmAuthority(event.target.checked)} required /><span>I am authorized to list this event and have permission to use any uploaded images.</span></label>
        </>}
      </fieldset>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <div className={styles.wizardActions}>{step > 0 ? <button type="button" className={styles.secondary} disabled={busy} onClick={() => { setStep(value => value - 1); setError(""); }}><ArrowLeft size={16} />Back</button> : <button type="button" className={styles.secondary} disabled={busy} onClick={close}>Close</button>}{!profileOnly ? <button type="button" className={styles.secondary} disabled={busy} onClick={() => void saveDraft()}>Save draft & close</button> : null}<button className={styles.primary} type="submit" disabled={busy}>{busy ? "Saving…" : profileOnly ? "Save coordinator profile" : step === titles.length - 1 ? "Submit for review" : "Save & continue"}{step === titles.length - 1 ? <Check size={16} /> : <ArrowRight size={16} />}</button></div>
    </form>
  </section>;
}
