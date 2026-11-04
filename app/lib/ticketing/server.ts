import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { Resend } from "resend";
import { findAuthUsersByEmail } from "@/app/lib/auth/adminAuthLookup";
import { isOwnerAdmin, OWNER_ADMIN_EMAIL } from "@/app/lib/ownerAdminAccess";
import { activeAssignment, assignedAccess, isTicketingIdentity, ticketingEmail, ticketingOrigin, TICKETING_COOKIE, TICKETING_ROLE, uuidPattern, type Assignment } from "./access";
import { cleanCoordinatorDraft, cleanTicketTypeDrafts, coordinatorProfileState, emptyEventDraft, eventFields, parseCoordinatorProfile, parseEventDraft, type CoordinatorProfile, type EventDraft } from "./event-intake";
import { accountActor,sharedAuthEnabled,requireSharedSchema } from "../account/server";

export class TicketingError extends Error { constructor(message: string, public status = 400) { super(message); } }
export const ticketingHeaders = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };
export const ticketingJson = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: ticketingHeaders });
export const hashTicketingSecret = (value: string) => createHash("sha256").update(value).digest("hex");
export function ticketingFailure(error: unknown) {
  if (error instanceof TicketingError) return ticketingJson({ error: error.message }, error.status);
  console.error("[ticketing] action failed", error instanceof Error ? error.name : "unknown");
  return ticketingJson({ error: "Could not complete that action. Please try again." }, 503);
}
export function checkTicketingDb(error: { code?: string; message: string } | null) {
  if (error?.code === "PT409" || error?.code === "40001") throw new TicketingError("This event changed on another device. Reload before saving.", 409);
  if (error?.code === "42501") throw new TicketingError("This account does not have permission for that action.", 403);
  if (error) throw new TicketingError("Could not save or load ticketing records. Please retry.", 503);
}
export function ticketingRequest(request: Request, write = false) {
  const origin = ticketingOrigin();
  const url = new URL(request.url);
  const authority = request.headers.get("host") ?? url.host;
  if (!origin || authority !== new URL(origin).host || /Capacitor/i.test(request.headers.get("user-agent") ?? "")) throw new TicketingError("Not found", 404);
  if (write && request.headers.get("origin") !== origin) throw new TicketingError("Use this ticketing site's form.", 403);
  return origin;
}
export function ticketingDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new TicketingError("Ticketing is temporarily unavailable.", 503);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: ticketingFetch } });
}
const ticketingFetch: typeof fetch = (input, init) => fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) });
export async function ticketingBody(request: Request, maximum = 35000): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new TicketingError("Use JSON.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new TicketingError("Missing request.");
  let size = 0; const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > maximum) { await reader.cancel(); throw new TicketingError("Request is too large.", 413); }
    chunks.push(value);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch { throw new TicketingError("Invalid request."); }
}
export async function ticketingLimit(db: SupabaseClient, scope: string, key: string, limit: number, seconds = 3600) {
  const result = await db.rpc("ticketing_consume_limit", { p_key: `${scope}:${hashTicketingSecret(key)}`, p_limit: limit, p_seconds: seconds });
  checkTicketingDb(result.error);
  if (!result.data) throw new TicketingError("Too many attempts. Please try again later.", 429);
}
export type TicketingActor = { db: SupabaseClient; user: User; account: { can_submit_events: boolean; profile: Record<string, unknown> | null }; admin: boolean; assignments: Assignment[] };
export async function ticketingActor(request: NextRequest): Promise<TicketingActor> {
  const origin = ticketingRequest(request), db = ticketingDatabase();
  const token = request.cookies.get(TICKETING_COOKIE)?.value;
  let actorId:string,sharedUser:User|null=null;
  if(sharedAuthEnabled()){
    try{await requireSharedSchema(db);const actor=await accountActor(request);if(!actor.emailVerified)throw new TicketingError("Verify your sign-in email first.",403);actorId=actor.user.id;sharedUser=actor.user;
      checkTicketingDb((await db.from("ticketing_accounts").upsert({user_id:actorId},{onConflict:"user_id",ignoreDuplicates:true})).error);
    }catch(error){throw new TicketingError(error instanceof Error?error.message:"Sign in to your account.",typeof (error as {status?:unknown}).status==="number"?(error as {status:number}).status:401);}
  }else{
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new TicketingError("Sign in to your event workspace.", 401);
    const session = await db.from("ticketing_sessions").select("user_id,expires_at,revoked_at,origin").eq("digest", hashTicketingSecret(token)).maybeSingle();
    checkTicketingDb(session.error);
    if (!session.data || session.data.revoked_at || Date.parse(session.data.expires_at) <= Date.now() || session.data.origin !== origin) throw new TicketingError("Your ticketing session expired. Request a new email link.", 401);
    actorId=session.data.user_id;
  }
  const [{ data: auth, error: authError }, account, assignments] = await Promise.all([
    sharedUser?Promise.resolve({data:{user:sharedUser},error:null}):db.auth.admin.getUserById(actorId),
    db.from("ticketing_accounts").select("active,can_submit_events,profile").eq("user_id", actorId).maybeSingle(),
    db.from("ticketing_assignments").select("id,event_id,user_id,role,expires_at,revoked_at").eq("user_id", actorId),
  ]);
  checkTicketingDb(account.error); checkTicketingDb(assignments.error);
  let organizerSuspended=false;
  if(sharedAuthEnabled()){
    const request=await db.from("portal_access_requests").select("status").eq("user_id",actorId).eq("portal","event_organizer").maybeSingle();checkTicketingDb(request.error);
    organizerSuspended=request.data?.status==="suspended";
    if(organizerSuspended && account.data)account.data.can_submit_events=false;
  }
  const banned = (auth.user as (User & { banned_until?: string }) | null)?.banned_until;
  if (authError || !auth.user?.email_confirmed_at || !account.data?.active || (banned && Date.parse(banned) > Date.now())) throw new TicketingError("This ticketing account is unavailable.", 403);
  const profile = await db.from("profiles").select("is_admin").eq("user_id", auth.user.id).maybeSingle();
  checkTicketingDb(profile.error);
  return { db, user: auth.user, account: account.data, admin: isOwnerAdmin({ userId: auth.user.id, email: auth.user.email, isAdmin: profile.data?.is_admin }), assignments: ((assignments.data ?? []) as Assignment[]).filter(row=>!organizerSuspended || row.role!=="coordinator") };
}
export function requireTicketingEvent(actor: TicketingActor, eventId: string, scan = false) {
  if (!uuidPattern.test(eventId) || (!actor.admin && !assignedAccess(actor.assignments, actor.user.id, eventId, scan))) throw new TicketingError("You are not assigned to this event.", 403);
}
const text = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
export function cleanDraft(body: Record<string, unknown>): EventDraft {
  const result = emptyEventDraft();
  for (const key of Object.keys(result) as (keyof EventDraft)[]) {
    if (key === "ticketTypes" || key === "wizardStep" || key === "_autosaveId") continue;
    if (key === "category") { result.category = body[key] === "Fitness" ? "Fitness" : "Community"; continue; }
    result[key] = text(body[key], key === "description" ? 5000 : key === "hostUrl" ? 500 : key === "flyerUrl" ? 250 : 254);
  }
  result.wizardStep = Number.isInteger(body.wizardStep) ? Math.max(0, Math.min(5, Number(body.wizardStep))) : 0;
  if (body.ticketTypes !== undefined) result.ticketTypes = cleanTicketTypeDrafts(body.ticketTypes);
  return result;
}
export async function requestTicketingSignIn(db: SupabaseClient, emailValue: unknown, origin: string, ip: string) {
  let email: string; try { email = ticketingEmail(emailValue); } catch (error) { throw new TicketingError((error as Error).message); }
  await ticketingLimit(db, "signin-ip", ip, 20);
  await ticketingLimit(db, "signin-email", email, 5);
  const generic = { ok: true, message: "If this email has pilot access, a sign-in link has been sent. Check your inbox and spam folder." };
  const allowed = new Set([OWNER_ADMIN_EMAIL, ...(process.env.TICKETING_TEST_EMAILS ?? "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean)]);
  if (!allowed.has(email)) {
    const pending = await db.from("ticketing_invitations").select("id").eq("email", email).is("revoked_at", null).is("accepted_at", null).gt("expires_at", new Date().toISOString()).limit(1);
    checkTicketingDb(pending.error);
    const { users, listError } = await findAuthUsersByEmail(db, email);
    if (listError) throw new TicketingError("Sign-in is temporarily unavailable.", 503);
    const existing = users.length === 1 ? await db.from("ticketing_accounts").select("active").eq("user_id", users[0].id).maybeSingle() : null;
    checkTicketingDb(existing?.error ?? null);
    if (!pending.data?.length && !existing?.data?.active) return generic;
  }
  if (process.env.TICKETING_EMAIL_ENABLED !== "1" || !process.env.RESEND_API_KEY) throw new TicketingError("Pilot email delivery is not enabled yet.", 503);
  let lookup = await findAuthUsersByEmail(db, email);
  if (lookup.listError || lookup.users.length > 1) throw new TicketingError("This email needs administrator review before ticketing sign-in.", 409);
  let user = lookup.users[0];
  if (!user) {
    const created = await db.auth.admin.createUser({ email, role: TICKETING_ROLE, email_confirm: false, app_metadata: { account_type: "ticketing_customer" } });
    if (created.error || !created.data.user) {
      lookup = await findAuthUsersByEmail(db, email);
      if (lookup.listError || lookup.users.length !== 1) throw new TicketingError("Could not prepare this account. Please retry.", 503);
      user = lookup.users[0];
    } else user = created.data.user;
    if (!isTicketingIdentity(user)) throw new TicketingError("Account setup requires administrator review.", 409);
  }
  // Ignore on conflict: sign-in must never reactivate a suspended account or
  // turn a customer into an organizer.
  checkTicketingDb((await db.from("ticketing_accounts").upsert({ user_id: user.id }, { onConflict: "user_id", ignoreDuplicates: true })).error);
  const account = await db.from("ticketing_accounts").select("active").eq("user_id", user.id).single(); checkTicketingDb(account.error);
  if (!account.data?.active) return generic;
  const link = await db.auth.admin.generateLink({ type: "magiclink", email });
  const token = link.data.properties?.hashed_token;
  if (link.error || !token || link.data.user.id !== user.id) throw new TicketingError("Could not prepare a sign-in email.", 503);
  checkTicketingDb((await db.from("ticketing_login_requests").insert({ digest: hashTicketingSecret(token), user_id: user.id, origin, expires_at: new Date(Date.now() + 30 * 60000).toISOString() })).error);
  const url = `${origin}/ticketing/access#token_hash=${encodeURIComponent(token)}`;
  const sent = await new Resend(process.env.RESEND_API_KEY).emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "EOD-HUB <noreply@resend.dev>", to: email, subject: "EOD-HUB Events: your pilot sign-in link",
    text: `Sign in to the EOD-HUB ticketing pilot:\n${url}\n\nOpen the link to sign in and go directly to your event workspace. It expires in 30 minutes and works once. No password is needed. This does not enroll you as a Hub community member. Live ticket sales are disabled. Ignore this email if you did not request it.`,
  });
  checkTicketingDb((await db.from("ticketing_email_log").insert({ user_id: user.id, kind: "signin", delivered_to_provider: !sent.error })).error);
  if (sent.error) throw new TicketingError("The sign-in email could not be sent. Please request another link.", 503);
  return generic;
}
export async function verifyTicketingSignIn(db: SupabaseClient, tokenValue: unknown, origin: string) {
  if (typeof tokenValue !== "string" || !/^[A-Za-z0-9_-]{32,200}$/.test(tokenValue)) throw new TicketingError("This sign-in link is invalid or expired.", 401);
  const digest = hashTicketingSecret(tokenValue);
  const request = await db.from("ticketing_login_requests").select("user_id,expires_at,consumed_at,origin").eq("digest", digest).maybeSingle(); checkTicketingDb(request.error);
  if (!request.data || request.data.origin !== origin || request.data.consumed_at || Date.parse(request.data.expires_at) <= Date.now()) throw new TicketingError("This sign-in link is invalid or expired. Request a new link.", 401);
  // verifyOtp changes its client's session. Keep it off the privileged client.
  const verifier = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: ticketingFetch } });
  const verification = await verifier.auth.verifyOtp({ token_hash: tokenValue, type: "email" });
  if (verification.error || !verification.data.user?.email_confirmed_at || verification.data.user.id !== request.data.user_id) throw new TicketingError("This sign-in link is invalid or expired. Request a new link.", 401);
  const secret = randomBytes(32).toString("base64url");
  const result = await db.rpc("ticketing_start_session", { p_digest: digest, p_actor: verification.data.user.id, p_origin: origin, p_session_digest: hashTicketingSecret(secret) });
  checkTicketingDb(result.error); if (!result.data) throw new TicketingError("This link was already used. Request a new link.", 401);
  // Do not put the Supabase access/refresh tokens in a browser or replace Hub
  // cookies. Only the separate revocable, hashed ticketing capability is used.
  return secret;
}
export async function ticketingWorkspace(actor: TicketingActor) {
  const { db } = actor;
  const visibleIds = [...new Set(actor.assignments.filter(row => activeAssignment(row)).map(row => row.event_id))];
  let query = db.from("ticketing_events").select("*").order("created_at", { ascending: false });
  if (!actor.admin) query = query.in("id", visibleIds.length ? visibleIds : ["00000000-0000-0000-0000-000000000000"]);
  const result = await query; checkTicketingDb(result.error);
  const events = (result.data ?? []).map(event => {
    const manage = actor.admin || assignedAccess(actor.assignments, actor.user.id, event.id);
    return manage ? { ...event, can_manage: true } : { id: event.id, event: event.event ? { title: event.event.title, startsAt: event.event.startsAt, endsAt: event.event.endsAt, timeZone: event.event.timeZone, location: event.event.location } : { title: event.draft.title || "Unsubmitted event" }, can_manage: false };
  });
  const managedIds = events.filter(event => event.can_manage).map(event => event.id);
  let staff: Array<Record<string, unknown>> = [], audit: Array<Record<string, unknown>> = [], invitations: Array<Record<string, unknown>> = [];
  if (actor.admin || managedIds.length) {
    let s = db.from("ticketing_assignments").select("id,event_id,user_id,role,expires_at,revoked_at");
    let a = db.from("ticketing_audit").select("id,event_id,actor_id,action,details,created_at").order("created_at", { ascending: false }).limit(100);
    let i = db.from("ticketing_invitations").select("id,email,role,event_id,expires_at,accepted_at,revoked_at").order("created_at", { ascending: false }).limit(100);
    if (!actor.admin) { s = s.in("event_id", managedIds); a = a.in("event_id", managedIds); i = i.in("event_id", managedIds); }
    const [sr, ar, ir] = await Promise.all([s, a, i]); [sr, ar, ir].forEach(value => checkTicketingDb(value.error));
    staff = sr.data ?? []; audit = ar.data ?? []; invitations = ir.data ?? [];
    const identities = await Promise.all([...new Set(staff.map(row => String(row.user_id)))].map(async id => {
      const result = await db.auth.admin.getUserById(id);
      return [id, result.data.user?.email ?? "Unavailable account"] as const;
    }));
    const emails = new Map(identities);
    staff = staff.map(row => ({ ...row, email: emails.get(String(row.user_id)) }));
  }
  return { actor: { id: actor.user.id, email: actor.user.email, admin: actor.admin, can_create: actor.admin || actor.account.can_submit_events }, ...coordinatorProfileState(actor.account.profile, actor.user.email!), events, staff, audit, invitations, mode: "pilot", checkoutEnabled: false };
}
export async function ticketingCommand(actor: TicketingActor, body: Record<string, unknown>) {
  const { db, user } = actor;
  if (body.editorUserId !== undefined && body.editorUserId !== user.id) throw new TicketingError("Your sign-in changed. Reopen the editor with the account that started this draft.", 403);
  const autosave = body.action === "save-draft" || body.action === "save-profile-draft";
  await ticketingLimit(db, autosave ? "autosave" : "workspace", user.id, autosave ? 240 : 120, 600);
  if (body.action === "save-profile-draft") {
    const pending = cleanCoordinatorDraft(body, user.email!);
    let profile: CoordinatorProfile | null = null;
    try { profile = parseCoordinatorProfile(pending, user.email!); } catch { /* Preserve incomplete organizer details without treating them as submission-ready. */ }
    const previous = coordinatorProfileState(actor.account.profile, user.email!).profile;
    checkTicketingDb((await db.from("ticketing_accounts").update({ profile: profile ?? { ...previous, _draft: pending } }).eq("user_id", user.id)).error);
    return { profile: profile ?? previous, profileDraft: profile ? null : pending };
  }
  if (body.action === "save-profile") {
    let profile; try { profile = parseCoordinatorProfile(body, user.email!); } catch (error) { throw new TicketingError((error as Error).message); }
    checkTicketingDb((await db.from("ticketing_accounts").update({ profile }).eq("user_id", user.id)).error);
    return { ok: true };
  }
  if (["save-draft", "create-event", "revise-event"].includes(String(body.action))) {
    if (body.draftId && body.action !== "save-draft") throw new TicketingError("Use a saved event before submitting.");
    const id = body.eventId ? String(body.eventId) : body.draftId ? String(body.draftId) : randomUUID();
    if (!uuidPattern.test(id)) throw new TicketingError("Invalid event.");
    if (body.eventId && (!Number.isInteger(body.expectedRevision) || Number(body.expectedRevision) < 1)) throw new TicketingError("Reload this event before saving.", 409);
    if (body.eventId) requireTicketingEvent(actor, id);
    else if (!actor.admin && !actor.account.can_submit_events) throw new TicketingError("An organizer invitation is required to create an event.", 403);
    let draft: EventDraft;
    try { draft = cleanDraft((body.draft ?? body) as Record<string, unknown>); } catch (error) { throw new TicketingError((error as Error).message); }
    if (body.action === "save-draft" && body.writeId !== undefined) {
      if (!uuidPattern.test(String(body.writeId))) throw new TicketingError("Invalid save identifier.");
      const prior = await db.from("ticketing_events").select("id,created_by,revision,draft,review_status").eq("id", id).maybeSingle();
      checkTicketingDb(prior.error);
      if (prior.data) {
        requireTicketingEvent(actor, id);
        if (!body.eventId && prior.data.created_by !== user.id) throw new TicketingError("This draft belongs to another account.", 403);
        if (prior.data.review_status === "draft" && prior.data.draft?._autosaveId === body.writeId) return { id, revision: prior.data.revision };
        if (!body.eventId) throw new TicketingError("This draft was saved in another tab. Reload before saving.", 409);
      }
      draft._autosaveId = String(body.writeId);
    }
    if (draft.flyerUrl) {
      if (!/^\/api\/ticketing\/flyer\?id=[0-9a-f-]{36}$/.test(draft.flyerUrl)) throw new TicketingError("Use an image uploaded through this event wizard.");
      const flyerId = new URL(draft.flyerUrl, "https://example.invalid").searchParams.get("id");
      const flyer = flyerId ? await db.from("ticketing_flyers").select("uploader_id").eq("id", flyerId).maybeSingle() : null;
      checkTicketingDb(flyer?.error ?? null);
      // Reusing an attached flyer within the same authorized event is allowed.
      const existing = body.eventId ? await db.from("ticketing_events").select("draft").eq("id", id).maybeSingle() : null;
      checkTicketingDb(existing?.error ?? null);
      if (!flyer?.data || (!actor.admin && flyer.data.uploader_id !== user.id && existing?.data?.draft?.flyerUrl !== draft.flyerUrl)) throw new TicketingError("Use your own uploaded flyer.", 403);
    }
    const submit = body.action !== "save-draft";
    let event = null;
    if (submit) {
      if (!coordinatorProfileState(actor.account.profile, user.email!).profile) throw new TicketingError("Complete your coordinator profile first.");
      if (body.confirmContact !== true || body.confirmAuthority !== true) throw new TicketingError("Confirm your public contact and authority to list this event.");
      try { event = eventFields(parseEventDraft(draft)); } catch (error) { throw new TicketingError((error as Error).message); }
    }
    const result = await db.rpc("ticketing_save_event", { p_actor: user.id, p_id: id, p_expected: body.eventId ? Number(body.expectedRevision) : 0, p_draft: draft, p_event: event, p_submit: submit });
    if (result.error?.code === "23505") throw new TicketingError("This draft was saved in another tab. Reload before saving.", 409);
    checkTicketingDb(result.error); return { id, revision: result.data.revision };
  }
  if (body.action === "review-event") {
    if (!uuidPattern.test(String(body.eventId)) || !Number.isInteger(body.expectedRevision) || Number(body.expectedRevision) < 1 || !["approved", "changes_requested", "rejected"].includes(String(body.decision))) throw new TicketingError("Reload this event and choose a review decision.", 409);
    if (body.decision !== "approved" && text(body.note, 1500).length < 3) throw new TicketingError("Add a short note explaining the changes or rejection.");
    const result = await db.rpc("ticketing_review_event", { p_actor: user.id, p_id: String(body.eventId), p_expected: Number(body.expectedRevision), p_decision: String(body.decision), p_note: text(body.note, 1500) });
    checkTicketingDb(result.error); return { ok: true };
  }
  if (body.action === "invite") {
    let email; try { email = ticketingEmail(body.email); } catch (error) { throw new TicketingError((error as Error).message); }
    const role = String(body.role), eventId = body.eventId ? String(body.eventId) : null;
    if (!["customer", "coordinator", "checkin_staff"].includes(role) || (eventId && !uuidPattern.test(eventId))) throw new TicketingError("Choose a valid invitation.");
    if(sharedAuthEnabled()&&!actor.admin){if(!eventId)throw new TicketingError("Choose an assigned event.",403);requireTicketingEvent(actor,eventId);}
    const secret = randomBytes(32).toString("base64url");
    let expiry = null;
    if (role === "checkin_staff") {
      const value = Date.parse(String(body.expiresAt));
      if (!Number.isFinite(value) || value <= Date.now()) throw new TicketingError("Choose a future operator-access expiration.");
      expiry = new Date(value).toISOString();
    }
    const result = await db.rpc("ticketing_invite", { p_actor: user.id, p_email: email, p_role: role, p_event: eventId, p_digest: hashTicketingSecret(secret), p_access_until: expiry });
    checkTicketingDb(result.error);
    return { url: `${ticketingOrigin()}/ticketing/access#invitation=${secret}`, email, message: "Invitation prepared. Share this link with the invited email's owner. No invitation email has been sent." };
  }
  if (body.action === "accept-invite") {
    if (typeof body.token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(body.token)) throw new TicketingError("Invalid invitation.");
    const result = await db.rpc("ticketing_accept_invite", { p_actor: user.id, p_digest: hashTicketingSecret(body.token), p_verified_email: user.email! });
    checkTicketingDb(result.error); if (!result.data) throw new TicketingError("This invitation has already been used by another identity.", 403);
    return { ok: true };
  }
  if (body.action === "revoke") {
    if (!uuidPattern.test(String(body.assignmentId))) throw new TicketingError("Invalid assignment.");
    if(sharedAuthEnabled()&&!actor.admin){const assignment=await db.from("ticketing_assignments").select("event_id").eq("id",String(body.assignmentId)).maybeSingle();checkTicketingDb(assignment.error);if(!assignment.data)throw new TicketingError("Assignment not found.",404);requireTicketingEvent(actor,assignment.data.event_id);}
    const result = await db.rpc("ticketing_revoke_assignment", { p_actor: user.id, p_id: String(body.assignmentId) });
    checkTicketingDb(result.error); return { ok: !!result.data };
  }
  if (body.action === "cancel-invite") {
    const invitation = await db.from("ticketing_invitations").select("role,event_id").eq("id", String(body.invitationId)).maybeSingle(); checkTicketingDb(invitation.error);
    if (!invitation.data || (!actor.admin && (invitation.data.role !== "checkin_staff" || !assignedAccess(actor.assignments, user.id, invitation.data.event_id)))) throw new TicketingError("Access denied.", 403);
    checkTicketingDb((await db.from("ticketing_invitations").update({ revoked_at: new Date().toISOString() }).eq("id", String(body.invitationId))).error);
    return { ok: true };
  }
  throw new TicketingError("This pilot action is not available yet.");
}
