"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "../../lib/lib/supabaseClient";
import { useTheme } from "../../lib/ThemeContext";
import { getFeatureAccess } from "../../lib/featureAccess";
import { postNotifyJson } from "../../lib/postNotifyClient";
import UpgradePromptModal from "../UpgradePromptModal";
import JobCardActions from "../jobs/JobCardActions";
import JobDetailsModal, { type JobModalData } from "../jobs/JobDetailsModal";
import { httpsAssetUrl, type JobRow } from "./masterShared";

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
  my_attendance: "interested" | "going" | null;
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
};

type DesktopMemorial = {
  id: string;
  name: string;
  death_date: string;
  source_url: string | null;
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
  const { t } = useTheme();

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

  function blockMemberInteraction(): boolean {
    if (memberInteractionAllowedRef.current) return false;
    onMemberPaywall();
    return true;
  }

  const loadDesktopSavedEvents = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from("saved_events")
      .select("id, event_id, events(title, organization, date, signup_url)")
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
        | { title: string | null; organization: string | null; date: string | null; signup_url: string | null }
        | { title: string | null; organization: string | null; date: string | null; signup_url: string | null }[]
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
        my_attendance: null as "interested" | "going" | null,
      };
    });
    const eventIds = rows.map((r) => r.event_id).filter(Boolean);
    if (eventIds.length > 0) {
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
    setDesktopSavedEvents(rows);
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
        .select("id, title, organization, date, signup_url")
        .gte("date", startIso)
        .lte("date", endIso)
        .order("date", { ascending: true }),
      supabase.from("memorials").select("id, name, death_date, source_url"),
    ]);

    setDesktopCalendarEvents((eventsData ?? []) as DesktopCalendarEvent[]);
    setDesktopMemorials((memorialData ?? []) as DesktopMemorial[]);
  }, []);

  async function unsaveWallEvent(rowId: string) {
    if (!window.confirm("Remove this from Saved Events?")) return;
    try {
      setUnsavingWallEvent(rowId);
      await supabase.from("saved_events").delete().eq("id", rowId);
      setDesktopSavedEvents((prev) => prev.filter((e) => e.id !== rowId));
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
      .channel(`left-rail-event-attendance-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "event_attendance", filter: `user_id=eq.${userId}` },
        () => {
          void loadDesktopSavedEvents(userId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(savedEventsChannel);
      supabase.removeChannel(attendanceChannel);
    };
  }, [sideRailsReady, userId, loadDesktopSavedEvents]);

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
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: 0.4,
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
            textTransform: "uppercase",
            userSelect: "none",
          }}
        >
          Jobs
        </span>
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
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: 0.4,
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
            textTransform: "uppercase",
            userSelect: "none",
          }}
        >
          Events
        </span>
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
            <div style={{ fontSize: 15, fontWeight: 900, color: t.text }}>Events</div>
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
          <a href="/events" style={{ color: "#2563eb", fontWeight: 700, fontSize: 12, textDecoration: "none", lineHeight: 1.2 }}>
            Memorial
          </a>
          <span style={{ fontSize: 11, color: t.textFaint }}>|</span>
          <a href="/events" style={{ color: "#2563eb", fontWeight: 700, fontSize: 12, textDecoration: "none", lineHeight: 1.2 }}>
            Event
          </a>
        </div>

        <div style={{ border: `1px solid ${t.border}`, borderRadius: 10, padding: 10, background: t.surface }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <button
              type="button"
              aria-label="Previous day"
              onClick={() => setDesktopCalendarDate((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() - 1))}
              style={{ display: "inline-flex", alignItems: "center", border: `1px solid ${t.border}`, background: "#111", color: "white", borderRadius: 6, fontSize: 12, fontWeight: 700, padding: "3px 8px", cursor: "pointer" }}
            >
              <ChevronLeft size={14} strokeWidth={2.5} aria-hidden />
            </button>
            <div style={{ fontSize: 12, fontWeight: 800, color: t.text }}>{formatShortDate(desktopCalendarDate)}</div>
            <button
              type="button"
              aria-label="Next day"
              onClick={() => setDesktopCalendarDate((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 1))}
              style={{ display: "inline-flex", alignItems: "center", border: `1px solid ${t.border}`, background: "#111", color: "white", borderRadius: 6, fontSize: 12, fontWeight: 700, padding: "3px 8px", cursor: "pointer" }}
            >
              <ChevronRight size={14} strokeWidth={2.5} aria-hidden />
            </button>
          </div>
          {(() => {
            const d = desktopCalendarDate;
            const iso = toDateStr(d.getFullYear(), d.getMonth(), d.getDate());
            const eventCount = desktopCalendarEvents.filter((ev) => ev.date === iso).length;
            const memorialCount = desktopMemorials.filter((m) => anniversaryDate(m.death_date, d.getFullYear()) === iso).length;
            const hasItems = eventCount + memorialCount > 0;
            return (
              <div
                style={{
                  border: `1px solid ${t.border}`,
                  borderRadius: 8,
                  minHeight: 50,
                  padding: "8px 10px",
                  background: t.surface,
                  position: "relative",
                }}
              >
                <div style={{ fontSize: 11, color: t.textFaint, fontWeight: 700 }}>{CALENDAR_DAY_LABELS[d.getDay()]}</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: t.text, lineHeight: 1.1 }}>{d.getDate()}</div>
                {hasItems && (
                  <span style={{ position: "absolute", top: 8, right: 10, fontSize: 11, color: "#2563eb", fontWeight: 800 }}>
                    {eventCount + memorialCount} item{eventCount + memorialCount === 1 ? "" : "s"}
                  </span>
                )}
              </div>
            );
          })()}
        </div>

        {desktopSelectedDay && (
          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            {[
              ...desktopCalendarEvents
                .filter((ev) => ev.date === desktopSelectedDay)
                .map((ev) => ({ id: `ev-${ev.id}`, title: ev.title, sub: ev.organization || "Event", link: ev.signup_url || "/events" })),
              ...desktopMemorials
                .filter((m) => anniversaryDate(m.death_date, new Date(desktopSelectedDay + "T12:00:00").getFullYear()) === desktopSelectedDay)
                .map((m) => ({ id: `mem-${m.id}`, title: m.name, sub: "EOD Memorial Foundation", link: m.source_url || "/events" })),
            ]
              .slice(0, 4)
              .map((item) => (
                <div key={item.id} style={{ border: `1px solid ${t.border}`, borderRadius: 10, background: t.surface, padding: "8px 10px" }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: t.text, lineHeight: 1.3 }}>{item.title}</div>
                  <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>{item.sub}</div>
                  <a
                    href={item.link}
                    target={item.link.startsWith("http") ? "_blank" : undefined}
                    rel="noreferrer"
                    style={{ marginTop: 4, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "#2563eb", fontWeight: 700, textDecoration: "none" }}
                  >
                    {item.link.startsWith("http") ? "Open" : "Sign up"} <ArrowRight size={12} strokeWidth={2.5} aria-hidden />
                  </a>
                </div>
              ))}
          </div>
        )}

        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: t.text, marginBottom: 8 }}>Saved events</div>
          <div style={{ display: "grid", gap: 8 }}>
            {desktopSavedEvents.length === 0 && <div style={{ color: t.textFaint, fontSize: 12 }}>No saved events.</div>}
            {desktopSavedEvents.slice(0, 4).map((ev) => (
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
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, paddingRight: 26 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: t.text, lineHeight: 1.25 }}>{ev.title || "Event"}</div>
                  {ev.my_attendance === "going" && (
                    <span
                      style={{
                        borderRadius: 999,
                        border: `1px solid ${t.border}`,
                        background: t.text,
                        color: t.surface,
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: 0.3,
                        padding: "2px 7px",
                        lineHeight: 1.1,
                        whiteSpace: "nowrap",
                      }}
                    >
                      GOING
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>{ev.organization || "Saved item"}</div>
                <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
                  {ev.signup_url ? (
                    <a href={ev.signup_url} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "#2563eb", fontWeight: 700, textDecoration: "none" }}>
                      Sign up <ArrowRight size={12} strokeWidth={2.5} aria-hidden />
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Bottom: jobs pane */}
      <div>
        {jobsLoaded && (
          <div style={{ marginBottom: 10, fontSize: 13, color: t.textMuted, fontWeight: 600, lineHeight: 1.45 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 14, marginBottom: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 900, color: t.text }}>Jobs</div>
              <a href="/jobs" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 700, color: "#2563eb", textDecoration: "none", whiteSpace: "nowrap" }}>
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
              <div style={{ fontSize: 13, fontWeight: 800, color: t.text, marginBottom: 8 }}>Saved jobs</div>
              <div style={{ marginTop: -4, marginBottom: 8, fontSize: 11, color: t.textFaint, fontWeight: 700 }}>*not visible to other users</div>
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
    </aside>
  );
}
