"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "../../lib/lib/supabaseClient";
import { useTheme } from "../../lib/ThemeContext";
import { getFeatureAccess } from "../../lib/featureAccess";
import { postNotifyJson } from "../../lib/postNotifyClient";
import UpgradePromptModal from "../UpgradePromptModal";
import JobCardActions from "../jobs/JobCardActions";
import JobDetailsModal, { type JobModalData } from "../jobs/JobDetailsModal";
import EventAttendeeAvatarRows from "../events/EventAttendeeAvatarRows";
import { EventAttendeesListModal } from "../events/EventAttendeesListModal";
import { fetchEventAttendeePreviews } from "../../lib/fetchEventAttendeePreviews";
import type { PostLikerBrief } from "../PostLikersStack";
import { dedupeSavedEventRowsByEventId, ensureSavedEventForUser } from "../../lib/ensureSavedEventForUser";
import { collapsedRailTitleLinkZoom, httpsAssetUrl, sectionTitleLinkZoom, type JobRow } from "./masterShared";

const CALENDAR_DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toDateStr(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function anniversaryDate(deathDate: string, year: number) {
  const parts = deathDate.split("-");
  return `${year}-${parts[1]}-${parts[2]}`;
}

function formatShortDate(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

type SavedEventRow = {
  id: string;
  event_id: string;
  title: string | null;
  organization: string | null;
  date: string | null;
  signup_url: string | null;
  image_url: string | null;
  my_attendance: "interested" | "going" | null;
  interested_count: number;
  going_count: number;
};

type EventInviteUser = {
  user_id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  service: string | null;
};

type SavedJobRow = {
  id: string;
  job_id: string;
  title: string | null;
  company_name: string | null;
  location: string | null;
  category: string | null;
  description: string | null;
  apply_url: string | null;
  pay_min: number | null;
  pay_max: number | null;
  clearance: string | null;
  source_type: string | null;
  created_at: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  og_site_name: string | null;
};

type DesktopCalendarEvent = {
  id: string;
  title: string;
  organization: string | null;
  date: string;
  signup_url: string | null;
  image_url: string | null;
  unit_id?: string | null;
  visibility?: string | null;
};

type DesktopMemorial = {
  id: string;
  name: string;
  death_date: string;
  source_url: string | null;
  photo_url: string | null;
  bio: string | null;
  category?: "military" | "leo_fed" | null;
};

const MEMORIAL_MILITARY_COLOR = "#d9582b";
const MEMORIAL_LEO_COLOR = "#062b4f";
const EVENT_INVITE_BRANCHES = ["Army", "Navy", "Marines", "Air Force", "Civil Service", "Federal"];
const RUMINT_USER_ID = "ffffffff-ffff-4fff-afff-52554d494e54";

function isHiddenEventInviteAccount(user: Pick<EventInviteUser, "user_id" | "display_name" | "first_name" | "last_name">) {
  const name = `${user.display_name ?? ""} ${user.first_name ?? ""} ${user.last_name ?? ""}`
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const compactName = name.replace(/[^a-z0-9]/g, "");
  return (
    user.user_id === RUMINT_USER_ID ||
    compactName === "rumint" ||
    compactName === "eodhub" ||
    compactName === "eodhubadmin"
  );
}

function memorialTheme(category?: DesktopMemorial["category"]) {
  const isLeoFed = category === "leo_fed";
  return {
    color: isLeoFed ? MEMORIAL_LEO_COLOR : MEMORIAL_MILITARY_COLOR,
    label: isLeoFed ? "End of Watch" : "We Remember",
  };
}

function memorialDisclaimer(category?: DesktopMemorial["category"]) {
  return category === "leo_fed"
    ? "* This information has been respectfully referenced from bombtechmemorial.org."
    : "* This memorial is respectfully referenced from the EOD Warrior Foundation Digital Wall. If anything appears inaccurate, please contact our admin or connect directly with EODWF through their website.";
}

type DesktopSelectedEvent = {
  id: string;
  title: string | null;
  description: string | null;
  date: string | null;
  organization: string | null;
  signup_url: string | null;
  image_url: string | null;
  location: string | null;
  event_time: string | null;
  poc_name: string | null;
  poc_phone: string | null;
  unit_id?: string | null;
  visibility?: string | null;
};

type Props = {
  userId: string | null;
  memberInteractionAllowedRef: React.MutableRefObject<boolean>;
  onMemberPaywall: () => void;
  railState: "expanded" | "collapsed";
  onToggleRail: () => void;
  /** When false, skip Supabase work so the center column can hydrate first (desktop cold load). */
  sideRailsReady: boolean;
};

export default function MasterLeftColumn({
  userId,
  memberInteractionAllowedRef,
  onMemberPaywall,
  railState,
  onToggleRail,
  sideRailsReady,
}: Props) {
  const { t, isDark } = useTheme();

  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [jobSubmitters, setJobSubmitters] = useState<Map<string, string>>(new Map());
  const [jobsLoaded, setJobsLoaded] = useState(false);
  const [jobsLastUpdated, setJobsLastUpdated] = useState<string | null>(null);
  const [jobsTotalApprovedCount, setJobsTotalApprovedCount] = useState<number | null>(null);
  const [jobsNewTodayCount, setJobsNewTodayCount] = useState<number | null>(null);
  const [jobSort] = useState<"recent" | "az" | "za">("recent");
  const [canViewFullJobs, setCanViewFullJobs] = useState(true);
  const [showJobsUpgradePrompt, setShowJobsUpgradePrompt] = useState(false);
  const [savedJobIds, setSavedJobIds] = useState<Set<string>>(new Set());
  const [togglingJobSaveFor, setTogglingJobSaveFor] = useState<string | null>(null);
  const [jobDetailsModal, setJobDetailsModal] = useState<JobModalData | null>(null);

  const [desktopSavedEvents, setDesktopSavedEvents] = useState<SavedEventRow[]>([]);
  const [desktopSavedJobs, setDesktopSavedJobs] = useState<SavedJobRow[]>([]);
  const [unsavingWallEvent, setUnsavingWallEvent] = useState<string | null>(null);
  const [unsavingDesktopJobId, setUnsavingDesktopJobId] = useState<string | null>(null);
  const [desktopCalendarDate, setDesktopCalendarDate] = useState(() => new Date());
  const [desktopCalendarEvents, setDesktopCalendarEvents] = useState<DesktopCalendarEvent[]>([]);
  const [desktopMemorials, setDesktopMemorials] = useState<DesktopMemorial[]>([]);
  const [desktopSelectedDay, setDesktopSelectedDay] = useState<string | null>(null);
  /** Memorial detail modal — mirrors the experience on /events so a memorial
   * card never feels different depending on where it's surfaced. */
  const [selectedMemorial, setSelectedMemorial] = useState<DesktopMemorial | null>(null);

  /** Event detail modal — lets users open full event details (RSVP + counts +
   * description + website link) without force-navigating to /events. This
   * keeps the dashboard feed (or any other page where the rail is rendered)
   * in place while still giving the same information the /events modal does. */
  const [selectedEvent, setSelectedEvent] = useState<DesktopSelectedEvent | null>(null);
  const [selectedEventCounts, setSelectedEventCounts] = useState<{ interested: number; going: number }>({ interested: 0, going: 0 });
  const [selectedEventMyStatus, setSelectedEventMyStatus] = useState<"interested" | "going" | null>(null);
  const [selectedEventBusy, setSelectedEventBusy] = useState(false);
  const [selectedEventAttendeePreviews, setSelectedEventAttendeePreviews] = useState<{
    going: PostLikerBrief[];
    interested: PostLikerBrief[];
  }>({ going: [], interested: [] });
  const [leftColAttendeesListModal, setLeftColAttendeesListModal] = useState<"interested" | "going" | null>(null);
  const [eventInviteTarget, setEventInviteTarget] = useState<SavedEventRow | null>(null);
  const [eventInviteUsers, setEventInviteUsers] = useState<EventInviteUser[]>([]);
  const [eventInviteQuery, setEventInviteQuery] = useState("");
  const [eventInviteBranches, setEventInviteBranches] = useState<Set<string>>(new Set());
  const [selectedEventInvites, setSelectedEventInvites] = useState<Set<string>>(new Set());
  const [sendingEventInvites, setSendingEventInvites] = useState(false);
  const [eventInviteMsg, setEventInviteMsg] = useState<string | null>(null);

  const savedEventIdsForRealtimeRef = useRef<Set<string>>(new Set());
  const selectedEventIdRef = useRef<string | null>(null);
  const eventInviteUsersLoadedRef = useRef(false);
  useEffect(() => {
    savedEventIdsForRealtimeRef.current = new Set(desktopSavedEvents.map((e) => e.event_id));
  }, [desktopSavedEvents]);
  useEffect(() => {
    selectedEventIdRef.current = selectedEvent?.id ?? null;
  }, [selectedEvent?.id]);

  function blockMemberInteraction(): boolean {
    if (memberInteractionAllowedRef.current) return false;
    onMemberPaywall();
    return true;
  }

  const filteredEventInviteUsers = eventInviteUsers.filter((u) => {
    if (u.user_id === userId) return false;
    if (isHiddenEventInviteAccount(u)) return false;
    const name = u.display_name || `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || "EOD Member";
    const q = eventInviteQuery.trim().toLowerCase();
    const matchesQuery = !q || name.toLowerCase().includes(q) || (u.service ?? "").toLowerCase().includes(q);
    const matchesBranch = eventInviteBranches.size === 0 || (u.service && eventInviteBranches.has(u.service));
    return matchesQuery && matchesBranch;
  });

  async function loadEventInviteUsers() {
    if (eventInviteUsersLoadedRef.current) return;
    const { data, error } = await supabase
      .from("profiles")
      .select("user_id, display_name, first_name, last_name, photo_url, service")
      .order("display_name", { ascending: true });

    if (error) {
      console.error("Saved event invite users load error:", error);
      return;
    }

    setEventInviteUsers((data ?? []) as EventInviteUser[]);
    eventInviteUsersLoadedRef.current = true;
  }

  function openSavedEventInvite(event: SavedEventRow) {
    if (blockMemberInteraction()) return;
    if (!userId) {
      window.location.href = "/login";
      return;
    }
    setEventInviteTarget(event);
    setSelectedEventInvites(new Set());
    setEventInviteBranches(new Set());
    setEventInviteQuery("");
    setEventInviteMsg(null);
    void loadEventInviteUsers();
  }

  async function sendSavedEventInvites() {
    if (!userId || !eventInviteTarget || selectedEventInvites.size === 0 || sendingEventInvites) return;
    setSendingEventInvites(true);
    setEventInviteMsg(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("You must be signed in to invite members.");

      const selectedUserIds = Array.from(selectedEventInvites);
      const payload = encodeURIComponent(JSON.stringify({ type: "event_invite", eventId: eventInviteTarget.event_id }));
      const inviteUrl = `${window.location.origin}/events?event=${eventInviteTarget.event_id}&invite=${payload}`;
      const message = `You're invited to: ${eventInviteTarget.title || "this event"}\n${inviteUrl}`;

      for (const otherUserId of selectedUserIds) {
        const res = await fetch("/api/sidebar/ensure-conversation", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ other_user_id: otherUserId }),
        });
        const json = (await res.json()) as { conversation_id?: string; error?: string };
        if (!res.ok || !json.conversation_id) {
          throw new Error(json.error ?? "Could not create conversation.");
        }

        const { error: msgError } = await supabase
          .from("messages")
          .insert({ conversation_id: json.conversation_id, sender_id: userId, content: message });
        if (msgError) throw msgError;

        await supabase
          .from("conversations")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", json.conversation_id);
      }

      setEventInviteMsg(`Invited ${selectedUserIds.length} member${selectedUserIds.length === 1 ? "" : "s"}.`);
      setSelectedEventInvites(new Set());
    } catch (err) {
      console.error("sendSavedEventInvites failed:", err);
      setEventInviteMsg(err instanceof Error ? err.message : "Could not send invites.");
    } finally {
      setSendingEventInvites(false);
    }
  }

  const loadDesktopSavedEvents = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from("saved_events")
      .select("id, event_id, events(title, organization, date, signup_url, image_url)")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });
    if (error) {
      setDesktopSavedEvents([]);
      return;
    }
    type RawRow = {
      id: string;
      event_id: string;
      events:
        | { title: string | null; organization: string | null; date: string | null; signup_url: string | null; image_url: string | null }
        | { title: string | null; organization: string | null; date: string | null; signup_url: string | null; image_url: string | null }[]
        | null;
    };
    const rows = ((data ?? []) as unknown as RawRow[]).map((r) => {
      const ev = Array.isArray(r.events) ? r.events[0] ?? null : r.events;
      return {
        id: r.id,
        event_id: r.event_id,
        title: ev?.title ?? null,
        organization: ev?.organization ?? null,
        date: ev?.date ?? null,
        signup_url: ev?.signup_url ?? null,
        image_url: ev?.image_url ?? null,
        my_attendance: null as "interested" | "going" | null,
        interested_count: 0,
        going_count: 0,
      };
    });
    const eventIds = rows.map((r) => r.event_id).filter(Boolean);
    if (eventIds.length > 0) {
      const { data: allAttRows, error: allAttErr } = await supabase
        .from("event_attendance")
        .select("event_id, user_id, status")
        .in("event_id", eventIds);
        if (!allAttErr && allAttRows) {
        const counts = new Map<string, { interested: number; going: number }>();
        for (const r of allAttRows as Array<{ event_id: string; user_id: string; status: "interested" | "going" }>) {
          const cur = counts.get(r.event_id) ?? { interested: 0, going: 0 };
          if (r.status === "interested") cur.interested += 1;
          else if (r.status === "going") cur.going += 1;
          counts.set(r.event_id, cur);
        }
        rows.forEach((row) => {
          const c = counts.get(row.event_id) ?? { interested: 0, going: 0 };
          row.interested_count = c.interested;
          row.going_count = c.going;
          const mine = (allAttRows as Array<{ event_id: string; user_id: string; status: "interested" | "going" }>).find(
            (a) => a.event_id === row.event_id && a.user_id === uid
          );
          row.my_attendance = mine?.status ?? null;
        });
      } else {
        const { data: attRows, error: attErr } = await supabase
          .from("event_attendance")
          .select("event_id, status")
          .eq("user_id", uid)
          .in("event_id", eventIds);
        if (!attErr) {
          const attByEventId = new Map<string, "interested" | "going">();
          ((attRows ?? []) as Array<{ event_id: string; status: "interested" | "going" }>).forEach((r) => {
            attByEventId.set(r.event_id, r.status);
          });
          rows.forEach((row) => {
            row.my_attendance = attByEventId.get(row.event_id) ?? null;
          });
        }
      }
    }
    setDesktopSavedEvents(dedupeSavedEventRowsByEventId(rows));
  }, []);

  const loadDesktopSavedJobs = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from("saved_jobs")
      .select(
        "id, job_id, jobs(title, company_name, location, category, description, apply_url, pay_min, pay_max, clearance, source_type, created_at, og_title, og_description, og_image, og_site_name)"
      )
      .eq("user_id", uid)
      .order("created_at", { ascending: false });
    if (error) {
      setDesktopSavedJobs([]);
      return;
    }
    type RawJob = {
      title: string | null;
      company_name: string | null;
      location: string | null;
      category: string | null;
      description: string | null;
      apply_url: string | null;
      pay_min: number | null;
      pay_max: number | null;
      clearance: string | null;
      source_type: string | null;
      created_at: string | null;
      og_title: string | null;
      og_description: string | null;
      og_image: string | null;
      og_site_name: string | null;
    };
    type RawRow = {
      id: string;
      job_id: string;
      jobs: RawJob | RawJob[] | null;
    };
    const rows: SavedJobRow[] = ((data ?? []) as unknown as RawRow[]).map((r) => {
      const job = Array.isArray(r.jobs) ? r.jobs[0] ?? null : r.jobs;
      return {
        id: r.id,
        job_id: r.job_id,
        title: job?.title ?? null,
        company_name: job?.company_name ?? null,
        location: job?.location ?? null,
        category: job?.category ?? null,
        description: job?.description ?? null,
        apply_url: job?.apply_url ?? null,
        pay_min: job?.pay_min ?? null,
        pay_max: job?.pay_max ?? null,
        clearance: job?.clearance ?? null,
        source_type: job?.source_type ?? null,
        created_at: job?.created_at ?? null,
        og_title: job?.og_title ?? null,
        og_description: job?.og_description ?? null,
        og_image: job?.og_image ?? null,
        og_site_name: job?.og_site_name ?? null,
      };
    });
    setDesktopSavedJobs(rows);
  }, []);

  const loadDesktopCalendarData = useCallback(async (date: Date) => {
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const end = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const startIso = toDateStr(start.getFullYear(), start.getMonth(), start.getDate());
    const endIso = toDateStr(end.getFullYear(), end.getMonth(), end.getDate());

    const [{ data: eventsData }, { data: memorialData }] = await Promise.all([
      supabase
        .from("events")
        .select("id, title, organization, date, signup_url, image_url")
        .gte("date", startIso)
        .lte("date", endIso)
        .is("unit_id", null)
        .eq("visibility", "public")
        .order("date", { ascending: true }),
      supabase.from("memorials").select("id, name, death_date, source_url, photo_url, bio, category"),
    ]);

    setDesktopCalendarEvents((eventsData ?? []) as DesktopCalendarEvent[]);
    setDesktopMemorials((memorialData ?? []) as DesktopMemorial[]);
  }, []);

  const loadSelectedEventAttendeePreviews = useCallback(async (eventId: string) => {
    const p = await fetchEventAttendeePreviews(supabase, eventId);
    setSelectedEventAttendeePreviews(p);
  }, []);

  /**
   * Open the in-place event modal. Fetches full event columns + live
   * attendance in parallel so the user sees real counts + their own RSVP
   * state without being navigated out of the current page (feed, jobs,
   * rabbithole, wherever the left rail is rendered).
   */
  const openEventModal = useCallback(
    async (eventId: string) => {
      setSelectedEventBusy(true);
      try {
        const [eventRes, attRes] = await Promise.all([
          supabase
            .from("events")
            .select("id, title, description, date, organization, signup_url, image_url, location, event_time, poc_name, poc_phone, unit_id, visibility")
            .eq("id", eventId)
            .maybeSingle(),
          supabase
            .from("event_attendance")
            .select("user_id, status")
            .eq("event_id", eventId),
        ]);
        if (eventRes.error || !eventRes.data) return;
        let interested = 0;
        let going = 0;
        let mine: "interested" | "going" | null = null;
        for (const r of (attRes.data ?? []) as Array<{ user_id: string; status: "interested" | "going" }>) {
          if (r.status === "interested") interested += 1;
          else if (r.status === "going") going += 1;
          if (userId && r.user_id === userId) mine = r.status;
        }
        setSelectedEvent(eventRes.data as DesktopSelectedEvent);
        setSelectedEventCounts({ interested, going });
        setSelectedEventMyStatus(mine);
        void loadSelectedEventAttendeePreviews(eventId);
      } finally {
        setSelectedEventBusy(false);
      }
    },
    [userId, loadSelectedEventAttendeePreviews]
  );

  const refreshSelectedEventAttendance = useCallback(
    async (eventId: string) => {
      const { data } = await supabase
        .from("event_attendance")
        .select("user_id, status")
        .eq("event_id", eventId);
      let interested = 0;
      let going = 0;
      let mine: "interested" | "going" | null = null;
      for (const r of (data ?? []) as Array<{ user_id: string; status: "interested" | "going" }>) {
        if (r.status === "interested") interested += 1;
        else if (r.status === "going") going += 1;
        if (userId && r.user_id === userId) mine = r.status;
      }
      setSelectedEventCounts({ interested, going });
      setSelectedEventMyStatus(mine);
      void loadSelectedEventAttendeePreviews(eventId);
    },
    [userId, loadSelectedEventAttendeePreviews]
  );

  async function toggleSelectedEventRsvp(status: "interested" | "going") {
    if (!selectedEvent) return;
    if (!userId) { window.location.href = "/login"; return; }
    const eventId = selectedEvent.id;
    const current = selectedEventMyStatus;
    setSelectedEventBusy(true);
    try {
      if (current === status) {
        const { error } = await supabase
          .from("event_attendance")
          .delete()
          .eq("event_id", eventId)
          .eq("user_id", userId);
        if (error) throw error;
        // Mirror /events behaviour: RSVP off also removes auto-saved row.
        await supabase
          .from("saved_events")
          .delete()
          .eq("user_id", userId)
          .eq("event_id", eventId);
      } else {
        const { error } = await supabase
          .from("event_attendance")
          .upsert(
            [{ event_id: eventId, user_id: userId, status }],
            { onConflict: "event_id,user_id" }
          );
        if (error) throw error;
        // Mirror /events: Interested OR Going auto-saves the event (idempotent).
        try {
          await ensureSavedEventForUser(supabase, userId, eventId);
        } catch (saveErr) {
          console.error("Auto-save event error:", saveErr);
        }
      }
    } catch (err) {
      console.error("rsvp failed:", err);
      alert(err instanceof Error ? err.message : "Could not update your RSVP.");
    } finally {
      setSelectedEventBusy(false);
    }
    await refreshSelectedEventAttendance(eventId);
    // Keep the saved-events rail in sync with the new GOING/INTERESTED state.
    if (userId) await loadDesktopSavedEvents(userId);
  }

  async function unsaveWallEvent(rowId: string) {
    if (!window.confirm("Remove this from Saved Events? This also clears your RSVP status (Interested/Going).")) return;
    try {
      setUnsavingWallEvent(rowId);
      const removed = desktopSavedEvents.find((e) => e.id === rowId);
      await supabase.from("saved_events").delete().eq("id", rowId);
      if (removed?.event_id && userId) {
        // Keep behavior aligned with "Not Going": removing from Saved Events
        // also clears this user's RSVP status for that event.
        await supabase
          .from("event_attendance")
          .delete()
          .eq("event_id", removed.event_id)
          .eq("user_id", userId);
      }
      setDesktopSavedEvents((prev) => prev.filter((e) => e.id !== rowId));
      if (removed?.event_id && selectedEvent?.id === removed.event_id) {
        setSelectedEventMyStatus(null);
        void refreshSelectedEventAttendance(removed.event_id);
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("eod:saved-events-changed", { detail: { eventId: removed?.event_id ?? null } })
        );
      }
    } finally {
      setUnsavingWallEvent(null);
    }
  }

  async function unsaveDesktopSavedJob(savedJobRowId: string) {
    try {
      setUnsavingDesktopJobId(savedJobRowId);
      const removed = desktopSavedJobs.find((j) => j.id === savedJobRowId);
      await supabase.from("saved_jobs").delete().eq("id", savedJobRowId);
      setDesktopSavedJobs((prev) => prev.filter((j) => j.id !== savedJobRowId));
      if (removed?.job_id) {
        setSavedJobIds((prev) => {
          const next = new Set(prev);
          next.delete(removed.job_id);
          return next;
        });
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("eod:saved-jobs-changed", { detail: { jobId: removed?.job_id ?? null } })
        );
      }
    } finally {
      setUnsavingDesktopJobId(null);
    }
  }

  const loadSavedJobIds = useCallback(async (uid: string) => {
    const { data, error } = await supabase.from("saved_jobs").select("job_id").eq("user_id", uid);
    if (error) return;
    setSavedJobIds(new Set((data ?? []).map((r: { job_id: string }) => r.job_id)));
  }, []);

  const loadJobs = useCallback(async (limit: number) => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfNextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    const [jobsRes, lastSeenRes, totalRes, todayRes] = await Promise.all([
      supabase.from("jobs").select("*").eq("is_approved", true).order("created_at", { ascending: false }).limit(limit),
      supabase.from("jobs").select("last_seen_at").eq("source_type", "usajobs").order("last_seen_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("jobs").select("*", { count: "exact", head: true }).eq("is_approved", true),
      supabase
        .from("jobs")
        .select("*", { count: "exact", head: true })
        .eq("is_approved", true)
        .gte("created_at", startOfDay.toISOString())
        .lt("created_at", startOfNextDay.toISOString()),
    ]);

    if (jobsRes.error) {
      console.error("Jobs load error:", jobsRes.error);
      return;
    }

    if (totalRes.error) setJobsTotalApprovedCount(null);
    else setJobsTotalApprovedCount(totalRes.count ?? 0);
    if (todayRes.error) setJobsNewTodayCount(null);
    else setJobsNewTodayCount(todayRes.count ?? 0);

    const loadedJobs = (jobsRes.data ?? []) as JobRow[];
    setJobs(loadedJobs);
    setJobsLoaded(true);
    if (lastSeenRes.data?.last_seen_at) setJobsLastUpdated(lastSeenRes.data.last_seen_at);

    const communityJobs = loadedJobs.filter((j) => j.source_type === "community" && j.user_id && !j.anonymous);
    const communityUserIds = [...new Set(communityJobs.map((j) => j.user_id as string))];
    if (communityUserIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, first_name, last_name, photo_url")
        .in("user_id", communityUserIds);
      type ProfileRow = { user_id: string; display_name: string | null; first_name: string | null; last_name: string | null; photo_url: string | null };
      const profileRows = (profiles ?? []) as ProfileRow[];
      const nameMap = new Map<string, string>();
      profileRows.forEach((p) => {
        const name =
          p.display_name || [p.first_name, p.last_name?.charAt(0) ? p.last_name.charAt(0) + "." : ""].filter(Boolean).join(" ") || "Member";
        nameMap.set(p.user_id, name);
      });
      setJobSubmitters(nameMap);
    }
  }, []);

  useEffect(() => {
    if (!sideRailsReady) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      if (cancelled || !uid) return;
      const { data: profileCheck } = await supabase
        .from("profiles")
        .select("access_tier")
        .eq("user_id", uid)
        .maybeSingle();
      if (cancelled) return;
      const jobsAccess = getFeatureAccess((profileCheck as { access_tier?: string | null } | null)?.access_tier ?? null);
      setCanViewFullJobs(jobsAccess.canViewFullJobs);
      await Promise.all([
        loadJobs(jobsAccess.canViewFullJobs ? 500 : 5),
        loadSavedJobIds(uid),
        loadDesktopSavedEvents(uid),
        loadDesktopSavedJobs(uid),
      ]);
    })();
    return () => {
      cancelled = true;
    };
  }, [sideRailsReady, loadJobs, loadSavedJobIds, loadDesktopSavedEvents, loadDesktopSavedJobs]);

  useEffect(() => {
    if (!sideRailsReady || !userId) return;

    const savedEventsChannel = supabase
      .channel(`left-rail-saved-events-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "saved_events", filter: `user_id=eq.${userId}` },
        () => {
          void loadDesktopSavedEvents(userId);
        }
      )
      .subscribe();

    const attendanceChannel = supabase
      .channel(`left-rail-event-attendance-any-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "event_attendance" },
        (payload) => {
          const row = (payload.new as { event_id?: string } | null) ?? (payload.old as { event_id?: string } | null);
          const eid = row?.event_id;
          if (!eid || !savedEventIdsForRealtimeRef.current.has(eid)) return;
          void loadDesktopSavedEvents(userId);
          if (selectedEventIdRef.current === eid) {
            void refreshSelectedEventAttendance(eid);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(savedEventsChannel);
      supabase.removeChannel(attendanceChannel);
    };
  }, [sideRailsReady, userId, loadDesktopSavedEvents, refreshSelectedEventAttendance]);

  useEffect(() => {
    if (!sideRailsReady || !userId) return;
    const onSavedEventsChanged = () => {
      void loadDesktopSavedEvents(userId);
    };
    const onSavedJobsChanged = () => {
      void loadDesktopSavedJobs(userId);
      void loadSavedJobIds(userId);
    };
    window.addEventListener("eod:saved-events-changed", onSavedEventsChanged as EventListener);
    window.addEventListener("eod:saved-jobs-changed", onSavedJobsChanged as EventListener);
    return () => {
      window.removeEventListener("eod:saved-events-changed", onSavedEventsChanged as EventListener);
      window.removeEventListener("eod:saved-jobs-changed", onSavedJobsChanged as EventListener);
    };
  }, [sideRailsReady, userId, loadDesktopSavedEvents, loadDesktopSavedJobs, loadSavedJobIds]);

  useEffect(() => {
    if (!sideRailsReady) return;
    loadDesktopCalendarData(desktopCalendarDate)
      .then(() => {
        setDesktopSelectedDay(
          toDateStr(desktopCalendarDate.getFullYear(), desktopCalendarDate.getMonth(), desktopCalendarDate.getDate())
        );
      })
      .catch((err) => console.error("Desktop calendar load failed:", err));
  }, [sideRailsReady, desktopCalendarDate, loadDesktopCalendarData]);

  useEffect(() => {
    if (!selectedEvent) {
      setLeftColAttendeesListModal(null);
    }
  }, [selectedEvent]);

  useEffect(() => {
    if (!selectedEvent?.id) return;
    void loadSelectedEventAttendeePreviews(selectedEvent.id);
  }, [selectedEvent?.id, loadSelectedEventAttendeePreviews]);

  useEffect(() => {
    if (!selectedEvent?.id) return;
    const id = selectedEvent.id;
    const ch = supabase
      .channel(`leftcol-event-attendance-${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "event_attendance",
          filter: `event_id=eq.${id}`,
        },
        () => {
          void refreshSelectedEventAttendance(id);
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [selectedEvent?.id, refreshSelectedEventAttendance]);

  /** The selected day is always a date string after load, but the list is often empty — we must not reserve margin/padding for an empty “day list” or the date bar looks top-heavy. */
  const hasDesktopDayCards = useMemo(() => {
    if (!desktopSelectedDay) return false;
    if (desktopCalendarEvents.some((ev) => ev.date === desktopSelectedDay)) return true;
    const y = new Date(`${desktopSelectedDay}T12:00:00`).getFullYear();
    return desktopMemorials.some((m) => anniversaryDate(m.death_date, y) === desktopSelectedDay);
  }, [desktopSelectedDay, desktopCalendarEvents, desktopMemorials]);

  const sortedJobs = useMemo(() => {
    if (jobs.length === 0) return jobs;
    const copy = [...jobs];
    const displayTitle = (j: JobRow) => (j.title || j.og_title || "Untitled Job").trim();
    if (jobSort === "recent") {
      copy.sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return tb - ta;
      });
      return copy;
    }
    if (jobSort === "az") {
      copy.sort((a, b) => displayTitle(a).localeCompare(displayTitle(b), undefined, { sensitivity: "base" }));
      return copy;
    }
    copy.sort((a, b) => displayTitle(b).localeCompare(displayTitle(a), undefined, { sensitivity: "base" }));
    return copy;
  }, [jobs, jobSort]);

  const jobsForPane = sortedJobs.slice(0, 5);

  function openAllJobs() {
    if (canViewFullJobs) {
      window.location.href = "/jobs";
      return;
    }
    setShowJobsUpgradePrompt(true);
  }

  async function toggleSaveJob(jobId: string) {
    if (!userId) {
      window.location.href = "/login";
      return;
    }
    if (blockMemberInteraction()) return;

    try {
      setTogglingJobSaveFor(jobId);
      const isSaved = savedJobIds.has(jobId);

      if (isSaved) {
        await supabase.from("saved_jobs").delete().eq("user_id", userId).eq("job_id", jobId);
        setSavedJobIds((prev) => {
          const next = new Set(prev);
          next.delete(jobId);
          return next;
        });
        setDesktopSavedJobs((prev) => prev.filter((j) => j.job_id !== jobId));
      } else {
        await supabase.from("saved_jobs").insert([{ user_id: userId, job_id: jobId }]);
        setSavedJobIds((prev) => new Set(prev).add(jobId));
        void loadDesktopSavedJobs(userId);
        const job = jobs.find((j) => j.id === jobId);
        if (job?.source_type === "community" && job.user_id && job.user_id !== userId) {
          void postNotifyJson(supabase, {
            user_id: job.user_id,
            actor_name: "A member",
            type: "job_save",
            category: "jobs",
            message: `Someone saved your job listing: ${job.title || "your posting"}`,
            group_key: `job:${jobId}:saves`,
            dedupe_key: `job_save:${jobId}:${userId}`,
            metadata: { job_id: jobId },
          });
        }
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("eod:saved-jobs-changed", { detail: { jobId } }));
      }
    } catch (err) {
      console.error("Toggle save job error:", err);
    } finally {
      setTogglingJobSaveFor(null);
    }
  }

  const skeletonStyle: React.CSSProperties = {
    background: "linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)",
    backgroundSize: "200% 100%",
    borderRadius: 8,
  };

  function SkeletonBlock({ width = "100%", height = 14 }: { width?: string | number; height?: number }) {
    return <div style={{ ...skeletonStyle, width, height, marginBottom: 8 }} />;
  }

  function SkeletonCard() {
    return (
      <div style={{ border: `1px solid ${t.border}`, borderRadius: 12, padding: 14, background: t.surface }}>
        <SkeletonBlock width="55%" height={14} />
        <SkeletonBlock width="75%" height={11} />
        <SkeletonBlock width="40%" height={11} />
      </div>
    );
  }

  if (railState === "collapsed") {
    return (
      <aside
        style={{
          position: "sticky",
          top: 20,
          height: "calc(100vh - 20px)",
          border: `1px solid ${t.border}`,
          borderRadius: 14,
          background: t.surface,
          color: t.textMuted,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 4px",
          boxSizing: "border-box",
          overflow: "hidden",
          transition: "border-color 140ms ease, background-color 140ms ease",
        }}
      >
        <a
          href="/jobs"
          onClick={(e) => {
            if (!canViewFullJobs) {
              e.preventDefault();
              setShowJobsUpgradePrompt(true);
            }
          }}
          {...collapsedRailTitleLinkZoom}
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: 0.4,
            writingMode: "vertical-rl",
            transform: "rotate(180deg) scale(1)",
            textTransform: "uppercase",
            userSelect: "none",
            color: t.text,
            textDecoration: "none",
            cursor: "pointer",
            display: "block",
            transition: "transform 0.15s ease",
          }}
        >
          Jobs
        </a>
        <button
          type="button"
          onClick={onToggleRail}
          aria-label="Expand left panel"
          title="Expand left panel"
          onMouseEnter={(e) => {
            e.currentTarget.style.background = t.surfaceHover;
            e.currentTarget.style.borderColor = t.border;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.borderColor = t.borderLight;
          }}
          style={{
            width: 26,
            height: 26,
            borderRadius: 8,
            border: `1px solid ${t.borderLight}`,
            background: "transparent",
            color: t.text,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 900,
            lineHeight: 1,
          }}
        >
          »
        </button>
        <Link
          href="/events"
          {...collapsedRailTitleLinkZoom}
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: 0.4,
            writingMode: "vertical-rl",
            transform: "rotate(180deg) scale(1)",
            textTransform: "uppercase",
            userSelect: "none",
            color: t.text,
            textDecoration: "none",
            display: "block",
            transition: "transform 0.15s ease",
            cursor: "pointer",
          }}
        >
          Events
        </Link>
      </aside>
    );
  }

  return (
    <aside
      style={{
        display: "block",
        position: "sticky",
        top: 20,
        height: "calc(100vh - 20px)",
        maxHeight: "calc(100vh - 20px)",
        overflowY: "auto",
        overflowX: "hidden",
        scrollbarGutter: "stable",
      }}
    >
      {/* Top: events + saved */}
      <div style={{ border: "1px solid transparent", borderRadius: 16, background: "transparent", padding: 0, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
            <Link
              href="/events"
              {...sectionTitleLinkZoom}
              style={{
                fontSize: 15,
                fontWeight: 900,
                color: t.text,
                textDecoration: "none",
                whiteSpace: "nowrap",
                display: "inline-block",
                transform: "scale(1)",
                transition: "transform 0.15s ease",
                cursor: "pointer",
              }}
            >
              Events
            </Link>
            <a href="/events" style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#2563eb", fontWeight: 700, fontSize: 13, textDecoration: "none", whiteSpace: "nowrap" }}>
              See all <ArrowRight size={13} strokeWidth={2.5} aria-hidden />
            </a>
          </div>
          <button
            type="button"
            onClick={onToggleRail}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = t.surfaceHover;
              e.currentTarget.style.borderColor = t.border;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderColor = t.borderLight;
            }}
            style={{
              border: `1px solid ${t.borderLight}`,
              background: "transparent",
              color: t.textMuted,
              borderRadius: 8,
              padding: "4px 8px",
              fontSize: 11,
              fontWeight: 800,
              cursor: "pointer",
              lineHeight: 1.1,
              flexShrink: 0,
            }}
            aria-label="Collapse left panel"
            title="Collapse left panel"
          >
            Collapse
          </button>
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.3 }}>Add</span>
          <Link
            href="/events?add=memorial"
            style={{ color: "#2563eb", fontWeight: 700, fontSize: 12, textDecoration: "none", lineHeight: 1.2 }}
          >
            Memorial
          </Link>
          <span style={{ fontSize: 11, color: t.textFaint }}>|</span>
          <Link
            href="/events?add=event"
            style={{ color: "#2563eb", fontWeight: 700, fontSize: 12, textDecoration: "none", lineHeight: 1.2 }}
          >
            Event
          </Link>
        </div>

        <div
          style={{
            border: `1px solid ${t.border}`,
            borderRadius: 10,
            padding: hasDesktopDayCards ? "8px 10px 10px 10px" : "8px 10px 8px 10px",
            background: t.surface,
            boxSizing: "border-box",
          }}
        >
          {/* Header: prev / "Apr 15 Wed" / next. The weekday sits next to the
              date so we don't need a separate day cell below — if there are no
              items for the day, the empty card is itself the indicator. */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "min-content 1fr min-content",
              alignItems: "center",
              columnGap: 6,
            }}
          >
            <button
              type="button"
              aria-label="Previous day"
              onClick={() => setDesktopCalendarDate((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() - 1))}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 0,
                border: `1px solid ${t.border}`,
                background: "#111",
                color: "white",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 700,
                padding: "2px 7px",
                cursor: "pointer",
              }}
            >
              <ChevronLeft size={14} strokeWidth={2.5} aria-hidden style={{ display: "block" }} />
            </button>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                minWidth: 0,
                lineHeight: 1.15,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 800, color: t.text, lineHeight: 1.15 }}>{formatShortDate(desktopCalendarDate)}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: t.textFaint, lineHeight: 1.15 }}>{CALENDAR_DAY_LABELS[desktopCalendarDate.getDay()]}</span>
            </div>
            <button
              type="button"
              aria-label="Next day"
              onClick={() => setDesktopCalendarDate((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 1))}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 0,
                border: `1px solid ${t.border}`,
                background: "#111",
                color: "white",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 700,
                padding: "2px 7px",
                cursor: "pointer",
              }}
            >
              <ChevronRight size={14} strokeWidth={2.5} aria-hidden style={{ display: "block" }} />
            </button>
          </div>

          {/* Day items live INSIDE the calendar card so the date header and the
              events/memorials attached to it read as a single visual unit. */}
          {desktopSelectedDay && hasDesktopDayCards && (
          <div style={{ marginTop: 6, display: "grid", gap: 8 }}>
            {[
              // Events in the day card deep-link to the SAME /events modal as
              // the saved events below (clickable title + thumb). The button
              // below is a plain external "Website" link when the event has
              // one, matching the saved-event card UX.
              ...desktopCalendarEvents
                .filter((ev) => ev.date === desktopSelectedDay)
                .map((ev) => ({
                  kind: "event" as const,
                  id: `ev-${ev.id}`,
                  title: ev.title,
                  sub: ev.organization || "Event",
                  websiteUrl: ev.signup_url?.trim() ? ev.signup_url : null,
                  eventId: ev.id as string | null,
                  thumbAlt: `Open event ${ev.title}`,
                  thumb: ev.image_url?.trim() ? ev.image_url : null,
                  thumbBorder: `1px solid ${t.border}`,
                  memorial: null as DesktopMemorial | null,
                })),
              ...desktopMemorials
                .filter((m) => anniversaryDate(m.death_date, new Date(desktopSelectedDay + "T12:00:00").getFullYear()) === desktopSelectedDay)
                .map((m) => ({
                  kind: "memorial" as const,
                  id: `mem-${m.id}`,
                  title: m.name,
                  sub: "EOD Memorial Foundation",
                  websiteUrl: m.source_url?.trim() ? m.source_url : null,
                  eventId: null as string | null,
                  thumbAlt: `Open memorial for ${m.name}`,
                  thumb: m.photo_url?.trim() ? m.photo_url : null,
                  thumbBorder: `2px solid ${memorialTheme(m.category).color}`,
                  memorial: m,
                })),
            ]
              .slice(0, 4)
              .map((item) => {
                // openModal = the EOD-Hub in-app modal (memorial modal for
                // memorials, in-place event modal for events). Title + thumb
                // both trigger this so the user can stay on the current page
                // (feed, jobs, rabbithole) instead of being force-navigated
                // to /events. "Website" is a separate external link.
                const memorialCardTheme = item.memorial ? memorialTheme(item.memorial.category) : null;
                const openModal: (() => void) | null =
                  item.kind === "memorial" && item.memorial
                    ? () => setSelectedMemorial(item.memorial)
                    : item.eventId
                      ? () => { void openEventModal(item.eventId!); }
                      : null;
                return (
                  <div
                    key={item.id}
                    style={{
                      border: memorialCardTheme ? `2px solid ${memorialCardTheme.color}` : `1px solid ${t.border}`,
                      borderRadius: 10,
                      background: memorialCardTheme
                        ? isDark
                          ? item.memorial?.category === "leo_fed"
                            ? "#061a30"
                            : "#2a1409"
                          : item.memorial?.category === "leo_fed"
                            ? "#eef6ff"
                            : "#fdf3ed"
                        : t.surface,
                      padding: "8px 10px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {openModal ? (
                          <button
                            type="button"
                            onClick={openModal}
                            style={{
                              border: "none",
                              background: "transparent",
                              padding: 0,
                              margin: 0,
                              textAlign: "left",
                              cursor: "pointer",
                              color: t.text,
                              fontSize: 13,
                              fontWeight: 800,
                              lineHeight: 1.3,
                            }}
                          >
                            {item.title}
                          </button>
                        ) : (
                          <div style={{ fontSize: 13, fontWeight: 800, color: t.text, lineHeight: 1.3 }}>{item.title}</div>
                        )}
                        <div style={{ fontSize: 11, color: memorialCardTheme ? memorialCardTheme.color : t.textMuted, marginTop: 2 }}>
                          {item.sub}
                        </div>
                        {item.websiteUrl && (
                          <a
                            href={item.websiteUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{ marginTop: 4, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: memorialCardTheme ? memorialCardTheme.color : "#2563eb", fontWeight: 700, textDecoration: "none" }}
                          >
                            Website <ArrowRight size={12} strokeWidth={2.5} aria-hidden />
                          </a>
                        )}
                      </div>
                      {item.thumb && (
                        openModal ? (
                          <button
                            type="button"
                            onClick={openModal}
                            aria-label={item.thumbAlt}
                            style={{
                              border: item.thumbBorder,
                              borderRadius: 6,
                              padding: 0,
                              background: "transparent",
                              cursor: "pointer",
                              flexShrink: 0,
                              width: 44,
                              height: 56,
                              overflow: "hidden",
                            }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={item.thumb}
                              alt=""
                              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                            />
                          </button>
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.thumb}
                            alt=""
                            style={{
                              width: 44,
                              height: 56,
                              objectFit: "cover",
                              borderRadius: 6,
                              border: item.thumbBorder,
                              flexShrink: 0,
                            }}
                          />
                        )
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
          )}
        </div>

        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: t.text, marginBottom: 8 }}>Saved events</div>
          <div style={{ display: "grid", gap: 8 }}>
            {desktopSavedEvents.length === 0 && <div style={{ color: t.textFaint, fontSize: 12 }}>No saved events.</div>}
            {desktopSavedEvents.slice(0, 4).map((ev) => {
              // Saved-event cards open the same in-place event modal as the
              // date-card above. Clicking the title/thumb used to
              // soft-navigate to /events?event=<id> which yanked the user out
              // of the feed/jobs/rabbithole page they were currently on — the
              // modal now opens in place and the page stays put.
              const openThisEvent = () => { void openEventModal(ev.event_id); };
              const thumb = ev.image_url?.trim() ? ev.image_url : null;
              const attendanceLabel =
                ev.my_attendance === "going"
                  ? `GOING${ev.going_count > 0 ? ` · ${ev.going_count}` : ""}`
                  : ev.my_attendance === "interested"
                    ? `INTERESTED${ev.interested_count > 0 ? ` · ${ev.interested_count}` : ""}`
                    : null;
              return (
                <div key={ev.id} style={{ border: `1px solid ${t.border}`, borderRadius: 10, background: t.surface, padding: "8px 10px", position: "relative" }}>
                  <button
                    type="button"
                    aria-label="Remove saved event"
                    title="Remove from Saved Events"
                    onClick={() => unsaveWallEvent(ev.id)}
                    disabled={unsavingWallEvent === ev.id}
                    style={{
                      position: "absolute",
                      top: 6,
                      right: 6,
                      width: 22,
                      height: 22,
                      borderRadius: 999,
                      border: `1px solid ${t.border}`,
                      background: t.surface,
                      color: t.textMuted,
                      fontSize: 14,
                      fontWeight: 800,
                      lineHeight: 1,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: unsavingWallEvent === ev.id ? "not-allowed" : "pointer",
                      opacity: unsavingWallEvent === ev.id ? 0.7 : 1,
                    }}
                  >
                    {unsavingWallEvent === ev.id ? "…" : "×"}
                  </button>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10, paddingRight: 26 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <button
                            type="button"
                            onClick={openThisEvent}
                            style={{
                              fontSize: 12,
                              fontWeight: 800,
                              color: t.text,
                              lineHeight: 1.25,
                              background: "transparent",
                              border: "none",
                              padding: 0,
                              margin: 0,
                              textAlign: "left",
                              cursor: "pointer",
                              minWidth: 0,
                            }}
                          >
                            {ev.title || "Event"}
                          </button>
                          <div style={{ fontSize: 11, color: t.textMuted, marginTop: 3 }}>{ev.organization || "Saved item"}</div>
                        </div>
                        <div style={{ display: "grid", gap: 5, width: 76, flexShrink: 0 }}>
                          {attendanceLabel ? (
                            <span
                              style={{
                                borderRadius: 999,
                                border: `1px solid ${t.border}`,
                                background: ev.my_attendance === "going" ? t.text : t.surface,
                                color: ev.my_attendance === "going" ? t.surface : t.text,
                                fontSize: 10,
                                fontWeight: 800,
                                letterSpacing: 0.3,
                                padding: "3px 7px",
                                lineHeight: 1.1,
                                whiteSpace: "nowrap",
                                textAlign: "center",
                                minHeight: 22,
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              {attendanceLabel}
                            </span>
                          ) : null}
                          {userId ? (
                            <button
                              type="button"
                              onClick={() => openSavedEventInvite(ev)}
                              style={{
                                border: `1px solid ${t.border}`,
                                borderRadius: 999,
                                background: t.badgeBg,
                                color: t.text,
                                padding: "3px 7px",
                                fontSize: 10,
                                fontWeight: 800,
                                letterSpacing: 0.3,
                                lineHeight: 1.1,
                                minHeight: 22,
                                cursor: "pointer",
                              }}
                            >
                              INVITE
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
                        {ev.signup_url ? (
                          <a href={ev.signup_url} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "#2563eb", fontWeight: 700, textDecoration: "none" }}>
                            Website <ArrowRight size={12} strokeWidth={2.5} aria-hidden />
                          </a>
                        ) : null}
                      </div>
                    </div>
                    {thumb && (
                      <button
                        type="button"
                        onClick={openThisEvent}
                        aria-label={`Open details for ${ev.title || "event"}`}
                        style={{
                          width: 44,
                          height: 56,
                          borderRadius: 6,
                          border: `1px solid ${t.border}`,
                          overflow: "hidden",
                          flexShrink: 0,
                          display: "block",
                          padding: 0,
                          background: "transparent",
                          cursor: "pointer",
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={thumb}
                          alt=""
                          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                        />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* Bottom: jobs pane */}
      <div>
        {jobsLoaded && (
          <div style={{ marginBottom: 10, fontSize: 13, color: t.textMuted, fontWeight: 600, lineHeight: 1.45 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 14, marginBottom: 8 }}>
              <Link
                href="/jobs"
                onClick={(e) => {
                  if (!canViewFullJobs) {
                    e.preventDefault();
                    setShowJobsUpgradePrompt(true);
                  }
                }}
                {...sectionTitleLinkZoom}
                style={{
                  fontSize: 15,
                  fontWeight: 900,
                  color: t.text,
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                  display: "inline-block",
                  transform: "scale(1)",
                  transition: "transform 0.15s ease",
                  cursor: "pointer",
                }}
              >
                Jobs
              </Link>
              <a
                href="/jobs"
                onClick={(e) => {
                  if (!canViewFullJobs) {
                    e.preventDefault();
                    setShowJobsUpgradePrompt(true);
                  }
                }}
                style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 700, color: "#2563eb", textDecoration: "none", whiteSpace: "nowrap" }}
              >
                See all <ArrowRight size={13} strokeWidth={2.5} aria-hidden />
              </a>
            </div>
            <div>
              ({jobsTotalApprovedCount !== null ? jobsTotalApprovedCount.toLocaleString() : "—"}) jobs as of{" "}
              {new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" })}
            </div>
            <div style={{ marginTop: 4 }}>
              ({jobsNewTodayCount !== null ? jobsNewTodayCount.toLocaleString() : "—"}) new jobs today!
            </div>
            <div style={{ marginTop: 10 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: t.text }}>Saved jobs</span>
                <span style={{ fontSize: 11, color: t.textFaint, fontWeight: 700 }}>*not visible to other users</span>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {desktopSavedJobs.length === 0 && <div style={{ color: t.textFaint, fontSize: 12 }}>No saved jobs.</div>}
                {desktopSavedJobs.slice(0, 4).map((job) => {
                  const modalJob: JobModalData = {
                    id: job.job_id,
                    title: job.title,
                    company_name: job.company_name,
                    location: job.location,
                    category: job.category,
                    description: job.description,
                    apply_url: job.apply_url,
                    pay_min: job.pay_min,
                    pay_max: job.pay_max,
                    clearance: job.clearance,
                    source_type: job.source_type,
                    created_at: job.created_at,
                    og_title: job.og_title,
                    og_description: job.og_description,
                    og_image: job.og_image,
                    og_site_name: job.og_site_name,
                  };
                  return (
                    <div key={job.id} style={{ border: `1px solid ${t.border}`, borderRadius: 10, background: t.surface, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: t.text, lineHeight: 1.25 }}>{job.title || "Job"}</div>
                      <div style={{ fontSize: 11, color: t.textMuted }}>{job.company_name || "Saved listing"}</div>
                      <JobCardActions
                        job={modalJob}
                        onOpenDetails={setJobDetailsModal}
                        saved
                        canSave={!!userId}
                        isTogglingSave={unsavingDesktopJobId === job.id}
                        onToggleSave={() => unsaveDesktopSavedJob(job.id)}
                        size="compact"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          {jobsLastUpdated ? (
            <div style={{ fontSize: 11, color: t.textFaint, fontWeight: 600 }}>
              Updated {new Date(jobsLastUpdated).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" })}{" "}
              {new Date(jobsLastUpdated).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
            </div>
          ) : (
            <div />
          )}
          <Link
            href="/post-job"
            onClick={(e) => {
              if (blockMemberInteraction()) e.preventDefault();
            }}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, border: "none", background: "none", color: "#2563eb", fontWeight: 700, fontSize: 13, textDecoration: "none", whiteSpace: "nowrap" }}
          >
            Post Job <ArrowRight size={13} strokeWidth={2.5} aria-hidden />
          </Link>
        </div>

        <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
          {!jobsLoaded && [0, 1, 2].map((i) => <SkeletonCard key={i} />)}
          {jobsLoaded && jobsForPane.length === 0 && <div style={{ fontSize: 14, color: t.textMuted }}>No approved jobs yet.</div>}

          {jobsLoaded &&
            jobsForPane.map((job) => (
              <div
                key={job.id}
                style={{
                  border: `1px solid ${t.border}`,
                  borderRadius: 12,
                  overflow: "hidden",
                  background: t.surface,
                }}
              >
                {job.og_image && (
                  <img
                    src={httpsAssetUrl(job.og_image)}
                    alt={job.title || job.og_title || "Job preview"}
                    style={{
                      width: "100%",
                      height: 120,
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                )}

                <div style={{ padding: 12 }}>
                  <div style={{ fontWeight: 800, lineHeight: 1.3 }}>{job.title || job.og_title || "Untitled Job"}</div>

                  <div style={{ marginTop: 4, fontSize: 14, color: t.textMuted }}>{job.company_name || job.og_site_name || "Unknown Company"}</div>

                  <div style={{ marginTop: 6, fontSize: 13, color: t.textMuted }}>{job.location || "Location not listed"}</div>

                  <div style={{ marginTop: 4, fontSize: 13, color: t.textMuted, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span>{job.category || "General"}</span>
                    {job.created_at && <span>• {new Date(job.created_at).toLocaleDateString()}</span>}
                    {job.source_type === "community" && (
                      <span style={{ background: "#dcfce7", color: "#15803d", borderRadius: 20, padding: "1px 7px", fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" }}>
                        Community
                      </span>
                    )}
                  </div>
                  {job.source_type === "community" && !job.anonymous && jobSubmitters.get(job.user_id ?? "") && (
                    <div style={{ marginTop: 3, fontSize: 11, color: t.textFaint }}>posted by {jobSubmitters.get(job.user_id ?? "")}</div>
                  )}

                  {job.og_description && (
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 13,
                        color: t.textMuted,
                        lineHeight: 1.4,
                        display: "-webkit-box",
                        WebkitLineClamp: 4,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {job.og_description}
                    </div>
                  )}

                  <div style={{ marginTop: 10 }}>
                    <JobCardActions
                      job={job as JobModalData}
                      onOpenDetails={setJobDetailsModal}
                      saved={savedJobIds.has(job.id)}
                      canSave={!!userId}
                      isTogglingSave={togglingJobSaveFor === job.id}
                      onToggleSave={(j) => toggleSaveJob(j.id)}
                    />
                  </div>
                </div>
              </div>
            ))}
        </div>
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={openAllJobs}
            style={{
              width: "100%",
              background: "#111",
              color: "white",
              border: "none",
              borderRadius: 10,
              padding: "9px 12px",
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            See All Jobs
          </button>
        </div>
      </div>

      <UpgradePromptModal open={showJobsUpgradePrompt} onClose={() => setShowJobsUpgradePrompt(false)} />
      <JobDetailsModal
        job={jobDetailsModal}
        open={!!jobDetailsModal}
        onClose={() => setJobDetailsModal(null)}
        saved={jobDetailsModal ? savedJobIds.has(jobDetailsModal.id) : false}
        canSave={!!userId}
        isTogglingSave={jobDetailsModal ? togglingJobSaveFor === jobDetailsModal.id : false}
        onToggleSave={(j) => toggleSaveJob(j.id)}
      />

      {eventInviteTarget && typeof document !== "undefined" && createPortal(
        <div
          onClick={() => setEventInviteTarget(null)}
          style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 620, maxHeight: "85vh", overflow: "hidden", background: t.surface, color: t.text, borderRadius: 18, boxShadow: "0 20px 60px rgba(0,0,0,0.4)", display: "flex", flexDirection: "column" }}
          >
            <div style={{ padding: "18px 20px", borderBottom: `1px solid ${t.border}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 19, fontWeight: 900 }}>Invite Members</div>
                <div style={{ marginTop: 4, fontSize: 13, color: t.textMuted }}>{eventInviteTarget.title || "Event"}</div>
              </div>
              <button type="button" onClick={() => setEventInviteTarget(null)} style={{ border: `1px solid ${t.border}`, background: t.surface, color: t.text, borderRadius: 10, padding: "6px 10px", cursor: "pointer", fontWeight: 800 }}>
                X
              </button>
            </div>

            <div style={{ padding: 16, borderBottom: `1px solid ${t.border}`, display: "grid", gap: 12 }}>
              <input
                value={eventInviteQuery}
                onChange={(e) => setEventInviteQuery(e.target.value)}
                placeholder="Search members..."
                style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${t.border}`, borderRadius: 10, padding: "10px 12px", background: t.surface, color: t.text, outline: "none", fontSize: 14 }}
              />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {EVENT_INVITE_BRANCHES.map((branch) => {
                  const active = eventInviteBranches.has(branch);
                  return (
                    <button
                      key={branch}
                      type="button"
                      onClick={() => {
                        setEventInviteBranches((prev) => {
                          const next = new Set(prev);
                          if (next.has(branch)) next.delete(branch);
                          else next.add(branch);
                          return next;
                        });
                      }}
                      style={{ border: `1px solid ${active ? t.text : t.border}`, borderRadius: 999, padding: "5px 10px", background: active ? t.text : t.surface, color: active ? t.surface : t.textMuted, fontSize: 12, fontWeight: 800, cursor: "pointer" }}
                    >
                      {branch}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 12 }}>
              {filteredEventInviteUsers.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: t.textFaint, fontSize: 14 }}>No matching members found.</div>
              ) : (
                filteredEventInviteUsers.map((u) => {
                  const name = u.display_name || `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || "EOD Member";
                  const checked = selectedEventInvites.has(u.user_id);
                  return (
                    <label key={u.user_id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 8px", borderRadius: 12, cursor: "pointer", background: checked ? t.surfaceHover : "transparent" }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setSelectedEventInvites((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(u.user_id);
                            else next.delete(u.user_id);
                            return next;
                          });
                        }}
                      />
                      <div style={{ width: 38, height: 38, borderRadius: "50%", overflow: "hidden", background: "#111", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, flexShrink: 0 }}>
                        {u.photo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={u.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : name[0]?.toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 14 }}>{name}</div>
                        {u.service ? <div style={{ fontSize: 12, color: t.textMuted }}>{u.service}</div> : null}
                      </div>
                    </label>
                  );
                })
              )}
            </div>

            <div style={{ padding: "14px 16px", borderTop: `1px solid ${t.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontSize: 13, color: eventInviteMsg?.startsWith("Invited") ? "#16a34a" : t.textMuted }}>
                {eventInviteMsg ?? (selectedEventInvites.size > 0 ? `${selectedEventInvites.size} selected` : "Select members to invite")}
              </div>
              <button
                type="button"
                onClick={sendSavedEventInvites}
                disabled={selectedEventInvites.size === 0 || sendingEventInvites}
                style={{ border: "none", borderRadius: 10, padding: "9px 18px", fontWeight: 900, cursor: selectedEventInvites.size === 0 || sendingEventInvites ? "not-allowed" : "pointer", background: selectedEventInvites.size === 0 ? t.badgeBg : "#111", color: selectedEventInvites.size === 0 ? t.textMuted : "#fff", opacity: sendingEventInvites ? 0.7 : 1 }}
              >
                {sendingEventInvites ? "Inviting..." : `Invite${selectedEventInvites.size > 0 ? ` (${selectedEventInvites.size})` : ""}`}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Memorial detail modal — visual parity with the modal on /events.
          Rendered via a portal into document.body so parent stacking contexts
          (the aside + the main app grid) can't pin it below the feed
          composer or other high-z page chrome. */}
      {selectedMemorial && typeof document !== "undefined" && createPortal(
        (() => {
          const theme = memorialTheme(selectedMemorial.category);
          return (
        <div
          onClick={() => setSelectedMemorial(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
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
                      border: `3px solid ${theme.color}`,
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={selectedMemorial.photo_url}
                      alt={selectedMemorial.name}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  </div>
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: theme.color, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>
                    {theme.label}
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
                    {new Date().getFullYear() - parseInt(selectedMemorial.death_date.split("-")[0], 10)} years ago
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
                  No biography on file.
                </div>
              )}
              <div style={{ marginTop: 16, fontSize: 11, lineHeight: 1.5, color: t.textFaint, fontStyle: "italic" }}>
                {memorialDisclaimer(selectedMemorial.category)}
              </div>
            </div>
          </div>
        </div>
          );
        })(),
        document.body
      )}

      {/* Event detail modal — opened from the calendar date card AND the saved
          events list, so both entry points give the same experience and
          neither one force-navigates the user out of their current page.
          Portalled to document.body for the same stacking-context reason as
          the memorial modal above. */}
      {selectedEvent && typeof document !== "undefined" && createPortal(
        <div
          onClick={() => setSelectedEvent(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, padding: "22px 24px 10px" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {selectedEvent.image_url ? (
                  <div style={{ marginBottom: 14, borderRadius: 12, overflow: "hidden", border: `1px solid ${t.border}`, aspectRatio: "16 / 9", maxHeight: 220, background: t.bg }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={httpsAssetUrl(selectedEvent.image_url)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  </div>
                ) : null}
                <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.2 }}>
                  {selectedEvent.title || "Untitled Event"}
                </div>
                {selectedEvent.organization && (
                  <div style={{ marginTop: 6, color: t.textMuted, fontSize: 14 }}>
                    {selectedEvent.organization}
                  </div>
                )}
                {selectedEvent.date && (
                  <div style={{ marginTop: 4, color: t.textMuted, fontSize: 13 }}>
                    {new Date(`${selectedEvent.date}T12:00:00`).toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
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
              {selectedEvent.description && (
                <div style={{ color: t.textMuted, lineHeight: 1.6, fontSize: 14, whiteSpace: "pre-wrap" }}>
                  {selectedEvent.description}
                </div>
              )}

              <div style={{ marginTop: 18, borderTop: `1px solid ${t.border}`, paddingTop: 14, display: "grid", gap: 8 }}>
                <div style={{ fontWeight: 800, fontSize: 14 }}>Event Details</div>
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
            </div>

            <div
              style={{
                padding: "14px 24px 20px",
                borderTop: `1px solid ${t.border}`,
                display: "flex",
                flexDirection: "column",
                gap: 0,
                width: "100%",
                boxSizing: "border-box",
              }}
            >
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                <button
                  type="button"
                  onClick={() => toggleSelectedEventRsvp("interested")}
                  disabled={selectedEventBusy}
                  style={{
                    border: `1px solid ${t.border}`,
                    borderRadius: 10,
                    padding: "8px 14px",
                    fontWeight: 800,
                    cursor: selectedEventBusy ? "not-allowed" : "pointer",
                    background: selectedEventMyStatus === "interested" ? t.text : t.surface,
                    color: selectedEventMyStatus === "interested" ? t.surface : t.text,
                    fontSize: 13,
                  }}
                >
                  Interested
                  {selectedEventCounts.interested > 0 ? ` · ${selectedEventCounts.interested}` : ""}
                </button>
                <button
                  type="button"
                  onClick={() => toggleSelectedEventRsvp("going")}
                  disabled={selectedEventBusy}
                  style={{
                    border: `1px solid ${t.border}`,
                    borderRadius: 10,
                    padding: "8px 14px",
                    fontWeight: 800,
                    cursor: selectedEventBusy ? "not-allowed" : "pointer",
                    background: selectedEventMyStatus === "going" ? t.text : t.surface,
                    color: selectedEventMyStatus === "going" ? t.surface : t.text,
                    fontSize: 13,
                  }}
                >
                  Going
                  {selectedEventCounts.going > 0 ? ` · ${selectedEventCounts.going}` : ""}
                </button>
                {selectedEvent.signup_url && (
                  <a
                    href={selectedEvent.signup_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      marginLeft: "auto",
                      display: "inline-block",
                      textDecoration: "none",
                      background: "black",
                      color: "white",
                      padding: "8px 14px",
                      borderRadius: 10,
                      fontWeight: 800,
                      fontSize: 13,
                    }}
                  >
                    Open Event Link
                  </a>
                )}
              </div>
              <EventAttendeeAvatarRows
                interested={selectedEventAttendeePreviews.interested}
                going={selectedEventAttendeePreviews.going}
                onOpenInterested={() => setLeftColAttendeesListModal("interested")}
                onOpenGoing={() => setLeftColAttendeesListModal("going")}
              />
            </div>
          </div>
        </div>,
        document.body
      )}
      <EventAttendeesListModal
        open={leftColAttendeesListModal !== null}
        eventId={selectedEvent?.id ?? null}
        status={leftColAttendeesListModal}
        onClose={() => setLeftColAttendeesListModal(null)}
      />
    </aside>
  );
}
