"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/lib/supabaseClient";
import NavBar from "../components/NavBar";
import ImageCropDialog from "../components/ImageCropDialog";
import { ASPECT_EVENT_COVER } from "../lib/imageCropTargets";
import { useTheme } from "../lib/ThemeContext";

type CalendarEvent = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  date: string;
  organization: string | null;
  signup_url: string | null;
  image_url: string | null;
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

type AttendeeProfile = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
  const today = new Date();

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [memorials, setMemorials] = useState<Memorial[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [allUpcomingEvents, setAllUpcomingEvents] = useState<CalendarEvent[]>([]);

  const [savedEventIds, setSavedEventIds] = useState<Set<string>>(new Set());
  const [togglingEventSaveFor, setTogglingEventSaveFor] = useState<string | null>(null);

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const [attendance, setAttendance] = useState<Record<string, { interested: number; going: number }>>({});
  const [myAttendance, setMyAttendance] = useState<Record<string, "interested" | "going" | null>>({});
  const [attendeesPopup, setAttendeesPopup] = useState<{ eventId: string; status: "interested" | "going" } | null>(null);
  const [attendees, setAttendees] = useState<AttendeeProfile[]>([]);
  const [loadingAttendees, setLoadingAttendees] = useState(false);

  const [showEventForm, setShowEventForm] = useState(false);
  const [eventForm, setEventForm] = useState({
    title: "",
    description: "",
    date: "",
    organization: "",
    signup_url: "",
  });
  const [submittingEvent, setSubmittingEvent] = useState(false);
  const eventPhotoInputRef = useRef<HTMLInputElement>(null);
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

  const calendarCells: (number | null)[] = [
    ...Array(firstDayOfMonth).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate());

  async function loadEvents(): Promise<CalendarEvent[]> {
    const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const monthEnd = `${year}-${String(month + 1).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

    const { data, error } = await supabase
      .from("events")
      .select("*")
      .gte("date", monthStart)
      .lte("date", monthEnd)
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

  async function toggleAttendance(eventId: string, status: "interested" | "going") {
    if (!userId) { window.location.href = "/login"; return; }
    const current = myAttendance[eventId] ?? null;

    if (current === status) {
      await supabase.from("event_attendance").delete().eq("event_id", eventId).eq("user_id", userId);
      setMyAttendance((prev) => ({ ...prev, [eventId]: null }));
      setAttendance((prev) => ({ ...prev, [eventId]: { ...prev[eventId], [status]: Math.max(0, (prev[eventId]?.[status] ?? 0) - 1) } }));
    } else if (current) {
      await supabase.from("event_attendance").update({ status }).eq("event_id", eventId).eq("user_id", userId);
      setMyAttendance((prev) => ({ ...prev, [eventId]: status }));
      setAttendance((prev) => ({
        ...prev,
        [eventId]: {
          interested: status === "interested" ? (prev[eventId]?.interested ?? 0) + 1 : Math.max(0, (prev[eventId]?.interested ?? 0) - 1),
          going: status === "going" ? (prev[eventId]?.going ?? 0) + 1 : Math.max(0, (prev[eventId]?.going ?? 0) - 1),
        },
      }));
    } else {
      await supabase.from("event_attendance").insert([{ event_id: eventId, user_id: userId, status }]);
      setMyAttendance((prev) => ({ ...prev, [eventId]: status }));
      setAttendance((prev) => ({ ...prev, [eventId]: { interested: prev[eventId]?.interested ?? 0, going: prev[eventId]?.going ?? 0, [status]: (prev[eventId]?.[status] ?? 0) + 1 } }));
    }
  }

  async function openAttendeesPopup(eventId: string, status: "interested" | "going") {
    setAttendeesPopup({ eventId, status });
    setLoadingAttendees(true);
    setAttendees([]);

    const { data: attData } = await supabase
      .from("event_attendance")
      .select("user_id")
      .eq("event_id", eventId)
      .eq("status", status);

    const userIds = ((attData ?? []) as { user_id: string }[]).map((r) => r.user_id);
    if (userIds.length === 0) { setLoadingAttendees(false); return; }

    const { data: profileData } = await supabase
      .from("profiles")
      .select("user_id, first_name, last_name, photo_url")
      .in("user_id", userIds);

    setAttendees((profileData ?? []) as AttendeeProfile[]);
    setLoadingAttendees(false);
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
      .select("*")
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
      .select("*")
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

  async function toggleSaveEvent(eventId: string) {
    if (!userId) {
      window.location.href = "/login";
      return;
    }

    try {
      setTogglingEventSaveFor(eventId);

      const isSaved = savedEventIds.has(eventId);

      if (isSaved) {
        const { error } = await supabase
          .from("saved_events")
          .delete()
          .eq("user_id", userId)
          .eq("event_id", eventId);

        if (error) {
          console.error("Unsave event error:", error);
          return;
        }

        setSavedEventIds((prev) => {
          const next = new Set(prev);
          next.delete(eventId);
          return next;
        });
      } else {
        const { error } = await supabase
          .from("saved_events")
          .insert([{ user_id: userId, event_id: eventId }]);

        if (error && error.code !== "23505") {
          console.error("Save event error:", error);
          alert("Could not save event.");
          return;
        }

        setSavedEventIds((prev) => new Set(prev).add(eventId));
      }
    } finally {
      setTogglingEventSaveFor(null);
    }
  }

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
      };

      let { data: insertedEvent, error } = await supabase.from("events").insert([insertRow]).select("id").single();

      if (error && isMissingDbColumn(error, "image_url")) {
        const { image_url: _i, ...rest } = insertRow;
        insertRow = rest;
        ({ data: insertedEvent, error } = await supabase.from("events").insert([insertRow]).select("id").single());
      }

      if (error) {
        alert(error.message);
        return;
      }

      const newEventId = insertedEvent?.id as string | undefined;

      // Create a feed post scheduled for next 5pm
      const formattedDate = formatEventDate(eventForm.date);
      const lines = [
        `📅 New Event: ${eventForm.title.trim()}`,
        `📆 ${formattedDate}`,
        eventForm.organization.trim() ? `🏢 ${eventForm.organization.trim()}` : null,
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

      setEventForm({ title: "", description: "", date: "", organization: "", signup_url: "" });
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
  }, [year, month]);

  if (loading) {
    return (
      <div style={{ padding: "24px 16px", background: t.bg, color: t.text, minHeight: "100vh" }}>
        <NavBar />
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

  const inputStyle: React.CSSProperties = {
    width: "100%",
    border: `1px solid ${t.inputBorder}`,
    borderRadius: 8,
    padding: "8px 12px",
    fontSize: 14,
    boxSizing: "border-box",
    background: t.input,
    color: t.text,
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontWeight: 700,
    fontSize: 13,
    marginBottom: 4,
    marginTop: 12,
    color: t.text,
  };

  return (
    <div style={{ padding: "24px 16px", background: t.bg, color: t.text, minHeight: "100vh" }}>
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
      <NavBar />

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

          <label style={labelStyle}>Date *</label>
          <input
            style={inputStyle}
            type="date"
            value={eventForm.date}
            onChange={(e) => setEventForm((p) => ({ ...p, date: e.target.value }))}
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
              <div style={{ display: "flex", gap: 14, padding: 14, borderRadius: 10, border: `2px solid #7c3aed`, background: isDark ? "#1a0d2e" : "#faf5ff" }}>
                {memWizImage && (
                  <img src={memWizImage} alt="" style={{ width: 72, height: 90, objectFit: "cover", borderRadius: 8, flexShrink: 0, border: "2px solid #7c3aed" }} />
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
                style={{ background: "#7c3aed", color: "white", border: "none", borderRadius: 8, padding: "9px 20px", fontWeight: 800, fontSize: 14, cursor: memWizSaving || !memWizName.trim() || !memWizDate ? "not-allowed" : "pointer", opacity: memWizSaving || !memWizName.trim() || !memWizDate ? 0.5 : 1 }}
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
            onClick={prevMonth}
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

          <div style={{ fontSize: 20, fontWeight: 900 }}>
            {MONTH_NAMES[month]} {year}
          </div>

          <button
            type="button"
            onClick={nextMonth}
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

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
          {calendarCells.map((day, idx) => {
            if (day === null) {
              return (
                <div
                  key={`empty-${idx}`}
                  style={{
                    minHeight: 80,
                    borderRight: `1px solid ${t.borderLight}`,
                    borderBottom: `1px solid ${t.borderLight}`,
                    background: t.bg,
                  }}
                />
              );
            }

            const dateStr = toDateStr(year, month, day);
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === selectedDay;
            const dayEvents = events.filter((e) => e.date === dateStr);
            const dayMemorials = memorials.filter(
              (m) => anniversaryDate(m.death_date, year) === dateStr
            );
            const hasContent = dayEvents.length > 0 || dayMemorials.length > 0;

            return (
              <div
                key={dateStr}
                onClick={() => setSelectedDay(isSelected ? null : dateStr)}
                style={{
                  minHeight: 80,
                  borderRight: `1px solid ${t.borderLight}`,
                  borderBottom: `1px solid ${t.borderLight}`,
                  padding: "6px 8px",
                  cursor: hasContent ? "pointer" : "default",
                  background: isSelected ? t.surfaceHover : isToday ? (isDark ? "#2a1800" : "#fffbeb") : t.surface,
                  transition: "background 0.1s",
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
                  }}
                >
                  {day}
                </div>

                {dayEvents.slice(0, 2).map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedDay(dateStr);
                      setSelectedEvent(ev);
                    }}
                    style={{
                      marginTop: 3,
                      width: "100%",
                      textAlign: "left",
                      fontSize: 11,
                      fontWeight: 700,
                      background: "#1a1a1a",
                      color: "white",
                      borderRadius: 4,
                      padding: "2px 5px",
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                      border: "none",
                      cursor: "pointer",
                    }}
                    title={ev.title}
                  >
                    {ev.title}
                  </button>
                ))}

                {dayEvents.length > 2 && (
                  <div style={{ fontSize: 10, color: t.textMuted, marginTop: 2 }}>
                    +{dayEvents.length - 2} more
                  </div>
                )}

                {dayMemorials.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      marginTop: 3,
                      fontSize: 11,
                      fontWeight: 700,
                      background: "#7c3aed",
                      color: "white",
                      borderRadius: 4,
                      padding: "2px 5px",
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                    }}
                  >
                    ✦ {m.name}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {selectedDay && (eventsOnSelectedDay.length > 0 || memorialOnSelectedDay.length > 0) && (
        <div
          style={{
            marginTop: 20,
            border: `1px solid ${t.border}`,
            borderRadius: 16,
            padding: 24,
            background: t.surface,
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 16 }}>
            {new Date(`${selectedDay}T12:00:00`).toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </div>

          {memorialOnSelectedDay.map((m) => (
            <div
              key={m.id}
              style={{
                border: "2px solid #7c3aed",
                borderRadius: 14,
                padding: 20,
                marginBottom: 16,
                background: isDark ? "#1a0d2e" : "#faf5ff",
              }}
            >
              <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                {m.photo_url && (
                  <div
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: "50%",
                      overflow: "hidden",
                      flexShrink: 0,
                      border: "3px solid #7c3aed",
                    }}
                  >
                    <img
                      src={m.photo_url}
                      alt={m.name}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  </div>
                )}

                <div>
                  <div
                    style={{
                      fontSize: 13,
                      color: "#7c3aed",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: 1,
                    }}
                  >
                    We Remember
                  </div>

                  <div style={{ fontSize: 20, fontWeight: 900, marginTop: 2 }}>
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

                  {m.bio && (
                    <div style={{ marginTop: 10, lineHeight: 1.6, color: t.textMuted }}>
                      {m.bio}
                    </div>
                  )}

                  {m.source_url && (
                    <a
                      href={m.source_url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ display: "inline-block", marginTop: 12, fontSize: 13, fontWeight: 700, color: "#7c3aed", textDecoration: "none" }}
                    >
                      View Full Memorial →
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}

          {eventsOnSelectedDay.map((ev) => (
            <div
              key={ev.id}
              style={{
                border: `1px solid ${t.border}`,
                borderRadius: 14,
                padding: 20,
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div style={{ fontSize: 18, fontWeight: 900 }}>{ev.title}</div>

                  {ev.organization && (
                    <div style={{ marginTop: 4, fontSize: 14, color: t.textMuted }}>
                      {ev.organization}
                    </div>
                  )}

                  {ev.description && (
                    <div style={{ marginTop: 8, lineHeight: 1.6, color: t.textMuted }}>
                      {ev.description}
                    </div>
                  )}

                  {ev.signup_url && (
                    <a
                      href={ev.signup_url}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: "inline-block",
                        marginTop: 10,
                        fontWeight: 700,
                        fontSize: 14,
                      }}
                    >
                      Sign Up / View →
                    </a>
                  )}
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setSelectedEvent(ev)}
                    style={{
                      background: t.surface,
                      color: t.text,
                      border: `1px solid ${t.border}`,
                      borderRadius: 10,
                      padding: "8px 14px",
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    View Details
                  </button>

                  {userId && (
                    <button
                      type="button"
                      onClick={() => toggleSaveEvent(ev.id)}
                      disabled={togglingEventSaveFor === ev.id}
                      style={{
                        background: savedEventIds.has(ev.id) ? t.text : t.surface,
                        color: savedEventIds.has(ev.id) ? t.surface : t.textMuted,
                        border: `1px solid ${t.border}`,
                        borderRadius: 10,
                        padding: "8px 14px",
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: togglingEventSaveFor === ev.id ? "not-allowed" : "pointer",
                        opacity: togglingEventSaveFor === ev.id ? 0.6 : 1,
                      }}
                    >
                      {togglingEventSaveFor === ev.id
                        ? "..."
                        : savedEventIds.has(ev.id)
                        ? "Saved ✓"
                        : "Save Event"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
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
                    <div style={{ flexShrink: 0, width: 88, height: 88, borderRadius: 10, overflow: "hidden", border: `1px solid ${t.border}`, background: t.bg }}>
                      <img src={httpsAssetUrl(ev.image_url)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    </div>
                  ) : null}

                  {/* Event details */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 16, lineHeight: 1.2 }}>{ev.title}</div>
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
                          Sign Up ↗
                        </a>
                      )}
                      {userId && (
                        <button
                          type="button"
                          onClick={() => toggleSaveEvent(ev.id)}
                          disabled={togglingEventSaveFor === ev.id}
                          style={{ marginLeft: "auto", background: savedEventIds.has(ev.id) ? t.text : t.surface, color: savedEventIds.has(ev.id) ? t.surface : t.textMuted, border: `1px solid ${t.border}`, borderRadius: 8, padding: "5px 12px", fontWeight: 700, fontSize: 12, cursor: togglingEventSaveFor === ev.id ? "not-allowed" : "pointer", opacity: togglingEventSaveFor === ev.id ? 0.6 : 1 }}
                        >
                          {togglingEventSaveFor === ev.id ? "..." : savedEventIds.has(ev.id) ? "Saved ✓" : "Save"}
                        </button>
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

              {selectedEvent.signup_url && (
                <div style={{ color: t.textMuted, fontSize: 14 }}>
                  <strong>Outside URL:</strong>{" "}
                  <a
                    href={selectedEvent.signup_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontWeight: 700 }}
                  >
                    View / Sign Up
                  </a>
                </div>
              )}
            </div>

            <div
              style={{
                marginTop: 24,
                display: "flex",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              {/* Interested / Going buttons + counts */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 4 }}>
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
                {(attendance[selectedEvent.id]?.interested ?? 0) > 0 && (
                  <button type="button" onClick={() => openAttendeesPopup(selectedEvent.id, "interested")} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 13, color: t.textMuted, fontWeight: 700, padding: "4px 8px", borderRadius: 8 }}>
                    {attendance[selectedEvent.id].interested} interested
                  </button>
                )}
                {(attendance[selectedEvent.id]?.going ?? 0) > 0 && (
                  <button type="button" onClick={() => openAttendeesPopup(selectedEvent.id, "going")} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 13, color: t.textMuted, fontWeight: 700, padding: "4px 8px", borderRadius: 8 }}>
                    {attendance[selectedEvent.id].going} going
                  </button>
                )}
              </div>

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
                  }}
                >
                  Open Event Link
                </a>
              )}

              {userId && (
                <button
                  type="button"
                  onClick={() => toggleSaveEvent(selectedEvent.id)}
                  disabled={togglingEventSaveFor === selectedEvent.id}
                  style={{
                    border: `1px solid ${t.border}`,
                    background: savedEventIds.has(selectedEvent.id) ? t.text : t.surface,
                    color: savedEventIds.has(selectedEvent.id) ? t.surface : t.text,
                    padding: "10px 16px",
                    borderRadius: 10,
                    fontWeight: 800,
                    cursor:
                      togglingEventSaveFor === selectedEvent.id ? "not-allowed" : "pointer",
                    opacity: togglingEventSaveFor === selectedEvent.id ? 0.7 : 1,
                  }}
                >
                  {savedEventIds.has(selectedEvent.id)
                    ? "Saved to My Account"
                    : togglingEventSaveFor === selectedEvent.id
                    ? "Saving..."
                    : "Save Event"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Attendees popup */}
      {attendeesPopup && (
        <div
          onClick={() => setAttendeesPopup(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: t.surface, color: t.text, borderRadius: 16, padding: 24, maxWidth: 340, width: "100%", maxHeight: "70vh", display: "flex", flexDirection: "column", gap: 16 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 900, fontSize: 18 }}>
                {attendeesPopup.status === "going" ? "Going" : "Interested"}
              </div>
              <button onClick={() => setAttendeesPopup(null)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: t.textMuted, lineHeight: 1 }}>×</button>
            </div>

            <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
              {loadingAttendees && <div style={{ color: t.textMuted, fontSize: 14 }}>Loading...</div>}
              {!loadingAttendees && attendees.length === 0 && <div style={{ color: t.textMuted, fontSize: 14 }}>No one yet.</div>}
              {attendees.map((a) => {
                const name = `${a.first_name || ""} ${a.last_name || ""}`.trim() || "User";
                return (
                  <a key={a.user_id} href={`/profile/${a.user_id}`} style={{ display: "flex", gap: 12, alignItems: "center", textDecoration: "none", color: t.text }}>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", overflow: "hidden", background: t.badgeBg, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 15, color: t.textMuted }}>
                      {a.photo_url
                        ? <img src={a.photo_url} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        : name[0]?.toUpperCase()}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{name}</div>
                  </a>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}