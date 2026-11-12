"use client";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { ArrowRight, LogOut, Moon, Plus, RefreshCw, Sun } from "lucide-react";
import { useTheme } from "@/app/lib/ThemeContext";
import { draftTicketTypes, emptyEventDraft, type CoordinatorDraft, type CoordinatorProfile, type EventDraft, type SubmissionView } from "@/app/lib/ticketing/event-intake";
import { readEditorRecovery, releaseEventEditors, type EditorRecovery } from "@/app/lib/ticketing/editor-autosave";
import type { PilotEvent } from "@/app/lib/ticketing/model";
import { createTicketingEntryLoader, ticketingEntryDestination } from "@/app/lib/ticketing/entry.client";
import { displayLocalDateTime } from "@/app/lib/ticketing/local-time";
import EventWizard from "./EventWizard";
import LocalDateTimeField from "./LocalDateTimeField";
import TicketRevenuePreview from "./TicketRevenuePreview";
import { NoCardPilotSwitch, NoCardPilotTickets } from "./NoCardPilot";
import styles from "./ticketing.module.css";
import { supabase } from "@/app/lib/lib/supabaseClient";
import { sharedAuthEnabledClient } from "@/app/lib/account/client";

type SavedEvent = { id: string; draft?: EventDraft; event: Partial<PilotEvent> | null; revision: number; review_status: SubmissionView["approval"]; review_note: string; can_manage: boolean; created_at: string; no_card_pilot_enabled?: boolean };
type Staff = { id: string; event_id: string; user_id: string; email: string; role: string; expires_at: string | null; revoked_at: string | null };
type Invitation = { id: string; email: string; role: string; event_id: string | null; accepted_at: string | null; revoked_at: string | null; expires_at: string };
type Workspace = { actor: { id: string; email: string; admin: boolean; can_create: boolean }; profile: CoordinatorProfile | null; profileDraft: CoordinatorDraft | null; events: SavedEvent[]; staff: Staff[]; invitations: Invitation[]; audit: { id: number; event_id: string | null; action: string; created_at: string }[]; noCardPilotAvailable?: boolean };

async function request<T = unknown>(url: string, body?: Record<string, unknown>): Promise<T> {
  if(sharedAuthEnabledClient() && url==="/api/ticketing/auth" && body?.action==="signout")await supabase.auth.signOut({scope:"local"});
  const token=sharedAuthEnabledClient()?(await supabase.auth.getSession()).data.session?.access_token:null;
  const auth:Record<string,string>=token?{Authorization:`Bearer ${token}`} : {};
  const response = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json",...auth }, body: JSON.stringify(body), keepalive: body.action === "save-draft" || body.action === "save-profile-draft" } : { cache: "no-store",headers:auth });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error ?? "This action could not be completed."), { status: response.status });
  return data as T;
}
const post = <T,>(body: Record<string, unknown>) => request<T>("/api/ticketing/workspace", body);
const title = (event: SavedEvent) => event.draft?.title || event.event?.title || "Untitled draft";
async function loadWorkspace(): Promise<Workspace | null> {
  const token=sharedAuthEnabledClient()?(await supabase.auth.getSession()).data.session?.access_token:null;
  if(sharedAuthEnabledClient()&&!token)return null;
  const response = await fetch("/api/ticketing/workspace", { cache: "no-store",headers:token?{Authorization:`Bearer ${token}`} : {} });
  const value = await response.json();
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(value.error ?? "Could not load your workspace.");
  return value;
}

