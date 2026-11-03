"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check, CircleAlert, Upload, X } from "lucide-react";
import { draftTicketTypes, parseCoordinatorProfile, parseEventDraft, parseEventSchedule, parseHostWebsite, parseTicketPrice, parseTicketTypes, normalizeHostWebsite, wizardStepComplete, type CoordinatorDraft, type CoordinatorProfile, type EventTextField, type SubmissionView } from "@/app/lib/ticketing/event-intake";
import { openEventEditor, type EditorRecovery } from "@/app/lib/ticketing/editor-autosave";
import { ticketMoney } from "@/app/lib/ticketing/model";
import { displayLocalDateTime } from "@/app/lib/ticketing/local-time";
import LocalDateTimeField from "./LocalDateTimeField";
import TicketTypesEditor from "./TicketTypesEditor";
import styles from "./ticketing.module.css";

type Props = {
  admin: boolean;
  email: string;
  userId: string;
  draftId: string;
  profile: CoordinatorProfile | null;
  profileDraft?: CoordinatorDraft | null;
  recovery?: EditorRecovery | null;
  onProfileSaved: (state: { profile: CoordinatorProfile | null; profileDraft: CoordinatorDraft | null }) => void;
  initial?: SubmissionView;
  profileOnly?: boolean;
  post: <Result = unknown>(body: Record<string, unknown>) => Promise<Result>;
  complete: (eventId?: string) => Promise<void>;
};

const steps = ["Your profile", "Event details", "Location & contact", "Photo / flyer", "Tickets", "Review"];

