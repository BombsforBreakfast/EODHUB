"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../lib/lib/supabaseClient";
import ImageCropDialog from "../components/ImageCropDialog";
import { ASPECT_EVENT_COVER } from "../lib/imageCropTargets";
import { useTheme } from "../lib/ThemeContext";
import EventAttendeeAvatarRows from "../components/events/EventAttendeeAvatarRows";
import { EventAttendeesListModal } from "../components/events/EventAttendeesListModal";
import { fetchEventAttendeePreviews } from "../lib/fetchEventAttendeePreviews";
import type { PostLikerBrief } from "../components/PostLikersStack";

type CalendarEvent = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  date: string;
  organization: string | null;
  signup_url: string | null;
  image_url: string | null;
  location: string | null;
  event_time: string | null;
  poc_name: string | null;
  poc_phone: string | null;
  created_at: string;
};

type Memorial = {
  id: string;
  user_id: string;
  name: string;
  bio: string | null;
  photo_url: string | null;
  death_date: string;
  created_at: string;
  source_url: string | null;
};

type AttendanceRow = {
  event_id: string;
  user_id: string;
  status: "interested" | "going";
};

const EVENT_COLUMNS =
  "id, user_id, title, description, date, organization, signup_url, image_url, location, event_time, poc_name, poc_phone, created_at";
const MEMORIAL_COLUMNS =
  "id, user_id, name, bio, photo_url, death_date, created_at, source_url";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Fixed row height for month + week grid so cells never grow with long titles or many items */
const CALENDAR_FIXED_CELL_HEIGHT = 120;

const MAX_VISIBLE_EVENT_PILLS = 2;

