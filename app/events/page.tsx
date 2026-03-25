"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/lib/supabaseClient";
import NavBar from "../components/NavBar";

type CalendarEvent = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  date: string;
  organization: string | null;
  signup_url: string | null;
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

  const [showMemorialForm, setShowMemorialForm] = useState(false);
  const [memorialForm, setMemorialForm] = useState({
    name: "",
    bio: "",
    death_date: "",
  });
  const [memorialPhotoFile, setMemorialPhotoFile] = useState<File | null>(null);
  const [memorialPhotoPreview, setMemorialPhotoPreview] = useState<string | null>(null);
  const [submittingMemorial, setSubmittingMemorial] = useState(false);
  const memorialPhotoRef = useRef<HTMLInputElement>(null);

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

      const { error } = await supabase.from("events").insert([
        {
          user_id: userId,
          title: eventForm.title.trim(),
          description: eventForm.description.trim() || null,
          date: eventForm.date,
          organization: eventForm.organization.trim() || null,
          signup_url: eventForm.signup_url.trim() || null,
        },
      ]);

      if (error) {
        alert(error.message);
        return;
      }

      // Create a feed post scheduled for next 5pm
      const formattedDate = formatEventDate(eventForm.date);
      const lines = [
        `📅 New Event: ${eventForm.title.trim()}`,
        `📆 ${formattedDate}`,
        eventForm.organization.trim() ? `🏢 ${eventForm.organization.trim()}` : null,
        eventForm.description.trim() ? `\n${eventForm.description.trim()}` : null,
        eventForm.signup_url.trim() ? `\nSign up: ${eventForm.signup_url.trim()}` : null,
      ].filter(Boolean);

      await supabase.from("posts").insert([{
        user_id: userId,
        content: lines.join("\n"),
        created_at: getNext5pm(),
      }]);

      setEventForm({ title: "", description: "", date: "", organization: "", signup_url: "" });
      setShowEventForm(false);
      await Promise.all([loadEvents(), loadAllUpcomingEvents()]);
    } finally {
      setSubmittingEvent(false);
    }
  }

  async function submitMemorial() {
    if (!userId) {
      window.location.href = "/login";
      return;
    }

    if (!memorialForm.name.trim() || !memorialForm.death_date) return;

    try {
      setSubmittingMemorial(true);

      let photoUrl: string | null = null;

      if (memorialPhotoFile) {
        const filePath = `${userId}/${Date.now()}-${memorialPhotoFile.name}`;

        const { error: uploadError } = await supabase.storage
          .from("memorial-photos")
          .upload(filePath, memorialPhotoFile);

        if (uploadError) throw uploadError;

        const { data } = supabase.storage
          .from("memorial-photos")
          .getPublicUrl(filePath);

        photoUrl = data.publicUrl;
      }

      const { error } = await supabase.from("memorials").insert([
        {
          user_id: userId,
          name: memorialForm.name.trim(),
          bio: memorialForm.bio.trim() || null,
          photo_url: photoUrl,
          death_date: memorialForm.death_date,
        },
      ]);

      if (error) {
        alert(error.message);
        return;
      }

      setMemorialForm({ name: "", bio: "", death_date: "" });
      setMemorialPhotoFile(null);
      setMemorialPhotoPreview(null);
      setShowMemorialForm(false);
      await loadMemorials();
    } catch (err) {
      console.error("Memorial submit error:", err);
      alert("Failed to add memorial.");
    } finally {
      setSubmittingMemorial(false);
    }
  }

  function handleMemorialPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMemorialPhotoFile(file);
    setMemorialPhotoPreview(URL.createObjectURL(file));
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
      <div style={{ padding: "24px 16px" }}>
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
    border: "1px solid #d1d5db",
    borderRadius: 8,
    padding: "8px 12px",
    fontSize: 14,
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontWeight: 700,
    fontSize: 13,
    marginBottom: 4,
    marginTop: 12,
  };

  return (
    <div style={{ padding: "24px 16px" }}>
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
                  border: "1px solid #d1d5db",
                  borderRadius: 10,
                  padding: "9px 16px",
                  fontWeight: 700,
                  background: "white",
                  cursor: "pointer",
                }}
              >
                + Add Memorial
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowEventForm(true);
                  setShowMemorialForm(false);
                }}
                style={{
                  background: "black",
                  color: "white",
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
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: 24,
            background: "white",
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
              onClick={() => setShowEventForm(false)}
              style={{
                background: "transparent",
                border: "none",
                fontSize: 20,
                cursor: "pointer",
                color: "#666",
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
              onClick={() => setShowEventForm(false)}
              style={{
                border: "1px solid #d1d5db",
                borderRadius: 10,
                padding: "9px 16px",
                fontWeight: 700,
                background: "white",
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
                background: "black",
                color: "white",
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
        <div
          style={{
            marginTop: 20,
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: 24,
            background: "white",
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
            <div style={{ fontSize: 18, fontWeight: 900 }}>Add Memorial</div>
            <button
              type="button"
              onClick={() => setShowMemorialForm(false)}
              style={{
                background: "transparent",
                border: "none",
                fontSize: 20,
                cursor: "pointer",
                color: "#666",
              }}
            >
              ×
            </button>
          </div>

          <label style={labelStyle}>Name *</label>
          <input
            style={inputStyle}
            value={memorialForm.name}
            onChange={(e) => setMemorialForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="Full name"
          />

          <label style={labelStyle}>Date of Death *</label>
          <input
            style={inputStyle}
            type="date"
            value={memorialForm.death_date}
            onChange={(e) => setMemorialForm((p) => ({ ...p, death_date: e.target.value }))}
          />

          <label style={labelStyle}>Bio / About</label>
          <textarea
            style={{ ...inputStyle, minHeight: 100, resize: "vertical" }}
            value={memorialForm.bio}
            onChange={(e) => setMemorialForm((p) => ({ ...p, bio: e.target.value }))}
            placeholder="Share their story, service, and legacy..."
          />

          <label style={labelStyle}>Photo</label>
          <input
            ref={memorialPhotoRef}
            type="file"
            accept="image/*"
            onChange={handleMemorialPhoto}
            style={{ fontSize: 14 }}
          />

          {memorialPhotoPreview && (
            <div
              style={{
                marginTop: 10,
                width: 100,
                height: 100,
                borderRadius: "50%",
                overflow: "hidden",
                border: "2px solid #e5e7eb",
              }}
            >
              <img
                src={memorialPhotoPreview}
                alt="Preview"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </div>
          )}

          <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button
              type="button"
              onClick={() => setShowMemorialForm(false)}
              style={{
                border: "1px solid #d1d5db",
                borderRadius: 10,
                padding: "9px 16px",
                fontWeight: 700,
                background: "white",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={submitMemorial}
              disabled={submittingMemorial}
              style={{
                background: "black",
                color: "white",
                border: "none",
                borderRadius: 10,
                padding: "9px 16px",
                fontWeight: 700,
                cursor: submittingMemorial ? "not-allowed" : "pointer",
                opacity: submittingMemorial ? 0.7 : 1,
              }}
            >
              {submittingMemorial ? "Adding..." : "Add Memorial"}
            </button>
          </div>
        </div>
      )}

      <div
        style={{
          marginTop: 24,
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          background: "white",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          <button
            type="button"
            onClick={prevMonth}
            style={{
              border: "1px solid #d1d5db",
              borderRadius: 8,
              padding: "6px 14px",
              fontWeight: 700,
              background: "white",
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
              border: "1px solid #d1d5db",
              borderRadius: 8,
              padding: "6px 14px",
              fontWeight: 700,
              background: "white",
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
            borderBottom: "1px solid #e5e7eb",
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
                color: "#888",
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
                    borderRight: "1px solid #f3f4f6",
                    borderBottom: "1px solid #f3f4f6",
                    background: "#fafafa",
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
                  borderRight: "1px solid #f3f4f6",
                  borderBottom: "1px solid #f3f4f6",
                  padding: "6px 8px",
                  cursor: hasContent ? "pointer" : "default",
                  background: isSelected ? "#f0f0f0" : isToday ? "#fffbeb" : "white",
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
                    background: isToday ? "black" : "transparent",
                    color: isToday ? "white" : "#333",
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
                  <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>
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
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: 24,
            background: "white",
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
                background: "#faf5ff",
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

                  <div style={{ fontSize: 13, color: "#666", marginTop: 2 }}>
                    {new Date(`${m.death_date}T12:00:00`).toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                    {" · "}
                    {year - parseInt(m.death_date.split("-")[0], 10)} years ago
                  </div>

                  {m.bio && (
                    <div style={{ marginTop: 10, lineHeight: 1.6, color: "#444" }}>
                      {m.bio}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {eventsOnSelectedDay.map((ev) => (
            <div
              key={ev.id}
              style={{
                border: "1px solid #e5e7eb",
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
                    <div style={{ marginTop: 4, fontSize: 14, color: "#555" }}>
                      {ev.organization}
                    </div>
                  )}

                  {ev.description && (
                    <div style={{ marginTop: 8, lineHeight: 1.6, color: "#444" }}>
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
                      background: "white",
                      color: "#111",
                      border: "1px solid #d1d5db",
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
                        background: savedEventIds.has(ev.id) ? "black" : "white",
                        color: savedEventIds.has(ev.id) ? "white" : "#555",
                        border: "1px solid #d1d5db",
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
      <div style={{ marginTop: 24, border: "1px solid #e5e7eb", borderRadius: 16, background: "white", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 18, fontWeight: 900 }}>
            Upcoming Events
            {allUpcomingEvents.length > 0 && (
              <span style={{ marginLeft: 10, fontSize: 13, fontWeight: 700, color: "#888" }}>{allUpcomingEvents.length} event{allUpcomingEvents.length !== 1 ? "s" : ""}</span>
            )}
          </div>
        </div>

        {allUpcomingEvents.length === 0 ? (
          <div style={{ padding: "32px 20px", textAlign: "center", color: "#aaa", fontSize: 14 }}>
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
                    borderBottom: idx < allUpcomingEvents.length - 1 ? "1px solid #f3f4f6" : "none",
                    background: isToday ? "#fffbeb" : "white",
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

                  {/* Event details */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 16, lineHeight: 1.2 }}>{ev.title}</div>
                    {ev.organization && (
                      <div style={{ fontSize: 13, color: "#555", marginTop: 3 }}>{ev.organization}</div>
                    )}
                    {ev.description && (
                      <div style={{ fontSize: 13, color: "#666", marginTop: 6, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>
                        {ev.description}
                      </div>
                    )}

                    <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <button
                        type="button"
                        onClick={() => toggleAttendance(ev.id, "interested")}
                        style={{ background: myAttendance[ev.id] === "interested" ? "black" : "white", color: myAttendance[ev.id] === "interested" ? "white" : "#555", border: "1px solid #d1d5db", borderRadius: 8, padding: "5px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
                      >
                        Interested {(attendance[ev.id]?.interested ?? 0) > 0 ? `· ${attendance[ev.id].interested}` : ""}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleAttendance(ev.id, "going")}
                        style={{ background: myAttendance[ev.id] === "going" ? "black" : "white", color: myAttendance[ev.id] === "going" ? "white" : "#555", border: "1px solid #d1d5db", borderRadius: 8, padding: "5px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
                      >
                        Going {(attendance[ev.id]?.going ?? 0) > 0 ? `· ${attendance[ev.id].going}` : ""}
                      </button>
                      {ev.signup_url && (
                        <a href={ev.signup_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 700, color: "#1d4ed8", textDecoration: "none" }}>
                          Sign Up ↗
                        </a>
                      )}
                      {userId && (
                        <button
                          type="button"
                          onClick={() => toggleSaveEvent(ev.id)}
                          disabled={togglingEventSaveFor === ev.id}
                          style={{ marginLeft: "auto", background: savedEventIds.has(ev.id) ? "#ecfdf5" : "white", color: savedEventIds.has(ev.id) ? "#0f766e" : "#555", border: "1px solid #d1d5db", borderRadius: 8, padding: "5px 12px", fontWeight: 700, fontSize: 12, cursor: togglingEventSaveFor === ev.id ? "not-allowed" : "pointer", opacity: togglingEventSaveFor === ev.id ? 0.6 : 1 }}
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

      {memorials.length > 0 && (
        <div
          style={{
            marginTop: 24,
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: 24,
            background: "white",
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 16 }}>
            Memorials
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            {memorials.map((m) => {
              const thisYearAnniversary = anniversaryDate(m.death_date, today.getFullYear());
              const isAnniversaryToday = thisYearAnniversary === todayStr;

              return (
                <div
                  key={m.id}
                  style={{
                    display: "flex",
                    gap: 14,
                    alignItems: "flex-start",
                    padding: 16,
                    borderRadius: 12,
                    border: `1px solid ${isAnniversaryToday ? "#7c3aed" : "#e5e7eb"}`,
                    background: isAnniversaryToday ? "#faf5ff" : "white",
                  }}
                >
                  {m.photo_url && (
                    <div
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: "50%",
                        overflow: "hidden",
                        flexShrink: 0,
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
                    {isAnniversaryToday && (
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: "#7c3aed",
                          textTransform: "uppercase",
                          letterSpacing: 1,
                          marginBottom: 2,
                        }}
                      >
                        We Remember · Today
                      </div>
                    )}

                    <div style={{ fontWeight: 800 }}>{m.name}</div>

                    <div style={{ fontSize: 13, color: "#666", marginTop: 2 }}>
                      {new Date(`${m.death_date}T12:00:00`).toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </div>

                    {m.bio && (
                      <div style={{ marginTop: 6, fontSize: 14, color: "#444", lineHeight: 1.5 }}>
                        {m.bio}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
              background: "white",
              borderRadius: 18,
              padding: 24,
              boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
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
              <div>
                <div style={{ fontSize: 24, fontWeight: 900 }}>
                  {selectedEvent.title || "Untitled Event"}
                </div>

                {selectedEvent.organization && (
                  <div style={{ marginTop: 6, color: "#444", fontSize: 15 }}>
                    {selectedEvent.organization}
                  </div>
                )}

                <div style={{ marginTop: 8, color: "#666", fontSize: 14 }}>
                  {formatEventDate(selectedEvent.date)}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                style={{
                  border: "1px solid #d1d5db",
                  background: "white",
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
                  color: "#444",
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
                borderTop: "1px solid #e5e7eb",
                paddingTop: 16,
                display: "grid",
                gap: 10,
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 14 }}>Event Details</div>

              <div style={{ color: "#555", fontSize: 14 }}>
                <strong>Title:</strong> {selectedEvent.title || "Untitled Event"}
              </div>

              {selectedEvent.organization && (
                <div style={{ color: "#555", fontSize: 14 }}>
                  <strong>Organization:</strong> {selectedEvent.organization}
                </div>
              )}

              <div style={{ color: "#555", fontSize: 14 }}>
                <strong>Date:</strong> {formatEventDate(selectedEvent.date)}
              </div>

              {selectedEvent.signup_url && (
                <div style={{ color: "#555", fontSize: 14 }}>
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
                  style={{ border: "1px solid #d1d5db", borderRadius: 10, padding: "10px 16px", fontWeight: 800, cursor: "pointer", background: myAttendance[selectedEvent.id] === "interested" ? "black" : "white", color: myAttendance[selectedEvent.id] === "interested" ? "white" : "black" }}
                >
                  {myAttendance[selectedEvent.id] === "interested" ? "Interested ✓" : "Interested"}
                </button>
                <button
                  type="button"
                  onClick={() => toggleAttendance(selectedEvent.id, "going")}
                  style={{ border: "1px solid #d1d5db", borderRadius: 10, padding: "10px 16px", fontWeight: 800, cursor: "pointer", background: myAttendance[selectedEvent.id] === "going" ? "black" : "white", color: myAttendance[selectedEvent.id] === "going" ? "white" : "black" }}
                >
                  {myAttendance[selectedEvent.id] === "going" ? "Going ✓" : "Going"}
                </button>
                {(attendance[selectedEvent.id]?.interested ?? 0) > 0 && (
                  <button type="button" onClick={() => openAttendeesPopup(selectedEvent.id, "interested")} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 13, color: "#555", fontWeight: 700, padding: "4px 8px", borderRadius: 8 }}>
                    {attendance[selectedEvent.id].interested} interested
                  </button>
                )}
                {(attendance[selectedEvent.id]?.going ?? 0) > 0 && (
                  <button type="button" onClick={() => openAttendeesPopup(selectedEvent.id, "going")} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 13, color: "#555", fontWeight: 700, padding: "4px 8px", borderRadius: 8 }}>
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
                    border: "1px solid #d1d5db",
                    background: savedEventIds.has(selectedEvent.id) ? "#ecfdf5" : "white",
                    color: savedEventIds.has(selectedEvent.id) ? "#0f766e" : "#111",
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
            style={{ background: "white", borderRadius: 16, padding: 24, maxWidth: 340, width: "100%", maxHeight: "70vh", display: "flex", flexDirection: "column", gap: 16 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 900, fontSize: 18 }}>
                {attendeesPopup.status === "going" ? "Going" : "Interested"}
              </div>
              <button onClick={() => setAttendeesPopup(null)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#666", lineHeight: 1 }}>×</button>
            </div>

            <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
              {loadingAttendees && <div style={{ color: "#777", fontSize: 14 }}>Loading...</div>}
              {!loadingAttendees && attendees.length === 0 && <div style={{ color: "#777", fontSize: 14 }}>No one yet.</div>}
              {attendees.map((a) => {
                const name = `${a.first_name || ""} ${a.last_name || ""}`.trim() || "User";
                return (
                  <a key={a.user_id} href={`/profile/${a.user_id}`} style={{ display: "flex", gap: 12, alignItems: "center", textDecoration: "none", color: "black" }}>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", overflow: "hidden", background: "#f3f4f6", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 15, color: "#666" }}>
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