export default function EventWizard({ email, userId, draftId, profile, profileDraft, recovery, onProfileSaved, initial, profileOnly = false, post, complete }: Props) {
  const [editor] = useState(() => openEventEditor({ userId, email, draftId, profileOnly, profile, profileDraft, recovery, serverDraft: initial?.draft, head: initial ? { id: initial.eventId, revision: initial.revision } : undefined, post, onProfileSaved }));
  const view = useSyncExternalStore(editor.subscribe, editor.getSnapshot, editor.getSnapshot);
  const { draft, personal } = view;
  const step = profileOnly ? 0 : draft.wizardStep;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmContact, setConfirmContact] = useState(false);
  const [confirmAuthority, setConfirmAuthority] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const titles = profileOnly ? ["Your profile"] : steps;
  const change = (field: EventTextField, value: string) => editor.changeDraft({ ...editor.getSnapshot().draft, [field]: value });
  const setPersonal = (update: (value: CoordinatorDraft) => CoordinatorDraft) => editor.changePersonal(update(editor.getSnapshot().personal));
  const field = (label: string, name: EventTextField, options: { type?: string; required?: boolean; maxLength?: number; placeholder?: string; disabled?: boolean } = {}) => <label>{label}<input name={name} type={options.type ?? "text"} value={draft[name]} onChange={event => change(name, event.target.value)} required={options.required ?? true} maxLength={options.maxLength ?? 160} placeholder={options.placeholder} disabled={options.disabled} /></label>;
  useEffect(() => {
    editor.resume();
    const flush = () => { void editor.flush().catch(() => undefined); };
    const hidden = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush); window.addEventListener("online", flush); document.addEventListener("visibilitychange", hidden);
    return () => { window.removeEventListener("pagehide", flush); window.removeEventListener("online", flush); document.removeEventListener("visibilitychange", hidden); flush(); };
  }, [editor]);

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

  async function navigate(index: number) {
    setBusy(true); setError("");
    try { editor.changeDraft({ ...editor.getSnapshot().draft, wizardStep: index }); await editor.flush(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Could not save your changes."); }
    finally { setBusy(false); }
  }

  async function next(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      if (step === 0) parseCoordinatorProfile(personal, email);
      if (profileOnly) { await editor.flush(); editor.finish(); await complete(); return; }
      if (step === 1) { parseEventSchedule(draft); editor.changeDraft({ ...editor.getSnapshot().draft, hostUrl: parseHostWebsite(draft.hostUrl) }); }
      if (step === 4) parseTicketTypes(draft);
      if (step === titles.length - 1) {
        parseCoordinatorProfile(personal, email); parseEventDraft(draft);
        await editor.flush();
        const current = editor.getSnapshot();
        const result = await post<{ id: string }>({ action: current.head ? "revise-event" : "create-event", editorUserId: userId, ...current.draft, eventId: current.head?.id, expectedRevision: current.head?.revision, confirmContact, confirmAuthority });
        editor.finish(); await complete(result.id);
      } else {
        const current = editor.getSnapshot();
        editor.changeDraft({ ...current.draft, organizer: current.draft.organizer || personal.organization, wizardStep: step + 1 });
        await editor.flush();
      }
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not save this event."); }
    finally { setBusy(false); }
  }

  async function saveDraft() {
    setBusy(true); setError("");
    try { await editor.flush(); const id = editor.getSnapshot().head?.id; editor.close(); await complete(id); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Could not save this draft."); }
    finally { setBusy(false); }
  }

  async function retrySave() {
    setBusy(true); setError("");
    try { await editor.flush(); } catch { /* The save status explains the failure while retaining local edits. */ }
    finally { setBusy(false); }
  }
  async function discardLocal() {
    if (!window.confirm("Discard the unsaved edits from this browser and load the latest saved version?")) return;
    editor.discard(); await complete();
  }
  const ready = [0, 1, 2, 3, 4].map(index => wizardStepComplete(index, draft, personal, email));
  const allReady = ready.every(Boolean);
  const ticketRows = draftTicketTypes(draft);
  const ticketAmount = (value: string) => { try { return ticketMoney(parseTicketPrice(value)); } catch { return "Price not set"; } };

  return <section className={styles.wizard} aria-label={profileOnly ? "Coordinator profile" : "Event creation wizard"} data-event-id={draftId}>
    <header className={styles.sectionHeading}>
      <div><h2>{profileOnly ? "Your coordinator profile" : initial ? "Edit event" : "Create an event"}</h2><p className={styles.muted}>Pilot workspace · your changes are saved securely. Ticket sales are disabled.</p></div>
      <button type="button" className={styles.iconButton} aria-label="Close event wizard" disabled={busy} onClick={() => void saveDraft()}><X size={20} /></button>
    </header>
    <p className={styles.saveStatus} role="status" aria-live="polite">{view.status === "saved" ? "All changes saved" : view.status === "error" ? "Changes kept in this browser · sync needs attention" : "Saving changes…"}</p>
    {view.saveError ? <aside className={styles.notice}><p>{view.saveError}</p>{view.conflict ? <button type="button" className={styles.secondary} onClick={() => void discardLocal()}>Discard local changes & load saved version</button> : <button type="button" className={styles.secondary} disabled={busy} onClick={() => void retrySave()}>Retry save</button>}</aside> : null}
    {!profileOnly ? <><p className={styles.eyebrow}>Step {step + 1} of {titles.length}</p><nav className={styles.wizardSteps} aria-label="Event wizard steps">{titles.map((title, index) => {
      const done = index === 5 ? allReady && confirmContact && confirmAuthority : ready[index];
      return <button key={title} type="button" className={index === step ? styles.activeStep : ""} disabled={busy} aria-current={index === step ? "step" : undefined} aria-label={title + (done ? " · complete" : " · requires information")} onClick={() => void navigate(index)}>{index + 1}. {title}{done ? <Check size={14} aria-hidden="true" /> : <CircleAlert className={styles.stepWarning} size={16} aria-hidden="true" />}</button>;
    })}</nav><p className={styles.finePrint}>Choose any section to return to it. A yellow ! marks required information still missing. The photo / flyer is optional.</p></> : null}
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
            {field("Event time zone", "timeZone", { placeholder: "America/New_York" })}
            <LocalDateTimeField label="Event start (local date & time)" name="localStart" defaultValue={draft.localStart} onChange={value => change("localStart", value)} />
            <LocalDateTimeField label="Event finish (local date & time)" name="localEnd" defaultValue={draft.localEnd} onChange={value => change("localEnd", value)} />
            <label>Host / original event website (optional)<input name="hostUrl" type="text" inputMode="url" autoCapitalize="none" spellCheck={false} value={draft.hostUrl} onChange={event => change("hostUrl", event.target.value)} onBlur={event => change("hostUrl", normalizeHostWebsite(event.target.value))} maxLength={500} placeholder="eod-hub.com" /><small className={styles.finePrint}>Enter a website like eod-hub.com. We add https:// automatically.</small></label>
          </div>
          <p className={styles.finePrint}>Start and finish use the selected event time zone. For an overnight event, set the finish date to the following day. Changes require another review. No tickets have been sold.</p>
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
          <TicketTypesEditor value={ticketRows} onChange={ticketTypes => editor.changeDraft({ ...editor.getSnapshot().draft, ticketTypes })} />
        </> : <>
          <h3>{draft.title}</h3><dl className={styles.reviewDetails}>
            <dt>Hosted by</dt><dd>{draft.organizer}</dd><dt>Starts</dt><dd>{displayLocalDateTime(draft.localStart)}</dd><dt>Finishes</dt><dd>{displayLocalDateTime(draft.localEnd)}</dd><dt>Time zone</dt><dd>{draft.timeZone}</dd><dt>Where</dt><dd>{draft.venue}<br />{[draft.address, draft.city, draft.region, draft.postalCode, draft.country].filter(Boolean).join(", ")}</dd>
            <dt>Public contact</dt><dd>{draft.contactName}<br />{draft.contactPhone}<br />{draft.contactEmail}</dd><dt>Host website</dt><dd>{draft.hostUrl || "Not supplied"}</dd><dt>Ticket types</dt><dd>{ticketRows.map(row => <p key={row.id}><strong>{row.name || "Unnamed ticket type"}</strong> · {ticketAmount(row.price)} · {row.capacity || "Quantity not set"} tickets</p>)}</dd><dt>Details</dt><dd className={styles.preserveText}>{draft.description}</dd>
          </dl>
          {draft.flyerUrl ? <div className={styles.wizardFlyer}><Image src={draft.flyerUrl} alt="Event flyer to submit" width={450} height={600} unoptimized /></div> : null}
          <p className={styles.notice}>{!allReady ? "Complete the sections marked ! before submitting. " : ""}Your submission goes to the Hub owner for review. Approval does not publish this pilot event or open ticket sales.</p>
          <label className={styles.acknowledgment}><input type="checkbox" checked={confirmContact} onChange={event => setConfirmContact(event.target.checked)} required /><span>The event POC details are appropriate to display publicly. My coordinator profile remains private.</span></label>
          <label className={styles.acknowledgment}><input type="checkbox" checked={confirmAuthority} onChange={event => setConfirmAuthority(event.target.checked)} required /><span>I am authorized to list this event and have permission to use any uploaded images.</span></label>
        </>}
      </fieldset>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <div className={styles.wizardActions}>{step > 0 ? <button type="button" className={styles.secondary} disabled={busy} onClick={() => void navigate(step - 1)}><ArrowLeft size={16} />Back</button> : <button type="button" className={styles.secondary} disabled={busy} onClick={() => void saveDraft()}>Close</button>}{!profileOnly ? <button type="button" className={styles.secondary} disabled={busy} onClick={() => void saveDraft()}>Save draft & close</button> : null}<button className={styles.primary} type="submit" disabled={busy || view.conflict || (!profileOnly && step === 5 && !allReady)}>{busy ? "Saving…" : profileOnly ? "Save coordinator profile" : step === titles.length - 1 ? "Submit for review" : "Save & continue"}{step === titles.length - 1 ? <Check size={16} /> : <ArrowRight size={16} />}</button></div>
    </form>
  </section>;
}