function toDateStr(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function anniversaryDate(deathDate: string, year: number) {
  const parts = deathDate.split("-");
  return `${year}-${parts[1]}-${parts[2]}`;
}

function formatEventDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** yyyy-mm-dd → mm/dd/yyyy for the Add Event date control */
function formatShortUsDateFromIso(iso: string) {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

function httpsAssetUrl(url: string | null | undefined): string {
  if (!url?.trim()) return "";
  const u = url.trim();
  if (u.startsWith("http://")) return `https://${u.slice(7)}`;
  return u;
}

function isMissingDbColumn(err: unknown, column: string): boolean {
  const m = String((err as { message?: string } | null)?.message ?? "").toLowerCase();
  return m.includes(column.toLowerCase()) && (m.includes("column") || m.includes("schema"));
}

export default function EventsPage() {
  // useSearchParams must be inside a Suspense boundary so Next.js doesn't
  // bail the whole route out of static rendering at build time.
  return (
    <Suspense fallback={null}>
      <EventsPageInner />
    </Suspense>
  );
}

function EventsPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const deepLinkEventId = searchParams?.get("event") ?? null;
  const deepLinkAdd = searchParams?.get("add")?.toLowerCase() ?? null;
  const today = new Date();

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [calendarView, setCalendarView] = useState<"month" | "week">("month");
  const [weekStart, setWeekStart] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay());
    return d;
  });

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [memorials, setMemorials] = useState<Memorial[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [allUpcomingEvents, setAllUpcomingEvents] = useState<CalendarEvent[]>([]);

  const [savedEventIds, setSavedEventIds] = useState<Set<string>>(new Set());

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [selectedMemorial, setSelectedMemorial] = useState<Memorial | null>(null);
  /** YYYY-MM-DD: month grid “+N more” opens a scrollable list of all events for that day */
  const [dayEventsListModal, setDayEventsListModal] = useState<string | null>(null);

  const [attendance, setAttendance] = useState<Record<string, { interested: number; going: number }>>({});
  const [myAttendance, setMyAttendance] = useState<Record<string, "interested" | "going" | null>>({});
  const [attendeesListModal, setAttendeesListModal] = useState<{ eventId: string; status: "interested" | "going" } | null>(null);
  const [attendeePreviews, setAttendeePreviews] = useState<Record<string, { going: PostLikerBrief[]; interested: PostLikerBrief[] }>>({});

  const [showEventForm, setShowEventForm] = useState(false);
  const [eventForm, setEventForm] = useState({
    title: "",
    description: "",
    date: "",
    organization: "",
    signup_url: "",
    location: "",
    event_time: "",
    poc_name: "",
    poc_phone: "",
  });
  const [submittingEvent, setSubmittingEvent] = useState(false);
  const eventPhotoInputRef = useRef<HTMLInputElement>(null);
  const eventDateInputRef = useRef<HTMLInputElement>(null);
  const [eventCoverCropOpen, setEventCoverCropOpen] = useState(false);
  const [eventCoverCropSrc, setEventCoverCropSrc] = useState<string | null>(null);
  const [eventCoverUrl, setEventCoverUrl] = useState<string | null>(null);
  const [uploadingEventCover, setUploadingEventCover] = useState(false);

  const [showMemorialForm, setShowMemorialForm] = useState(false);
  const [memWizUrl, setMemWizUrl] = useState("");
  const [memWizName, setMemWizName] = useState("");
  const [memWizDate, setMemWizDate] = useState("");
  const [memWizBio, setMemWizBio] = useState("");
  const [memWizImage, setMemWizImage] = useState("");
  const [memWizFetching, setMemWizFetching] = useState(false);
  const [memWizSaving, setMemWizSaving] = useState(false);
  const [memWizMsg, setMemWizMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const { t, isDark } = useTheme();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();

  const weekEnd = useMemo(() => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 6);
    return d;
  }, [weekStart]);

  const calendarCells: (Date | null)[] = useMemo(() => {
    if (calendarView === "week") {
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        return d;
      });
    }
    const cells: (Date | null)[] = Array(firstDayOfMonth).fill(null);
    for (let i = 1; i <= daysInMonth; i++) cells.push(new Date(year, month, i));
    return cells;
  }, [calendarView, weekStart, year, month, daysInMonth, firstDayOfMonth]);

  const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate());

  const rangeStartStr = useMemo(() => {
    const d = calendarView === "week" ? weekStart : new Date(year, month, 1);
    return toDateStr(d.getFullYear(), d.getMonth(), d.getDate());
  }, [calendarView, weekStart, year, month]);

  const rangeEndStr = useMemo(() => {
    const d = calendarView === "week" ? weekEnd : new Date(year, month, daysInMonth);
    return toDateStr(d.getFullYear(), d.getMonth(), d.getDate());
  }, [calendarView, weekEnd, year, month, daysInMonth]);

  async function loadEvents(): Promise<CalendarEvent[]> {
    const { data, error } = await supabase
      .from("events")
      .select(EVENT_COLUMNS)
      .gte("date", rangeStartStr)
      .lte("date", rangeEndStr)
      .order("date", { ascending: true });

    if (error) { console.error("Events load error:", error); return []; }
    const result = (data ?? []) as CalendarEvent[];
    setEvents(result);
    return result;
  }

  async function loadAttendance(eventIds: string[], uid: string | null) {
    if (eventIds.length === 0) return;
    const { data } = await supabase
      .from("event_attendance")
      .select("event_id, user_id, status")
      .in("event_id", eventIds);

    const rows = (data ?? []) as AttendanceRow[];
    const counts: Record<string, { interested: number; going: number }> = {};
    const mine: Record<string, "interested" | "going" | null> = {};

    rows.forEach((r) => {
      if (!counts[r.event_id]) counts[r.event_id] = { interested: 0, going: 0 };
      counts[r.event_id][r.status]++;
      if (uid && r.user_id === uid) mine[r.event_id] = r.status;
    });

    setAttendance((prev) => ({ ...prev, ...counts }));
    setMyAttendance((prev) => ({ ...prev, ...mine }));
  }

  const loadAttendeePreviewsFor = useCallback(async (eventId: string) => {
    const { going, interested } = await fetchEventAttendeePreviews(supabase, eventId);
    setAttendeePreviews((prev) => ({ ...prev, [eventId]: { going, interested } }));
  }, []);

  /**
   * Re-fetch RSVP truth for a single event from the DB, so the counts &
   * "my status" buttons can never drift from Postgres. Called after every
   * toggle — makes us robust against:
   *   - optimistic +1/-1 math starting from a stale baseline
   *   - silent insert failures (RLS block, unique-constraint collision)
   *   - multi-device races (you RSVP on one tab, wife RSVPs on another)
   */
  async function refreshAttendanceFor(eventId: string) {
    const { data, error } = await supabase
      .from("event_attendance")
      .select("user_id, status")
      .eq("event_id", eventId);
    if (error) {
      console.error("refreshAttendanceFor error:", error);
      return;
    }
    const rows = (data ?? []) as { user_id: string; status: "interested" | "going" }[];
    let interested = 0;
    let going = 0;
    let mine: "interested" | "going" | null = null;
    for (const r of rows) {
      if (r.status === "interested") interested++;
      else if (r.status === "going") going++;
      if (userId && r.user_id === userId) mine = r.status;
    }
    setAttendance((prev) => ({ ...prev, [eventId]: { interested, going } }));
    setMyAttendance((prev) => ({ ...prev, [eventId]: mine }));
    void loadAttendeePreviewsFor(eventId);
  }

  /**
   * Saved Events follows RSVP automatically — there's no separate "Save"
   * button on the events page anymore.
   *   hasRsvp=true  → ensure a saved_events row exists (idempotent)
   *   hasRsvp=false → delete the saved_events row if present
   * This lets us treat Interested / Going as the single user signal.
   */
  async function syncSavedEventForRsvp(eventId: string, hasRsvp: boolean) {
    if (!userId) return;
    if (hasRsvp) {
      const { error } = await supabase
        .from("saved_events")
        .insert([{ user_id: userId, event_id: eventId }]);
      // 23505 = unique_violation — already saved, that's fine.
      if (error && error.code !== "23505") {
        console.error("Auto-save event error:", error);
        return;
      }
      setSavedEventIds((prev) => new Set(prev).add(eventId));
    } else {
      const { error } = await supabase
        .from("saved_events")
        .delete()
        .eq("user_id", userId)
        .eq("event_id", eventId);
      if (error) {
        console.error("Auto-unsave event error:", error);
        return;
      }
      setSavedEventIds((prev) => {
        const next = new Set(prev);
        next.delete(eventId);
        return next;
      });
    }
  }

  async function toggleAttendance(eventId: string, status: "interested" | "going") {
    if (!userId) { window.location.href = "/login"; return; }
    const current = myAttendance[eventId] ?? null;

    try {
      if (current === status) {
        // Toggle off — remove my RSVP row entirely. Saved Events auto-syncs
        // off below, so the user doesn't end up with phantom saves they
        // never explicitly created.
        const { error } = await supabase
          .from("event_attendance")
          .delete()
          .eq("event_id", eventId)
          .eq("user_id", userId);
        if (error) throw error;
        await syncSavedEventForRsvp(eventId, false);
      } else {
        // Upsert lets us go from "no row" → going, or interested → going,
        // in one call without ever colliding with the
        // UNIQUE(event_id, user_id) constraint (which was silently breaking
        // the old insert-on-switch branch).
        const { error } = await supabase
          .from("event_attendance")
          .upsert(
            [{ event_id: eventId, user_id: userId, status }],
            { onConflict: "event_id,user_id" }
          );
        if (error) throw error;
        // Auto-save on either Interested OR Going — the user is showing
        // intent, so the event belongs in their saved list.
        await syncSavedEventForRsvp(eventId, true);
      }
    } catch (err) {
      console.error("toggleAttendance failed:", err);
      alert(err instanceof Error ? err.message : "Could not update your RSVP. Please try again.");
    }

    // Always pull fresh truth from the DB so the counts shown on screen
    // reflect what Postgres actually has — never local +1/-1 math.
    await refreshAttendanceFor(eventId);
  }

  function getNext5pm(): string {
    const now = new Date();
    const target = new Date(now);
    target.setHours(17, 0, 0, 0);
    if (now >= target) target.setDate(target.getDate() + 1);
    return target.toISOString();
  }

  async function loadAllUpcomingEvents() {
    const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate());
    const { data, error } = await supabase
      .from("events")
      .select(EVENT_COLUMNS)
      .gte("date", todayStr)
      .order("date", { ascending: true });
    if (error) { console.error("Upcoming events load error:", error); return; }
    const result = (data ?? []) as CalendarEvent[];
    setAllUpcomingEvents(result);
    if (result.length > 0) {
      await loadAttendance(result.map((e) => e.id), userId);
    }
  }

  async function loadMemorials() {
    const { data, error } = await supabase
      .from("memorials")
      .select(MEMORIAL_COLUMNS)
      .order("death_date", { ascending: true });

    if (error) {
      console.error("Memorials load error:", error);
      return;
    }

    setMemorials((data ?? []) as Memorial[]);
  }

  async function loadSavedEvents(uid: string) {
    const { data, error } = await supabase
      .from("saved_events")
      .select("event_id")
      .eq("user_id", uid);

    if (error) {
      console.error("Saved events load error:", error);
      return;
    }

    setSavedEventIds(new Set((data ?? []).map((r: { event_id: string }) => r.event_id)));
  }

  function closeEventCoverCrop() {
    if (eventCoverCropSrc) URL.revokeObjectURL(eventCoverCropSrc);
    setEventCoverCropSrc(null);
    setEventCoverCropOpen(false);
  }

  async function uploadEventCoverBlob(blob: Blob) {
    setUploadingEventCover(true);
    try {
      const file = new File([blob], "event-cover.jpg", { type: "image/jpeg" });
      const path = `event-covers/${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}.jpg`;
      const { error } = await supabase.storage.from("feed-images").upload(path, file, { upsert: false });
      if (error) throw new Error(error.message);
      const { data } = supabase.storage.from("feed-images").getPublicUrl(path);
      setEventCoverUrl(data.publicUrl);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingEventCover(false);
    }
  }

  function onPickEventPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!f || !f.type.startsWith("image/")) return;
    if (eventCoverCropSrc) URL.revokeObjectURL(eventCoverCropSrc);
    setEventCoverCropSrc(URL.createObjectURL(f));
    setEventCoverCropOpen(true);
  }

  // Saved Events auto-sync from RSVP state via syncSavedEventForRsvp().
  // To unsave an event a user can clear their Interested / Going status,
  // or remove it from the Saved Events list in My Account.

  async function submitEvent() {
    if (!userId) {
      window.location.href = "/login";
      return;
    }

    if (!eventForm.title.trim() || !eventForm.date) return;

    try {
      setSubmittingEvent(true);

      let insertRow: Record<string, unknown> = {
        user_id: userId,
        title: eventForm.title.trim(),
        description: eventForm.description.trim() || null,
        date: eventForm.date,
        organization: eventForm.organization.trim() || null,
        signup_url: eventForm.signup_url.trim() || null,
        image_url: eventCoverUrl?.trim() || null,
        location: eventForm.location.trim() || null,
        event_time: eventForm.event_time.trim() || null,
        poc_name: eventForm.poc_name.trim() || null,
        poc_phone: eventForm.poc_phone.trim() || null,
      };

      let { data: insertedEvent, error } = await supabase.from("events").insert([insertRow]).select("id").single();

      // Strip optional columns if the DB hasn't been migrated yet — keeps Add Event
      // working in environments that haven't run the location/time/POC migration.
      const optionalCols = ["image_url", "location", "event_time", "poc_name", "poc_phone"] as const;
      for (const col of optionalCols) {
        if (error && isMissingDbColumn(error, col)) {
          const { [col]: _drop, ...rest } = insertRow;
          insertRow = rest;
          ({ data: insertedEvent, error } = await supabase.from("events").insert([insertRow]).select("id").single());
        }
      }

      if (error) {
        alert(error.message);
        return;
      }

      const newEventId = insertedEvent?.id as string | undefined;

      // Create a feed post scheduled for next 5pm
      const formattedDate = formatEventDate(eventForm.date);
      const pocLine =
        eventForm.poc_name.trim() && eventForm.poc_phone.trim()
          ? `${eventForm.poc_name.trim()} — ${eventForm.poc_phone.trim()}`
          : eventForm.poc_name.trim() || eventForm.poc_phone.trim() || "";
      const lines = [
        `📅 New Event: ${eventForm.title.trim()}`,
        `📆 ${formattedDate}`,
        eventForm.event_time.trim() ? `🕒 ${eventForm.event_time.trim()}` : null,
        eventForm.location.trim() ? `📍 ${eventForm.location.trim()}` : null,
        eventForm.organization.trim() ? `🏢 ${eventForm.organization.trim()}` : null,
        pocLine ? `📞 POC: ${pocLine}` : null,
        eventForm.description.trim() ? `\n${eventForm.description.trim()}` : null,
        eventForm.signup_url.trim() ? `\nSign up: ${eventForm.signup_url.trim()}` : null,
      ].filter(Boolean);

      const postPayload: Record<string, unknown> = {
        user_id: userId,
        content: lines.join("\n"),
        created_at: getNext5pm(),
      };
      if (newEventId) postPayload.event_id = newEventId;

      let { error: postErr } = await supabase.from("posts").insert([postPayload]);
      if (postErr && newEventId && isMissingDbColumn(postErr, "event_id")) {
        const { event_id: _e, ...fallback } = postPayload;
        postErr = (await supabase.from("posts").insert([fallback])).error;
      }
      if (postErr) {
        console.error("Event feed post error:", postErr);
      }

      setEventForm({ title: "", description: "", date: "", organization: "", signup_url: "", location: "", event_time: "", poc_name: "", poc_phone: "" });
      setEventCoverUrl(null);
      setShowEventForm(false);
      await Promise.all([loadEvents(), loadAllUpcomingEvents()]);
    } finally {
      setSubmittingEvent(false);
    }
  }

  async function fetchMemorialMeta() {
    if (!memWizUrl.trim()) return;
    setMemWizFetching(true);
    setMemWizMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/memorial-meta", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
        body: JSON.stringify({ url: memWizUrl.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Fetch failed");
      if (json.title) setMemWizName(json.title);
      if (json.description) {
        const m = json.description.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (m) setMemWizDate(`${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`);
      }
      if (json.image) setMemWizImage(json.image);
      if (json.bio) setMemWizBio(json.bio);
    } catch (err) {
      setMemWizMsg({ type: "err", text: `Could not fetch metadata — fill in manually. (${err instanceof Error ? err.message : String(err)})` });
    } finally {
      setMemWizFetching(false);
    }
  }

  async function saveMemorial() {
    if (!userId) { window.location.href = "/login"; return; }
    if (!memWizName.trim() || !memWizDate) return;
    setMemWizSaving(true);
    setMemWizMsg(null);
    try {
      const source_url = memWizUrl.trim() || null;
      if (source_url) {
        const { data: existing } = await supabase.from("memorials").select("id").eq("source_url", source_url).maybeSingle();
        if (existing) { setMemWizMsg({ type: "err", text: "Already added." }); return; }
      }
      const { error } = await supabase.from("memorials").insert([{
        user_id: userId,
        name: memWizName.trim(),
        death_date: memWizDate,
        source_url,
        bio: memWizBio.trim() || null,
        photo_url: memWizImage.trim() || null,
      }]);
      if (error) throw new Error(error.message);
      setMemWizMsg({ type: "ok", text: `${memWizName.trim()} added.` });
      setMemWizUrl(""); setMemWizName(""); setMemWizDate(""); setMemWizBio(""); setMemWizImage("");
      await loadMemorials();
    } catch (err) {
      setMemWizMsg({ type: "err", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setMemWizSaving(false);
    }
  }

  function prevMonth() {
    if (month === 0) {
      setYear((y) => y - 1);
      setMonth(11);
    } else {
      setMonth((m) => m - 1);
    }
    setSelectedDay(null);
    setSelectedEvent(null);
  }

  function nextMonth() {
    if (month === 11) {
      setYear((y) => y + 1);
      setMonth(0);
    } else {
      setMonth((m) => m + 1);
    }
    setSelectedDay(null);
    setSelectedEvent(null);
  }

  function prevWeek() {
    setWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 7);
      return d;
    });
    setSelectedDay(null);
    setSelectedEvent(null);
  }

  function nextWeek() {
    setWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 7);
      return d;
    });
    setSelectedDay(null);
    setSelectedEvent(null);
  }

  function prevRange() {
    if (calendarView === "week") prevWeek();
    else prevMonth();
  }

  function nextRange() {
    if (calendarView === "week") nextWeek();
    else nextMonth();
  }

  function switchToWeekView() {
    const base = new Date(year, month, 1);
    if (base.getMonth() === today.getMonth() && base.getFullYear() === today.getFullYear()) {
      const d = new Date(today);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - d.getDay());
      setWeekStart(d);
    } else {
      const d = new Date(year, month, 1);
      d.setDate(d.getDate() - d.getDay());
      setWeekStart(d);
    }
    setCalendarView("week");
    setSelectedDay(null);
    setSelectedEvent(null);
  }

  function switchToMonthView() {
    setYear(weekStart.getFullYear());
    setMonth(weekStart.getMonth());
    setCalendarView("month");
    setSelectedDay(null);
    setSelectedEvent(null);
  }

  useEffect(() => {
    async function init() {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;

      setUserId(uid);

      // Fire-and-forget: purge past events (memorials are unaffected)
      if (uid) {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.access_token) {
            fetch("/api/cleanup-events", {
              method: "POST",
              headers: { Authorization: `Bearer ${session.access_token}` },
            }).catch((err) => console.error("cleanup-events error:", err));
          }
        });
      }

      const [eventsResult] = await Promise.all([
        loadEvents(),
        loadMemorials(),
        loadAllUpcomingEvents(),
        uid ? loadSavedEvents(uid) : Promise.resolve(),
      ]);
      if (eventsResult && eventsResult.length > 0) {
        await loadAttendance(eventsResult.map((e) => e.id), uid);
      }

      setLoading(false);
    }

    init();
  }, []);

  useEffect(() => {
    if (!loading) {
      loadEvents().then((eventsResult) => {
        if (eventsResult.length > 0) loadAttendance(eventsResult.map((e) => e.id), userId);
      });
    }
  }, [year, month, calendarView, weekStart]);

  // Deep-link handler: `/events?event=<id>` (used by saved-event cards in
  // MasterLeftColumn so a saved event opens the SAME modal as the calendar).
  // We try the in-memory caches first, then fall back to a direct Supabase
  // lookup so events that aren't in the current calendar window still work.
  // The URL is scrubbed once opened so a refresh doesn't re-pop the modal
  // unexpectedly.
  // Deep-link handler: `/events?event=<id>` (used by saved-event cards in
  // MasterLeftColumn so a saved event opens the SAME modal as the calendar).
  // We use `useSearchParams` rather than reading `window.location.search`
  // directly so this also works when the user is ALREADY on /events and the
  // URL changes via client-side soft-navigation (no remount). We fetch
  // straight from Supabase so it works even if the event is outside the
  // currently-loaded calendar window. The URL is scrubbed once opened so a
  // refresh won't re-pop the modal.
  useEffect(() => {
    if (!deepLinkEventId) return;
    if (typeof window === "undefined") return;

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("events")
        .select(EVENT_COLUMNS)
        .eq("id", deepLinkEventId)
        .maybeSingle();
      if (cancelled) return;
      if (!error && data) {
        const ev = data as CalendarEvent;
        setSelectedEvent(ev);
        void loadAttendance([ev.id], userId);
      }
      // Scrub the param so refresh / back doesn't re-trigger the modal.
      const url = new URL(window.location.href);
      url.searchParams.delete("event");
      window.history.replaceState({}, "", url.toString());
    })();

    return () => {
      cancelled = true;
    };
  }, [deepLinkEventId, userId]);

  // Deep-link: `/events?add=event` or `?add=memorial` opens the create form (e.g. from
  // master left column or profile). Scrub `add` after opening so refresh doesn’t re-open.
  useEffect(() => {
    if (!deepLinkAdd) return;
    if (deepLinkAdd === "event") {
      setShowEventForm(true);
      setShowMemorialForm(false);
    } else if (deepLinkAdd === "memorial") {
      setShowMemorialForm(true);
      setShowEventForm(false);
    } else {
      return;
    }
    const p = new URLSearchParams(searchParams?.toString() ?? "");
    p.delete("add");
    const q = p.toString();
    router.replace(q ? `${pathname}?${q}` : (pathname || "/events"), { scroll: false });
  }, [deepLinkAdd, pathname, router, searchParams]);

  useEffect(() => {
    if (!selectedEvent?.id) return;
    void loadAttendeePreviewsFor(selectedEvent.id);
  }, [selectedEvent?.id, loadAttendeePreviewsFor]);

  useEffect(() => {
    if (!selectedEvent?.id) return;
    const id = selectedEvent.id;
    const ch = supabase
      .channel(`events-page-attendance-${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "event_attendance",
          filter: `event_id=eq.${id}`,
        },
        () => {
          void refreshAttendanceFor(id);
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [selectedEvent?.id]);

  // NOTE: keep ALL hook calls above the early `return` below — React requires a
  // stable hook order across renders, so any useMemo/useCallback declared after
  // the loading branch would trip "Rendered more hooks than during the previous
  // render." once `loading` flips to false.
  const dayEventsListModalRows = useMemo(() => {
    if (!dayEventsListModal) return [];
    return events.filter((e) => e.date === dayEventsListModal);
  }, [dayEventsListModal, events]);

  if (loading) {
    return (
      <div style={{ color: t.text }}>
        <div style={{ marginTop: 20 }}>Loading events...</div>
      </div>
    );
  }

  const eventsOnSelectedDay = selectedDay
    ? events.filter((e) => e.date === selectedDay)
    : [];

  const memorialOnSelectedDay = selectedDay
    ? memorials.filter((m) => anniversaryDate(m.death_date, year) === selectedDay)
    : [];

  const inputStyle: CSSProperties = {
    width: "100%",
    border: `1px solid ${t.inputBorder}`,
    borderRadius: 8,
    padding: "8px 12px",
    fontSize: 14,
    boxSizing: "border-box",
    background: t.input,
    color: t.text,
  };

  const labelStyle: CSSProperties = {
    display: "block",
    fontWeight: 700,
    fontSize: 13,
    marginBottom: 4,
    marginTop: 12,
    color: t.text,
  };

  function openEventDatePicker() {
    const el = eventDateInputRef.current;
    if (!el) return;
    try {
      if (typeof el.showPicker === "function") el.showPicker();
      else el.focus();
    } catch {
      el.focus();
    }
  }

  return (
    <div style={{ color: t.text }}>
      <ImageCropDialog
        open={eventCoverCropOpen}
        imageSrc={eventCoverCropSrc}
        aspect={ASPECT_EVENT_COVER}
        cropShape="rect"
        title="Crop event image"
        onCancel={closeEventCoverCrop}
        onComplete={async (blob) => {
          await uploadEventCoverBlob(blob);
          closeEventCoverCrop();
        }}
      />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
          marginTop: 8,
        }}
      >
        <h1 style={{ fontSize: 32, fontWeight: 900, margin: 0 }}>Events</h1>

        <div style={{ display: "flex", gap: 10 }}>
          {userId && (
            <>
              <button
                type="button"
                onClick={() => {
                  setShowMemorialForm(true);
                  setShowEventForm(false);
                }}
                style={{
                  border: `1px solid ${t.border}`,
                  borderRadius: 10,
                  padding: "9px 16px",
                  fontWeight: 700,
                  background: t.surface,
                  color: t.text,
                  cursor: "pointer",
                }}
              >
                + Add Memorial
              </button>

              <button
                type="button"
                onClick={() => {
                  if (eventCoverCropSrc) URL.revokeObjectURL(eventCoverCropSrc);
                  setEventCoverCropSrc(null);
                  setEventCoverCropOpen(false);
                  setEventCoverUrl(null);
                  setShowEventForm(true);
                  setShowMemorialForm(false);
                }}
                style={{
                  background: t.text,
                  color: t.surface,
                  border: "none",
                  borderRadius: 10,
                  padding: "9px 16px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                + Add Event
              </button>
            </>
          )}
        </div>
      </div>

      {showEventForm && (
        <div
          style={{
            marginTop: 20,
            border: `1px solid ${t.border}`,
            borderRadius: 16,
            padding: 24,
            background: t.surface,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 4,
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 900 }}>Add Event</div>
            <button
              type="button"
              onClick={() => {
                if (eventCoverCropSrc) URL.revokeObjectURL(eventCoverCropSrc);
                setEventCoverCropSrc(null);
                setEventCoverCropOpen(false);
                setEventCoverUrl(null);
                setShowEventForm(false);
              }}
              style={{
                background: "transparent",
                border: "none",
                fontSize: 20,
                cursor: "pointer",
                color: t.textMuted,
              }}
            >
              ×
            </button>
          </div>

          <label style={labelStyle}>Title *</label>
          <input
            style={inputStyle}
            value={eventForm.title}
            onChange={(e) => setEventForm((p) => ({ ...p, title: e.target.value }))}
            placeholder="Event title"
          />

          <label htmlFor="event-form-date" style={labelStyle}>Date *</label>
          <div
            style={{
              ...inputStyle,
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "flex-start",
              gap: 8,
              padding: "10px 12px",
              position: "relative",
            }}
          >
            <button
              type="button"
              aria-label={eventForm.date ? "Change date" : "Choose date"}
              onClick={() => openEventDatePicker()}
              style={{
                border: "none",
                background: "transparent",
                padding: 0,
                margin: 0,
                cursor: "pointer",
                fontSize: 14,
                fontFamily: "inherit",
                color: eventForm.date ? t.text : t.textMuted,
                flexShrink: 0,
              }}
            >
              {eventForm.date ? formatShortUsDateFromIso(eventForm.date) : "mm/dd/yyyy"}
            </button>
            <button
              type="button"
              aria-label="Open calendar"
              onClick={(e) => {
                e.preventDefault();
                openEventDatePicker();
              }}
              style={{
                border: "none",
                background: "transparent",
                padding: 0,
                margin: 0,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: isDark ? "#ffffff" : "#111827",
                flexShrink: 0,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </button>
            <div style={{ flex: 1, minWidth: 0 }} aria-hidden />
            <input
              id="event-form-date"
              ref={eventDateInputRef}
              type="date"
              value={eventForm.date}
              onChange={(e) => setEventForm((p) => ({ ...p, date: e.target.value }))}
              style={{
                position: "absolute",
                width: 1,
                height: 1,
                padding: 0,
                margin: -1,
                overflow: "hidden",
                clip: "rect(0,0,0,0)",
                whiteSpace: "nowrap",
                border: 0,
                opacity: 0,
                pointerEvents: "none",
              }}
            />
          </div>

          <label style={labelStyle}>Time</label>
          <input
            style={inputStyle}
            value={eventForm.event_time}
            onChange={(e) => setEventForm((p) => ({ ...p, event_time: e.target.value }))}
            placeholder='e.g. "6:00 PM EST" or "0900 - 1100"'
          />

          <label style={labelStyle}>Location / Address</label>
          <input
            style={inputStyle}
            value={eventForm.location}
            onChange={(e) => setEventForm((p) => ({ ...p, location: e.target.value }))}
            placeholder="Venue or street address (or 'Online — Zoom')"
          />

          <label style={labelStyle}>Organization</label>
          <input
            style={inputStyle}
            value={eventForm.organization}
            onChange={(e) => setEventForm((p) => ({ ...p, organization: e.target.value }))}
            placeholder="Hosting organization"
          />

          <label style={labelStyle}>Description</label>
          <textarea
            style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
            value={eventForm.description}
            onChange={(e) => setEventForm((p) => ({ ...p, description: e.target.value }))}
            placeholder="Event details..."
          />

          <label style={labelStyle}>Point of Contact (POC) name</label>
          <input
            style={inputStyle}
            value={eventForm.poc_name}
            onChange={(e) => setEventForm((p) => ({ ...p, poc_name: e.target.value }))}
            placeholder="Name of organizer / point of contact"
          />

          <label style={labelStyle}>POC phone number</label>
          <input
            style={inputStyle}
            type="tel"
            value={eventForm.poc_phone}
            onChange={(e) => setEventForm((p) => ({ ...p, poc_phone: e.target.value }))}
            placeholder="(555) 555-1234"
          />

          <label style={labelStyle}>Event image</label>
          <input ref={eventPhotoInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onPickEventPhoto} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <button
              type="button"
              onClick={() => eventPhotoInputRef.current?.click()}
              disabled={uploadingEventCover}
              style={{
                border: `1px solid ${t.border}`,
                borderRadius: 10,
                padding: "8px 14px",
                fontWeight: 700,
                background: t.surface,
                color: t.text,
                cursor: uploadingEventCover ? "not-allowed" : "pointer",
                opacity: uploadingEventCover ? 0.7 : 1,
              }}
            >
              {uploadingEventCover ? "Uploading…" : eventCoverUrl ? "Change image" : "Choose & crop image"}
            </button>
            {eventCoverUrl ? (
              <button
                type="button"
                onClick={() => setEventCoverUrl(null)}
                style={{ background: "transparent", border: "none", color: t.textMuted, fontWeight: 700, cursor: "pointer", fontSize: 13 }}
              >
                Remove
              </button>
            ) : null}
          </div>
          {eventCoverUrl ? (
            <div style={{ marginTop: 10, borderRadius: 12, overflow: "hidden", border: `1px solid ${t.border}`, maxWidth: 420, aspectRatio: "16 / 9", background: t.bg }}>
              <img src={eventCoverUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </div>
          ) : (
            <div style={{ marginTop: 6, fontSize: 12, color: t.textFaint }}>Optional. Same crop flow as group covers — 16×9.</div>
          )}

          <label style={labelStyle}>Sign-up / External URL</label>
          <input
            style={inputStyle}
            value={eventForm.signup_url}
            onChange={(e) => setEventForm((p) => ({ ...p, signup_url: e.target.value }))}
            placeholder="https://..."
          />

          <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button
              type="button"
              onClick={() => {
                if (eventCoverCropSrc) URL.revokeObjectURL(eventCoverCropSrc);
                setEventCoverCropSrc(null);
                setEventCoverCropOpen(false);
                setEventCoverUrl(null);
                setShowEventForm(false);
              }}
              style={{
                border: `1px solid ${t.border}`,
                borderRadius: 10,
                padding: "9px 16px",
                fontWeight: 700,
                background: t.surface,
                color: t.text,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={submitEvent}
              disabled={submittingEvent}
              style={{
                background: t.text,
                color: t.surface,
                border: "none",
                borderRadius: 10,
                padding: "9px 16px",
                fontWeight: 700,
                cursor: submittingEvent ? "not-allowed" : "pointer",
                opacity: submittingEvent ? 0.7 : 1,
              }}
            >
              {submittingEvent ? "Publishing..." : "Publish Event"}
            </button>
          </div>
        </div>
      )}

      {showMemorialForm && (
        <div style={{ marginTop: 20, border: `1px solid ${t.border}`, borderRadius: 16, padding: 24, background: t.surface }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ fontSize: 18, fontWeight: 900 }}>Add Memorial</div>
            <button
              type="button"
              onClick={() => { setShowMemorialForm(false); setMemWizUrl(""); setMemWizName(""); setMemWizDate(""); setMemWizBio(""); setMemWizImage(""); setMemWizMsg(null); }}
              style={{ background: "transparent", border: "none", fontSize: 20, cursor: "pointer", color: t.textMuted }}
            >×</button>
          </div>
          <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 16, lineHeight: 1.6 }}>
            Paste an EOD Warrior Foundation memorial URL and hit Fetch — name and date auto-fill. Or skip the URL and fill in manually.
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            {/* URL + Fetch */}
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={memWizUrl}
                onChange={(e) => setMemWizUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchMemorialMeta()}
                placeholder="https://eod-wf.org/virtual-memorial/... (optional)"
                style={inputStyle}
              />
              <button
                type="button"
                onClick={fetchMemorialMeta}
                disabled={memWizFetching || !memWizUrl.trim()}
                style={{ background: t.text, color: t.surface, border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 700, fontSize: 14, cursor: memWizFetching || !memWizUrl.trim() ? "not-allowed" : "pointer", opacity: memWizFetching || !memWizUrl.trim() ? 0.5 : 1, whiteSpace: "nowrap" }}
              >
                {memWizFetching ? "Fetching..." : "Fetch"}
              </button>
            </div>

            {/* Name + Date */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 180px", gap: 8 }}>
              <input
                value={memWizName}
                onChange={(e) => setMemWizName(e.target.value)}
                placeholder="Full name *"
                style={inputStyle}
              />
              <input
                type="date"
                value={memWizDate}
                onChange={(e) => setMemWizDate(e.target.value)}
                style={inputStyle}
              />
            </div>

            {/* Bio */}
            <textarea
              value={memWizBio}
              onChange={(e) => setMemWizBio(e.target.value)}
              placeholder="Bio / about (auto-filled from URL if available, or enter manually)"
              style={{ ...inputStyle, minHeight: 90, resize: "vertical" }}
            />

            {/* Preview card */}
            {(memWizImage || memWizBio) && (
              <div style={{ display: "flex", gap: 14, padding: 14, borderRadius: 10, border: `2px solid #d9582b`, background: isDark ? "#2a1409" : "#fdf3ed" }}>
                {memWizImage && (
                  <img src={memWizImage} alt="" style={{ width: 72, height: 90, objectFit: "cover", borderRadius: 8, flexShrink: 0, border: "2px solid #d9582b" }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {memWizName && <div style={{ fontWeight: 800, fontSize: 15 }}>{memWizName}</div>}
                  {memWizBio && (
                    <div style={{ fontSize: 13, color: t.textMuted, marginTop: 6, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>
                      {memWizBio}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={saveMemorial}
                disabled={memWizSaving || !memWizName.trim() || !memWizDate}
                style={{ background: "#d9582b", color: "white", border: "none", borderRadius: 8, padding: "9px 20px", fontWeight: 800, fontSize: 14, cursor: memWizSaving || !memWizName.trim() || !memWizDate ? "not-allowed" : "pointer", opacity: memWizSaving || !memWizName.trim() || !memWizDate ? 0.5 : 1 }}
              >
                {memWizSaving ? "Saving..." : "Add Memorial"}
              </button>
              <button
                type="button"
                onClick={() => { setShowMemorialForm(false); setMemWizUrl(""); setMemWizName(""); setMemWizDate(""); setMemWizBio(""); setMemWizImage(""); setMemWizMsg(null); }}
                style={{ border: `1px solid ${t.border}`, borderRadius: 8, padding: "9px 16px", fontWeight: 700, background: "transparent", color: t.text, cursor: "pointer" }}
              >
                Cancel
              </button>
              {memWizMsg && (
                <div style={{ fontSize: 14, fontWeight: 700, color: memWizMsg.type === "ok" ? "#16a34a" : "#ef4444" }}>
                  {memWizMsg.type === "ok" ? "✓ " : "✗ "}{memWizMsg.text}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          marginTop: 24,
          border: `1px solid ${t.border}`,
          borderRadius: 16,
          background: t.surface,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: `1px solid ${t.border}`,
          }}
        >
          <button
            type="button"
            onClick={prevRange}
            style={{
              border: `1px solid ${t.border}`,
              borderRadius: 8,
              padding: "6px 14px",
              fontWeight: 700,
              background: t.surface,
              color: t.text,
              cursor: "pointer",
              fontSize: 18,
            }}
          >
            ‹
          </button>

          <div style={{ fontSize: 20, fontWeight: 900, textAlign: "center" }}>
            {calendarView === "week"
              ? `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
              : `${MONTH_NAMES[month]} ${year}`}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              role="tablist"
              aria-label="Calendar view"
              style={{
                display: "inline-flex",
                border: `1px solid ${t.border}`,
                borderRadius: 999,
                overflow: "hidden",
                background: t.surface,
              }}
            >
              <button
                type="button"
                role="tab"
                aria-selected={calendarView === "month"}
                onClick={switchToMonthView}
                style={{
                  padding: "6px 12px",
                  fontSize: 12,
                  fontWeight: 700,
                  border: "none",
                  background: calendarView === "month" ? t.text : "transparent",
                  color: calendarView === "month" ? t.surface : t.textMuted,
                  cursor: "pointer",
                }}
              >
                Month
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={calendarView === "week"}
                onClick={switchToWeekView}
                style={{
                  padding: "6px 12px",
                  fontSize: 12,
                  fontWeight: 700,
                  border: "none",
                  background: calendarView === "week" ? t.text : "transparent",
                  color: calendarView === "week" ? t.surface : t.textMuted,
                  cursor: "pointer",
                }}
              >
                Week
              </button>
            </div>
            <button
              type="button"
              onClick={nextRange}
              style={{
                border: `1px solid ${t.border}`,
                borderRadius: 8,
                padding: "6px 14px",
                fontWeight: 700,
                background: t.surface,
                color: t.text,
                cursor: "pointer",
                fontSize: 18,
              }}
            >
              ›
            </button>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            borderBottom: `1px solid ${t.border}`,
          }}
        >
          {DAY_LABELS.map((d) => (
            <div
              key={d}
              style={{
                padding: "8px 4px",
                textAlign: "center",
                fontSize: 12,
                fontWeight: 700,
                color: t.textMuted,
              }}
            >
              {d}
            </div>
          ))}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gridAutoRows: `${CALENDAR_FIXED_CELL_HEIGHT}px`,
          }}
        >
          {calendarCells.map((cellDate, idx) => {
            if (cellDate === null) {
              return (
                <div
                  key={`empty-${idx}`}
                  style={{
                    height: CALENDAR_FIXED_CELL_HEIGHT,
                    borderRight: `1px solid ${t.borderLight}`,
                    borderBottom: `1px solid ${t.borderLight}`,
                    background: t.bg,
                    boxSizing: "border-box",
                  }}
                />
              );
            }

            const dateStr = toDateStr(cellDate.getFullYear(), cellDate.getMonth(), cellDate.getDate());
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === selectedDay;
            const dayEvents = events.filter((e) => e.date === dateStr);
            const dayMemorials = memorials.filter(
              (m) => anniversaryDate(m.death_date, cellDate.getFullYear()) === dateStr
            );
            const hasContent = dayEvents.length > 0 || dayMemorials.length > 0;
            const visibleEvents = dayEvents.slice(0, MAX_VISIBLE_EVENT_PILLS);
            const eventOverflow = Math.max(0, dayEvents.length - MAX_VISIBLE_EVENT_PILLS);
            const visibleMemorials = dayMemorials.slice(0, 1);
            const memorialOverflow = Math.max(0, dayMemorials.length - 1);

            const eventPillStyle: CSSProperties = {
              width: "100%",
              minWidth: 0,
              textAlign: "left" as const,
              fontSize: 11,
              fontWeight: 700,
              background: "#1a1a1a",
              color: "white",
              borderRadius: 4,
              padding: "2px 5px",
              overflow: "hidden",
              whiteSpace: "nowrap" as const,
              textOverflow: "ellipsis" as const,
              border: "none",
              cursor: "pointer",
              flexShrink: 0,
            };

            return (
              <div
                key={dateStr}
                onClick={() => setSelectedDay(isSelected ? null : dateStr)}
                style={{
                  height: CALENDAR_FIXED_CELL_HEIGHT,
                  minHeight: CALENDAR_FIXED_CELL_HEIGHT,
                  maxHeight: CALENDAR_FIXED_CELL_HEIGHT,
                  boxSizing: "border-box",
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                  borderRight: `1px solid ${t.borderLight}`,
                  borderBottom: `1px solid ${t.borderLight}`,
                  padding: "4px 6px",
                  cursor: hasContent ? "pointer" : "default",
                  background: isSelected ? t.surfaceHover : isToday ? (isDark ? "#2a1800" : "#fffbeb") : t.surface,
                  transition: "background 0.1s",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: isToday ? 900 : 600,
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      background: isToday ? t.text : "transparent",
                      color: isToday ? t.surface : t.text,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {cellDate.getDate()}
                  </div>
                  {calendarView === "week" && (
                    <div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {cellDate.toLocaleDateString("en-US", { month: "short" })}
                    </div>
                  )}
                </div>

                <div
                  style={{
                    flex: 1,
                    minHeight: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    overflow: "hidden",
                    marginTop: 4,
                  }}
                >
                  {visibleEvents.map((ev) => (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedEvent(ev);
                      }}
                      style={eventPillStyle}
                      title={ev.title}
                    >
                      {ev.title}
                    </button>
                  ))}

                  {eventOverflow > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDayEventsListModal(dateStr);
                      }}
                      style={{
                        width: "100%",
                        minWidth: 0,
                        textAlign: "left" as const,
                        fontSize: 10,
                        fontWeight: 800,
                        color: isDark ? "#93c5fd" : "#1d4ed8",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        padding: "1px 0",
                        flexShrink: 0,
                      }}
                    >
                      +{eventOverflow} more
                    </button>
                  )}

                  {visibleMemorials.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedMemorial(m);
                      }}
                      title={m.name}
                      style={{
                        width: "100%",
                        minWidth: 0,
                        textAlign: "left" as const,
                        fontSize: 11,
                        fontWeight: 700,
                        background: "#d9582b",
                        color: "white",
                        borderRadius: 4,
                        padding: "2px 5px",
                        overflow: "hidden",
                        whiteSpace: "nowrap" as const,
                        textOverflow: "ellipsis" as const,
                        border: "none",
                        cursor: "pointer",
                        flexShrink: 0,
                      }}
                    >
                      ✦ {m.name}
                    </button>
                  ))}

                  {memorialOverflow > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedDay(dateStr);
                      }}
                      style={{
                        width: "100%",
                        minWidth: 0,
                        textAlign: "left" as const,
                        fontSize: 10,
                        fontWeight: 800,
                        color: t.textMuted,
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        padding: "1px 0",
                        flexShrink: 0,
                      }}
                    >
                      +{memorialOverflow} memorials
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedDay && (eventsOnSelectedDay.length > 0 || memorialOnSelectedDay.length > 0) && (
        <div
          onClick={() => setSelectedDay(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 640,
              maxHeight: "calc(100vh - 40px)",
              background: t.surface,
              color: t.text,
              borderRadius: 18,
              boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "20px 24px 12px" }}>
              <div style={{ fontSize: 18, fontWeight: 900 }}>
                {new Date(`${selectedDay}T12:00:00`).toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </div>
              <button
                type="button"
                onClick={() => setSelectedDay(null)}
                aria-label="Close"
                style={{
                  border: `1px solid ${t.border}`,
                  background: t.surface,
                  color: t.text,
                  borderRadius: 10,
                  padding: "6px 10px",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                X
              </button>
            </div>

            <div style={{ padding: "4px 24px 24px", overflowY: "auto", flex: 1, minHeight: 0 }}>
              {memorialOnSelectedDay.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setSelectedDay(null);
                    setSelectedMemorial(m);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    border: "2px solid #d9582b",
                    borderRadius: 14,
                    padding: 20,
                    marginBottom: 12,
                    background: isDark ? "#2a1409" : "#fdf3ed",
                    color: t.text,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                    {m.photo_url && (
                      <div
                        style={{
                          width: 64,
                          height: 64,
                          borderRadius: "50%",
                          overflow: "hidden",
                          flexShrink: 0,
                          border: "3px solid #d9582b",
                        }}
                      >
                        <img
                          src={m.photo_url}
                          alt={m.name}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      </div>
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 12, color: "#d9582b", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>
                        We Remember
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 900, marginTop: 2 }}>
                        {m.name}
                      </div>
                      <div style={{ fontSize: 13, color: t.textMuted, marginTop: 2 }}>
                        {new Date(`${m.death_date}T12:00:00`).toLocaleDateString("en-US", {
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })}
                        {" · "}
                        {year - parseInt(m.death_date.split("-")[0], 10)} years ago
                      </div>
                    </div>
                  </div>
                </button>
              ))}

              {eventsOnSelectedDay.map((ev) => (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => {
                    setSelectedDay(null);
                    setSelectedEvent(ev);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    border: `1px solid ${t.border}`,
                    borderRadius: 14,
                    padding: 18,
                    marginBottom: 12,
                    background: t.surface,
                    color: t.text,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: 17, fontWeight: 900 }}>{ev.title}</div>
                  {ev.organization && (
                    <div style={{ marginTop: 4, fontSize: 14, color: t.textMuted }}>
                      {ev.organization}
                    </div>
                  )}
                  {ev.description && (
                    <div style={{ marginTop: 8, lineHeight: 1.5, color: t.textMuted, fontSize: 14, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>
                      {ev.description}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Upcoming Events List View ── */}
      <div style={{ marginTop: 24, border: `1px solid ${t.border}`, borderRadius: 16, background: t.surface, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${t.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 18, fontWeight: 900 }}>
            Upcoming Events
            {allUpcomingEvents.length > 0 && (
              <span style={{ marginLeft: 10, fontSize: 13, fontWeight: 700, color: t.textMuted }}>{allUpcomingEvents.length} event{allUpcomingEvents.length !== 1 ? "s" : ""}</span>
            )}
          </div>
        </div>

        {allUpcomingEvents.length === 0 ? (
          <div style={{ padding: "32px 20px", textAlign: "center", color: t.textFaint, fontSize: 14 }}>
            No upcoming events. Be the first to add one!
          </div>
        ) : (
          <div style={{ display: "grid", gap: 0 }}>
            {allUpcomingEvents.map((ev, idx) => {
              const evDate = new Date(`${ev.date}T12:00:00`);
              const isToday = ev.date === todayStr;
              const tomorrow = new Date(today);
              tomorrow.setDate(today.getDate() + 1);
              const tomorrowStr = toDateStr(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());
              const isTomorrow = ev.date === tomorrowStr;
              const dayLabel = isToday ? "Today" : isTomorrow ? "Tomorrow" : null;

              return (
                <div
                  key={ev.id}
                  style={{
                    display: "flex",
                    gap: 16,
                    padding: "16px 20px",
                    borderBottom: idx < allUpcomingEvents.length - 1 ? `1px solid ${t.borderLight}` : "none",
                    background: isToday ? (isDark ? "#2a1800" : "#fffbeb") : t.surface,
                  }}
                >
                  {/* Date badge */}
                  <div style={{ flexShrink: 0, width: 52, background: isToday ? "#f59e0b" : "#1a1a1a", color: "white", borderRadius: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "8px 4px", gap: 1 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", opacity: 0.85 }}>
                      {evDate.toLocaleDateString("en-US", { month: "short" })}
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 900, lineHeight: 1 }}>
                      {evDate.getDate()}
                    </div>
                    {dayLabel && (
                      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", opacity: 0.9, marginTop: 2 }}>
                        {dayLabel}
                      </div>
                    )}
                  </div>

                  {ev.image_url ? (
                    <button
                      type="button"
                      onClick={() => setSelectedEvent(ev)}
                      onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.04)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
                      aria-label={`Open details for ${ev.title}`}
                      style={{
                        flexShrink: 0,
                        width: 88,
                        height: 88,
                        borderRadius: 10,
                        overflow: "hidden",
                        border: `1px solid ${t.border}`,
                        background: t.bg,
                        padding: 0,
                        cursor: "pointer",
                        transition: "transform 120ms ease",
                        transformOrigin: "center",
                      }}
                    >
                      <img src={httpsAssetUrl(ev.image_url)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    </button>
                  ) : null}

                  {/* Event details */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <button
                      type="button"
                      onClick={() => setSelectedEvent(ev)}
                      onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.04)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
                      style={{
                        background: "transparent",
                        border: "none",
                        padding: 0,
                        margin: 0,
                        cursor: "pointer",
                        textAlign: "left",
                        font: "inherit",
                        color: t.text,
                        fontWeight: 800,
                        fontSize: 16,
                        lineHeight: 1.2,
                        transition: "transform 120ms ease",
                        transformOrigin: "left center",
                        display: "inline-block",
                      }}
                    >
                      {ev.title}
                    </button>
                    {ev.organization && (
                      <div style={{ fontSize: 13, color: t.textMuted, marginTop: 3 }}>{ev.organization}</div>
                    )}
                    {ev.description && (
                      <div style={{ fontSize: 13, color: t.textMuted, marginTop: 6, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>
                        {ev.description}
                      </div>
                    )}

                    <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <button
                        type="button"
                        onClick={() => toggleAttendance(ev.id, "interested")}
                        style={{ background: myAttendance[ev.id] === "interested" ? t.text : t.surface, color: myAttendance[ev.id] === "interested" ? t.surface : t.textMuted, border: `1px solid ${t.border}`, borderRadius: 8, padding: "5px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
                      >
                        Interested {(attendance[ev.id]?.interested ?? 0) > 0 ? `· ${attendance[ev.id].interested}` : ""}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleAttendance(ev.id, "going")}
                        style={{ background: myAttendance[ev.id] === "going" ? t.text : t.surface, color: myAttendance[ev.id] === "going" ? t.surface : t.textMuted, border: `1px solid ${t.border}`, borderRadius: 8, padding: "5px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
                      >
                        Going {(attendance[ev.id]?.going ?? 0) > 0 ? `· ${attendance[ev.id].going}` : ""}
                      </button>
                      {ev.signup_url && (
                        <a href={ev.signup_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 700, color: isDark ? "#60a5fa" : "#1d4ed8", textDecoration: "none" }}>
                          Website ↗
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedEvent && (
        <div
          onClick={() => setSelectedEvent(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 560,
              background: t.surface,
              color: t.text,
              borderRadius: 18,
              padding: 24,
              boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                {selectedEvent.image_url ? (
                  <div style={{ marginBottom: 14, borderRadius: 12, overflow: "hidden", border: `1px solid ${t.border}`, aspectRatio: "16 / 9", maxHeight: 220, background: t.bg }}>
                    <img src={httpsAssetUrl(selectedEvent.image_url)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  </div>
                ) : null}
                <div style={{ fontSize: 24, fontWeight: 900 }}>
                  {selectedEvent.title || "Untitled Event"}
                </div>

                {selectedEvent.organization && (
                  <div style={{ marginTop: 6, color: t.textMuted, fontSize: 15 }}>
                    {selectedEvent.organization}
                  </div>
                )}

                <div style={{ marginTop: 8, color: t.textMuted, fontSize: 14 }}>
                  {formatEventDate(selectedEvent.date)}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                style={{
                  border: `1px solid ${t.border}`,
                  background: t.surface,
                  color: t.text,
                  borderRadius: 10,
                  padding: "6px 10px",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                X
              </button>
            </div>

            {selectedEvent.description && (
              <div
                style={{
                  marginTop: 18,
                  color: t.textMuted,
                  lineHeight: 1.6,
                  fontSize: 14,
                }}
              >
                {selectedEvent.description}
              </div>
            )}

            <div
              style={{
                marginTop: 20,
                borderTop: `1px solid ${t.border}`,
                paddingTop: 16,
                display: "grid",
                gap: 10,
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 14 }}>Event Details</div>

              <div style={{ color: t.textMuted, fontSize: 14 }}>
                <strong>Title:</strong> {selectedEvent.title || "Untitled Event"}
              </div>

              {selectedEvent.organization && (
                <div style={{ color: t.textMuted, fontSize: 14 }}>
                  <strong>Organization:</strong> {selectedEvent.organization}
                </div>
              )}

              <div style={{ color: t.textMuted, fontSize: 14 }}>
                <strong>Date:</strong> {formatEventDate(selectedEvent.date)}
              </div>

              {selectedEvent.event_time && (
                <div style={{ color: t.textMuted, fontSize: 14 }}>
                  <strong>Time:</strong> {selectedEvent.event_time}
                </div>
              )}

              {selectedEvent.location && (
                <div style={{ color: t.textMuted, fontSize: 14 }}>
                  <strong>Location:</strong> {selectedEvent.location}
                </div>
              )}

              {(selectedEvent.poc_name || selectedEvent.poc_phone) && (
                <div style={{ color: t.textMuted, fontSize: 14 }}>
                  <strong>Point of Contact:</strong>{" "}
                  {selectedEvent.poc_name ?? ""}
                  {selectedEvent.poc_name && selectedEvent.poc_phone ? " — " : ""}
                  {selectedEvent.poc_phone ? (
                    <a href={`tel:${selectedEvent.poc_phone.replace(/\s+/g, "")}`} style={{ fontWeight: 700 }}>
                      {selectedEvent.poc_phone}
                    </a>
                  ) : null}
                </div>
              )}

            </div>

            <div
              style={{
                marginTop: 24,
                display: "flex",
                flexDirection: "column",
                gap: 0,
                width: "100%",
              }}
            >
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <button
                  type="button"
                  onClick={() => toggleAttendance(selectedEvent.id, "interested")}
                  style={{ border: `1px solid ${t.border}`, borderRadius: 10, padding: "10px 16px", fontWeight: 800, cursor: "pointer", background: myAttendance[selectedEvent.id] === "interested" ? t.text : t.surface, color: myAttendance[selectedEvent.id] === "interested" ? t.surface : t.text }}
                >
                  {myAttendance[selectedEvent.id] === "interested" ? "Interested ✓" : "Interested"}
                </button>
                <button
                  type="button"
                  onClick={() => toggleAttendance(selectedEvent.id, "going")}
                  style={{ border: `1px solid ${t.border}`, borderRadius: 10, padding: "10px 16px", fontWeight: 800, cursor: "pointer", background: myAttendance[selectedEvent.id] === "going" ? t.text : t.surface, color: myAttendance[selectedEvent.id] === "going" ? t.surface : t.text }}
                >
                  {myAttendance[selectedEvent.id] === "going" ? "Going ✓" : "Going"}
                </button>
                {selectedEvent.signup_url && (
                  <a
                    href={selectedEvent.signup_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: "inline-block",
                      textDecoration: "none",
                      background: "black",
                      color: "white",
                      padding: "10px 16px",
                      borderRadius: 10,
                      fontWeight: 800,
                      marginLeft: "auto",
                    }}
                  >
                    Open Event Link
                  </a>
                )}
              </div>
              <EventAttendeeAvatarRows
                interested={attendeePreviews[selectedEvent.id]?.interested ?? []}
                going={attendeePreviews[selectedEvent.id]?.going ?? []}
                onOpenInterested={() => setAttendeesListModal({ eventId: selectedEvent.id, status: "interested" })}
                onOpenGoing={() => setAttendeesListModal({ eventId: selectedEvent.id, status: "going" })}
              />

            </div>
          </div>
        </div>
      )}
      {dayEventsListModal && (
        <div
          onClick={() => setDayEventsListModal(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            zIndex: 1010,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="day-events-modal-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 480,
              maxHeight: "min(85vh, 520px)",
              background: t.surface,
              color: t.text,
              borderRadius: 18,
              boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              border: `1px solid ${t.border}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "18px 20px 10px" }}>
              <h2 id="day-events-modal-title" style={{ margin: 0, fontSize: 18, fontWeight: 900, lineHeight: 1.3 }}>
                {new Date(`${dayEventsListModal}T12:00:00`).toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </h2>
              <button
                type="button"
                onClick={() => setDayEventsListModal(null)}
                aria-label="Close"
                style={{
                  border: `1px solid ${t.border}`,
                  background: t.surface,
                  color: t.text,
                  borderRadius: 10,
                  padding: "6px 10px",
                  cursor: "pointer",
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                X
              </button>
            </div>
            <p style={{ margin: "0 20px 8px", fontSize: 13, color: t.textMuted, fontWeight: 600 }}>
              {dayEventsListModalRows.length} event{dayEventsListModalRows.length === 1 ? "" : "s"} on this day
            </p>
            <div
              style={{
                padding: "4px 20px 20px",
                overflowY: "auto",
                flex: 1,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {dayEventsListModalRows.map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => {
                      setSelectedEvent(ev);
                      setDayEventsListModal(null);
                    }}
                    style={{
                      width: "100%",
                      textAlign: "left" as const,
                      fontSize: 14,
                      fontWeight: 700,
                      background: "#1a1a1a",
                      color: "white",
                      borderRadius: 8,
                      padding: "10px 12px",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    {ev.title}
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
      {selectedMemorial && (
        <div
          onClick={() => setSelectedMemorial(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 560,
              maxHeight: "calc(100vh - 40px)",
              background: t.surface,
              color: t.text,
              borderRadius: 18,
              boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "22px 24px 10px" }}>
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start", minWidth: 0 }}>
                {selectedMemorial.photo_url && (
                  <div
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: "50%",
                      overflow: "hidden",
                      flexShrink: 0,
                      border: "3px solid #d9582b",
                    }}
                  >
                    <img
                      src={selectedMemorial.photo_url}
                      alt={selectedMemorial.name}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  </div>
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: "#d9582b", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>
                    We Remember
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 900, marginTop: 2, lineHeight: 1.2 }}>
                    {selectedMemorial.name}
                  </div>
                  <div style={{ fontSize: 13, color: t.textMuted, marginTop: 4 }}>
                    {new Date(`${selectedMemorial.death_date}T12:00:00`).toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                    {" · "}
                    {year - parseInt(selectedMemorial.death_date.split("-")[0], 10)} years ago
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMemorial(null)}
                aria-label="Close"
                style={{
                  border: `1px solid ${t.border}`,
                  background: t.surface,
                  color: t.text,
                  borderRadius: 10,
                  padding: "6px 10px",
                  cursor: "pointer",
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                X
              </button>
            </div>

            <div style={{ padding: "6px 24px 4px", overflowY: "auto", flex: 1, minHeight: 0 }}>
              {selectedMemorial.bio ? (
                <div style={{ lineHeight: 1.65, color: t.text, fontSize: 14, whiteSpace: "pre-wrap" }}>
                  {selectedMemorial.bio}
                </div>
              ) : (
                <div style={{ color: t.textFaint, fontSize: 14 }}>
                  No biography on file.{selectedMemorial.source_url ? " Use “View Full Memorial” for the full tribute." : ""}
                </div>
              )}
              <div style={{ marginTop: 16, fontSize: 11, lineHeight: 1.5, color: t.textFaint, fontStyle: "italic" }}>
                * This memorial is respectfully referenced from the EOD Warrior Foundation Digital Wall. If anything appears inaccurate, please contact our admin or connect directly with EODWF through their website.
              </div>
            </div>

            <div
              style={{
                marginTop: 12,
                padding: "14px 24px 20px",
                borderTop: `1px solid ${t.border}`,
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              {selectedMemorial.source_url && (
                <a
                  href={selectedMemorial.source_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: "inline-block",
                    textDecoration: "none",
                    background: "#d9582b",
                    color: "white",
                    padding: "10px 16px",
                    borderRadius: 10,
                    fontWeight: 800,
                    fontSize: 14,
                  }}
                >
                  View Full Memorial →
                </a>
              )}
            </div>
          </div>
        </div>
      )}
      <EventAttendeesListModal
        open={attendeesListModal !== null}
        eventId={attendeesListModal?.eventId ?? null}
        status={attendeesListModal?.status ?? null}
        onClose={() => setAttendeesListModal(null)}
      />
    </div>
  );
}