export default function TicketingWorkspace() {
  const { t, isDark, toggleDark } = useTheme();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [invitation, setInvitation] = useState("");
  const [selected, setSelected] = useState("");
  const [wizard, setWizard] = useState<{ event?: SavedEvent; profileOnly?: boolean; draftId: string; recovery?: EditorRecovery | null } | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("checkin_staff");
  const [inviteEvent, setInviteEvent] = useState("");
  const [inviteExpiry, setInviteExpiry] = useState("");
  const [preparedLink, setPreparedLink] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [ticketRefresh, setTicketRefresh] = useState(0);
  const entryLoader = useRef<ReturnType<typeof createTicketingEntryLoader<Workspace>> | null>(null);
  const currentEntry = useRef<Promise<{ workspace: Workspace | null; verifiedLink: boolean }> | null>(null);
  const restoredUser = useRef("");
  const applyWorkspace = useCallback((value: Workspace | null) => {
    setWorkspace(value);
    setSelected(current => value?.events.some(event => event.id === current) ? current : value?.events[0]?.id ?? "");
    if (!value) { restoredUser.current = ""; setWizard(null); return; }
    if (restoredUser.current !== value.actor.id) {
      restoredUser.current = value.actor.id; setWizard(null);
      const recovery = readEditorRecovery(value.actor.id);
      if (recovery?.open) {
        const event = value.events.find(row => row.id === recovery.draftId && row.can_manage);
        if (recovery.profileOnly || event || (!recovery.head && value.actor.can_create)) setWizard({ event, profileOnly: recovery.profileOnly, draftId: recovery.draftId, recovery });
      }
    }
  }, []);
  const refresh = useCallback(async () => { applyWorkspace(await loadWorkspace()); setLoaded(true); }, [applyWorkspace]);
  useEffect(() => {
    let active = true;
    if (!entryLoader.current) entryLoader.current = createTicketingEntryLoader(async token => {
      if(sharedAuthEnabledClient()){const result=await supabase.auth.verifyOtp({type:"email",token_hash:token});if(result.error)throw new Error("This sign-in link expired. Request a new one.");}
      else await request("/api/ticketing/auth", { action: "verify", token });
    }, loadWorkspace);
    const open = () => {
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      const login = fragment.get("token_hash"), invite = fragment.get("invitation");
      if (login || invite) window.history.replaceState(null, "", window.location.pathname + window.location.search);
      if (invite) setInvitation(invite);
      try {
        if (invite) sessionStorage.setItem("ticketing-pending-invite", invite);
        else { const stored = sessionStorage.getItem("ticketing-pending-invite"); if (stored) setInvitation(stored); }
      } catch { /* The current invitation still works if browser storage is blocked. */ }
      setLoaded(false); setBusy(true); setError("");
      const promise = entryLoader.current!(login);
      currentEntry.current = promise;
      void promise.then(result => {
        if (!active || currentEntry.current !== promise) return;
        applyWorkspace(result.workspace);
        if (result.verifiedLink && result.workspace) {
          const destination = ticketingEntryDestination(result.workspace);
          if (window.location.pathname !== destination) window.location.replace(destination);
        }
      }).catch(failure => {
        if (!active || currentEntry.current !== promise) return;
        applyWorkspace(null); setError(failure instanceof Error ? failure.message : "This sign-in link could not be used. Request a new link.");
      }).finally(() => { if (active && currentEntry.current === promise) { setLoaded(true); setBusy(false); } });
    };
    open();
    const followLink = () => { if (/(?:^#|&)(?:token_hash|invitation)=/.test(window.location.hash)) open(); };
    window.addEventListener("hashchange", followLink);
    return () => { active = false; window.removeEventListener("hashchange", followLink); };
  }, [applyWorkspace]);
  async function run(action: () => Promise<void>) {
    setError(""); setNotice(""); setBusy(true);
    try { await action(); } catch (failure) { setError(failure instanceof Error ? failure.message : "Please try again."); }
    finally { setBusy(false); setTicketRefresh(value => value + 1); }
  }
  async function signIn(event: FormEvent) {
    event.preventDefault();
    await run(async () => { const result = await request<{ message: string }>("/api/ticketing/auth", { action: "request-link", email }); setNotice(result.message); });
  }
  const current = workspace?.events.find(event => event.id === selected);
  const managed = workspace?.events.filter(event => event.can_manage) ?? [];
  function openEditor(event?: SavedEvent, profileOnly = false) {
    const recovery = workspace ? readEditorRecovery(workspace.actor.id) : null;
    setWizard({ event, profileOnly, draftId: event?.id ?? crypto.randomUUID(), recovery: event && recovery?.draftId === event.id ? recovery : null });
  }
  const variables = { "--ticket-bg": t.bg, "--ticket-surface": t.surface, "--ticket-hover": t.surfaceHover, "--ticket-text": t.text, "--ticket-muted": t.textMuted, "--ticket-line": t.border, "--ticket-input": t.input, "--ticket-radius": `${t.radius}px`, "--ticket-radius-sm": `${t.radiusSm}px`, "--ticket-green": isDark ? "#33ff66" : "#087e2a", "--ticket-blue": isDark ? "#8c89ff" : "#5145c6", colorScheme: isDark ? "dark" : "light" } as CSSProperties;
  function submission(event: SavedEvent): SubmissionView {
    return { eventId: event.id, submittedBy: workspace!.actor.id, revision: event.revision, approval: event.review_status, salesSetup: "not_configured", reviewNote: event.review_note, createdAt: event.created_at, history: [], draft: { ...emptyEventDraft(), ...event.draft }, event: { ...event.event, id: event.id, slug: event.id, status: "draft", scheduleRevision: 1 } as PilotEvent };
  }
  return <div className={styles.page} style={variables}>
    <p className={styles.previewBanner}><span>CONTROLLED PILOT</span>Admin-controlled no-card tickets · paid checkout is disabled</p>
    <header className={styles.header}><Link className={styles.brand} href="/ticketing"><Image src="/branding/eod-crab-logo.png" width={40} height={40} alt="" /><span>EOD-HUB<small>Events & tickets</small></span></Link><nav aria-label="Ticketing navigation"><button className={styles.iconButton} onClick={toggleDark} aria-label={isDark ? "Use light theme" : "Use dark theme"}>{isDark ? <Sun size={18} /> : <Moon size={18} />}</button>{workspace ? <button type="button" disabled={busy} className={styles.textButton} onClick={() => void run(async () => { await request("/api/ticketing/auth", { action: "signout" }); releaseEventEditors(workspace.actor.id); setWorkspace(null); setWizard(null); restoredUser.current = ""; })}><LogOut size={16} />Sign out</button> : null}</nav></header>
    <main className={styles.section}>
      {sharedAuthEnabledClient()?<p><Link href="/account">Account settings & portal access</Link></p>:null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
      {!loaded ? <p role="status">Opening your event workspace…</p> : !workspace && sharedAuthEnabledClient() ? <section className={styles.accessCard}><h1>Events & tickets</h1><p>Sign in with your EOD-HUB account. Organizer and operator access stays scoped to approved events.</p><Link className={styles.primary} href="/account/sign-in?portal=events">Sign in or create account <ArrowRight size={17}/></Link><p className={styles.finePrint}>Google, Apple, email/password and email sign-in links are available. Ticket buyers do not need organizer approval.</p></section> : !workspace ? <section className={styles.accessCard}><h1>Event sign-in</h1><p>Use your invited email. Existing Hub members can use their regular email; no password is needed.</p>{invitation ? <p className={styles.notice}>Sign in with the email this invitation was sent to. You’ll then accept its event access.</p> : null}<form className={styles.form} onSubmit={signIn}><label>Email address<input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" required maxLength={254} /></label><button className={styles.primary} disabled={busy}>{busy ? "Sending…" : "Email me a sign-in link"}<ArrowRight size={17} /></button></form><p className={styles.finePrint}>Pilot access is invitation-only. This portal does not grant access to the EOD-HUB community.</p></section> : <>
        <div className={styles.sectionHeading}><div><h1>{workspace.actor.admin ? "Ticketing administration" : "Your event workspace"}</h1><p className={styles.muted}>{workspace.actor.email}{workspace.actor.admin ? " · Hub owner" : ""}</p></div><div className={styles.buttonRow}><button className={styles.secondary} disabled={busy} onClick={() => void run(refresh)}><RefreshCw size={16} />Refresh</button>{workspace.actor.can_create && !wizard ? <button className={styles.primary} onClick={() => openEditor()}><Plus size={16} />Create event</button> : null}</div></div>
        {invitation ? <aside className={styles.notice}><p>An invitation is ready to accept for this signed-in email.</p><button className={styles.primary} disabled={busy} onClick={() => void run(async () => { await post({ action: "accept-invite", token: invitation }); sessionStorage.removeItem("ticketing-pending-invite"); setInvitation(""); await refresh(); setNotice("Invitation accepted. Your event access is ready."); })}>Accept invitation</button><button className={styles.textButton} onClick={() => { setInvitation(""); sessionStorage.removeItem("ticketing-pending-invite"); }}>Dismiss</button></aside> : null}
        {!wizard && (workspace.actor.admin || workspace.actor.can_create || managed.length > 0) ? <div className={styles.buttonRow}><button className={styles.secondary} onClick={() => openEditor(undefined, true)}>Your private coordinator profile</button><button className={styles.secondary} onClick={() => { setInviteOpen(!inviteOpen); setInviteEvent(current?.can_manage ? current.id : ""); setInviteRole(workspace.actor.admin ? "coordinator" : "checkin_staff"); setPreparedLink(""); }}>Invite {workspace.actor.admin ? "a tester or event staff" : "a door operator"}</button></div> : null}
        {inviteOpen ? <section className={styles.purchaseBox}><h2>Prepare pilot invitation</h2><form className={styles.form} onSubmit={event => { event.preventDefault(); void run(async () => { const result = await post<{ url: string; message: string }>({ action: "invite", email: inviteEmail, role: inviteRole, eventId: inviteEvent || null, expiresAt: inviteExpiry ? new Date(inviteExpiry).toISOString() : null }); setPreparedLink(result.url); setNotice(result.message); await refresh(); }); }}><label>Invited email<input type="email" required value={inviteEmail} onChange={event => setInviteEmail(event.target.value)} /></label><label>Access<select value={inviteRole} onChange={event => setInviteRole(event.target.value)}>{workspace.actor.admin ? <><option value="coordinator">Coordinator</option><option value="customer">Customer tester</option></> : null}<option value="checkin_staff">Door operator</option></select></label>{inviteRole !== "customer" ? <label>Event<select value={inviteEvent} onChange={event => setInviteEvent(event.target.value)} required={inviteRole === "checkin_staff"}><option value="">{inviteRole === "coordinator" ? "Organizer: may submit their own events" : "Choose an event"}</option>{managed.map(event => <option value={event.id} key={event.id}>{title(event)}</option>)}</select></label> : null}{inviteRole === "checkin_staff" ? <LocalDateTimeField label="Access ends (your local time)" name="inviteExpiry" defaultValue={inviteExpiry} onChange={setInviteExpiry} /> : null}<p className={styles.finePrint}>Invitations expire after seven days and require verification of the invited email. Event coordinators manage only their assigned events. A new-organizer invitation allows creating their own submissions.</p><button className={styles.primary} disabled={busy}>Prepare invitation link</button></form>{preparedLink ? <div className={styles.form}><label>Share with the invited person<input readOnly value={preparedLink} onFocus={event => event.target.select()} /></label><button className={styles.secondary} onClick={() => void navigator.clipboard.writeText(preparedLink).then(() => setNotice("Invitation copied.")).catch(() => setNotice("Select and copy the invitation link above."))}>Copy invitation</button><small>No invitation email has been sent automatically.</small></div> : null}</section> : null}
        {wizard ? <EventWizard key={workspace.actor.id + ":" + wizard.draftId} admin={workspace.actor.admin} userId={workspace.actor.id} draftId={wizard.draftId} email={workspace.actor.email} profile={workspace.profile} profileDraft={workspace.profileDraft} recovery={wizard.recovery} onProfileSaved={value => setWorkspace(previous => previous?.actor.id === workspace.actor.id ? { ...previous, ...value } : previous)} profileOnly={wizard.profileOnly} initial={wizard.event ? submission(wizard.event) : undefined} post={post} complete={async id => { setWizard(null); await refresh(); if (id) setSelected(id); setNotice("Saved. Your changes will be available when you sign in on another device."); }} /> : <>
          {!workspace.events.length ? <p className={styles.empty}>{workspace.actor.can_create ? "Create your first event or save an unfinished draft." : "No event-staff assignments. Your tickets and open pilot events are below."}</p> : <>
            <label className={styles.field}>Assigned event<select value={selected} onChange={event => { setSelected(event.target.value); setReviewNote(""); }}>{workspace.events.map(event => <option value={event.id} key={event.id}>{title(event)}</option>)}</select></label>
            {workspace.noCardPilotAvailable && workspace.actor.admin && current ? <NoCardPilotSwitch key={current.id} eventId={current.id} enabled={current.no_card_pilot_enabled === true} approved={current.review_status === "approved"} revision={current.revision} request={request} onChanged={async () => { await refresh(); setTicketRefresh(value => value + 1); }} /> : null}
            {current ? <article className={styles.eventCard}><div className={styles.cardBody}><span className={styles.tag}>{current.can_manage ? current.review_status?.replaceAll("_", " ") : "Door operator"}</span><h2>{title(current)}</h2><p>{current.draft?.organizer || current.event?.location}</p>{current.draft?.localStart || current.draft?.localEnd ? <p className={styles.muted}><strong>Starts:</strong> {displayLocalDateTime(current.draft.localStart)}<br /><strong>Finishes:</strong> {displayLocalDateTime(current.draft.localEnd)}<br />{current.draft.timeZone}</p> : null}{current.review_note ? <p className={styles.notice}>{current.review_note}</p> : null}{current.draft?.flyerUrl ? <Image src={current.draft.flyerUrl} alt={`${title(current)} flyer`} width={160} height={200} unoptimized style={{ objectFit: "contain" }} /> : null}{current.can_manage ? <><p className={styles.muted}>Revision {current.revision} · saved in your account · ticket sales disabled</p>{current.draft ? <TicketRevenuePreview value={draftTicketTypes(current.draft)} compact /> : null}<button className={styles.secondary} onClick={() => openEditor(current)}>Edit event / resume draft</button>{workspace.actor.admin && current.review_status === "pending" ? <div className={styles.form}><label>Review note<textarea value={reviewNote} onChange={event => setReviewNote(event.target.value)} maxLength={1500} /></label><div className={styles.buttonRow}>{([ ["approved", "Approve"], ["changes_requested", "Request changes"], ["rejected", "Reject"] ] as const).map(([decision, label]) => <button className={styles.secondary} disabled={busy} key={decision} onClick={() => void run(async () => { await post({ action: "review-event", eventId: current.id, expectedRevision: current.revision, decision, note: reviewNote }); await refresh(); setReviewNote(""); })}>{label}</button>)}</div></div> : null}</> : <p className={styles.notice}>You have scanner access for this event only. Scanning will be connected with ticket issuance in the next pass.</p>}</div></article> : null}
          </>}
          {(workspace.actor.admin || managed.length) ? <section className={styles.eventGrid}><h2>Event access</h2>{workspace.staff.filter(row => !current || row.event_id === current.id).map(row => <article className={styles.eventCard} key={row.id}><div className={styles.cardBody}><p>{row.role === "coordinator" ? "Coordinator" : "Door operator"} · {row.email}</p><small>{row.revoked_at ? "Revoked" : row.expires_at ? `Access ends ${new Date(row.expires_at).toLocaleString()}` : "Active coordinator assignment"}</small>{!row.revoked_at && (workspace.actor.admin || row.role === "checkin_staff") ? <button className={styles.textButton} disabled={busy} onClick={() => void run(async () => { await post({ action: "revoke", assignmentId: row.id }); await refresh(); })}>Revoke access</button> : null}</div></article>)}{workspace.invitations.filter(row => !row.accepted_at && !row.revoked_at).map(row => <article className={styles.eventCard} key={row.id}><div className={styles.cardBody}><p>{row.email} · {row.role.replaceAll("_", " ")}</p><small>Invitation expires {new Date(row.expires_at).toLocaleDateString()}</small>{workspace.actor.admin || row.role === "checkin_staff" ? <button className={styles.textButton} disabled={busy} onClick={() => void run(async () => { await post({ action: "cancel-invite", invitationId: row.id }); await refresh(); })}>Cancel invitation</button> : null}</div></article>)}</section> : null}
          {workspace.audit.length ? <details className={styles.disclosure}><summary>Recent event activity</summary>{workspace.audit.filter(row => !current || row.event_id === current.id).slice(0, 20).map(row => <p key={row.id}>{row.action.replaceAll("_", " ")} · {new Date(row.created_at).toLocaleString()}</p>)}</details> : null}
        </>}
      </>}
      {workspace?.noCardPilotAvailable && !wizard ? <NoCardPilotTickets key={workspace.actor.id} userId={workspace.actor.id} refreshKey={ticketRefresh} request={request} /> : null}
      <aside className={styles.disclosure}><strong>Ticketing pilot</strong><p>Event organizers host and operate their events. EOD-HUB provides ticketing software. Pilot tickets are for testing; no money is collected.</p></aside>
    </main>
  </div>;
}
