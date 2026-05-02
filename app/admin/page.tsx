"use client";

export const dynamic = "force-dynamic";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "../lib/lib/supabaseClient";
import NavBar from "../components/NavBar";
import { useTheme } from "../lib/ThemeContext";
import {
  fetchAdminPendingBreakdown,
  formatNavBadgeCount,
  sumAdminPending,
} from "../lib/adminPendingCounts";
import { FLAG_CATEGORY_LABELS, type FlagCategory } from "../lib/flagCategories";
import { BizListingTagsField } from "../components/biz/BizListingTagsField";
import { BizListingTagChips } from "../components/biz/BizListingTagChips";
import { coerceTagsFromDb, normalizeBizTagsInput } from "../lib/bizListingTags";

type BusinessListing = {
  id: string;
  created_at: string;
  business_name: string | null;
  website_url: string;
  custom_blurb: string | null;
  poc_name?: string | null;
  phone_number?: string | null;
  contact_email?: string | null;
  city_state?: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  og_site_name: string | null;
  is_approved: boolean;
  is_featured: boolean;
  tags?: string[] | null;
};

type Job = {
  id: string;
  created_at: string | null;
  title: string | null;
  company_name: string | null;
  location: string | null;
  category: string | null;
  description: string | null;
  apply_url: string | null;
  is_approved: boolean | null;
  source_type: string | null;
};

type UserProfile = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  /** Mirrored from Auth / onboarding for admin + Table Editor visibility (after migration). */
  name?: string | null;
  email: string | null;
  role: string | null;
  service: string | null;
  verification_status: string | null;
  is_admin: boolean | null;
  is_employer: boolean | null;
  employer_verified: boolean | null;
  created_at: string | null;
  community_flag_count?: number | null;
  access_tier?: "basic" | "senior" | "master" | null;
};

type UsersFallbackQueryResult = {
  data: Array<Record<string, unknown>> | null;
  error: { message: string } | null;
};

type AdminGroup = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  cover_photo_url: string | null;
  type: string | null;
  created_by: string | null;
  created_at: string | null;
  member_count: number;
  post_count: number;
  owner_name: string | null;
};

type Tab = "businesses" | "jobs" | "users" | "groups" | "flags" | "events" | "reports" | "directory" | "engagement" | "news";

type NewsIntakeDebugPayload = {
  provider: string;
  matched_queries: string[];
  feed_source: string | null;
  matched_title_terms: string[];
  matched_body_terms: string[];
  matched_terms: string[];
  le_boost_hits: string[];
  le_boost_score: number;
  compound_bonuses: string[];
  compound_score: number;
  final_score: number;
  raw_score: number;
  inclusion_reason: string;
};

type AdminNewsItem = {
  id: string;
  headline: string;
  source_name: string | null;
  source_url: string;
  canonical_url: string | null;
  summary: string | null;
  thumbnail_url: string | null;
  published_at: string | null;
  ingested_at: string;
  tags: string[];
  relevance_score: number | null;
  is_satire: boolean;
  status: "pending" | "published" | "rejected";
  created_at: string;
  reviewed_at: string | null;
  raw_payload?: { intake_debug?: NewsIntakeDebugPayload } | null;
};

type NewsTabFilter = "pending" | "published" | "rejected";

type PreviewStatus =
  | "would_insert"
  | "below_threshold"
  | "no_positive_hits"
  | "negative_in_title"
  | "duplicate_in_db"
  | "duplicate_in_batch";

type PreviewBreakdown = {
  score: number;
  rawScore: number;
  titleHits: number;
  bodyHits: number;
  matchedTitleTerms?: string[];
  matchedBodyTerms?: string[];
  matchedTerms?: string[];
  leBoostHits?: string[];
  leBoostAmount?: number;
  compoundLabels?: string[];
  compoundAmount?: number;
  hasContext: boolean;
  freshnessBonus: number;
  sourceWeight: number;
  negativeIn: "title" | "body" | null;
  dropReason: "no_positive_hits" | "below_threshold" | "negative_in_title" | null;
};

type PreviewCandidate = {
  headline: string;
  source_name: string | null;
  source_url: string;
  canonical_url: string | null;
  summary: string | null;
  thumbnail_url: string | null;
  published_at: string | null;
  is_satire: boolean;
  source_weight: number;
  dedupe_key: string;
  breakdown: PreviewBreakdown;
  intake_debug?: NewsIntakeDebugPayload;
  enriched_from_body: boolean;
  score_before_body: number | null;
  alreadyInDb: boolean;
  status: PreviewStatus;
};

type NewsQueryLaneStat = {
  lane: string;
  fetched: number;
  would_insert: number;
  below_threshold: number;
  no_positive_hits: number;
  negative_in_title: number;
  duplicate_in_db: number;
  duplicate_in_batch: number;
};

type PreviewResult = {
  totalFetched: number;
  blockedCount: number;
  byStatus: Record<PreviewStatus, number>;
  candidates: PreviewCandidate[];
  queryLaneStats?: NewsQueryLaneStat[];
};

type EngagementRange = "today" | "7d" | "30d";

type EngagementSummary = {
  range: EngagementRange;
  generated_at: string;
  kpis: {
    total_users: number;
    new_signups: number;
    new_signups_prev: number;
    visits: number;
    visits_prev: number;
    unique_visitors_in_range: number;
    avg_session_ms: number;
    total_active_ms: number;
    dau: number;
    wau: number;
    mau: number;
  };
  top_pages: Array<{ path: string; total_ms: number; visits: number; avg_ms: number }>;
  most_engaged_users: Array<{
    user_id: string;
    display_name: string | null;
    total_ms: number;
    sessions: number;
  }>;
};

type DirectoryEntry = {
  id: string;
  org_type: string;
  name: string;
  phone: string | null;
  state: string | null;
  unit_slug: string | null;
  base_city: string | null;
  photo_url: string | null;
  is_approved: boolean;
  created_at: string;
};

type LocationRequest = {
  id: string;
  location_name: string;
  reviewed: boolean;
  created_at: string;
};

type BugReport = {
  id: string;
  user_id: string | null;
  message: string;
  screenshot_url: string | null;
  page_url: string | null;
  created_at: string;
  reviewed: boolean;
  reporter_name?: string | null;
};

type Flag = {
  id: string;
  created_at: string;
  reporter_id: string | null;
  content_type: string;
  content_id: string;
  reason: string | null;
  category: string | null;
  reviewed: boolean;
  reporter_name?: string | null;
  content_preview?: string | null;
  content_author_id?: string | null;
  content_author_name?: string | null;
  author_community_flag_count?: number | null;
};

type BizEdit = {
  id: string;
  business_name: string;
  og_title: string;
  og_description: string;
  og_image: string;
  custom_blurb: string;
  poc_name: string;
  phone_number: string;
  contact_email: string;
  city_state: string;
  tags: string[];
};

type Memorial = {
  id: string;
  name: string;
  death_date: string;
  photo_url: string | null;
  bio: string | null;
  source_url: string | null;
};

type MemorialEdit = {
  id: string;
  name: string;
  death_date: string;
  photo_url: string;
  bio: string;
  source_url: string;
};

type AdminCalendarEvent = {
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
  unit_id?: string | null;
  visibility?: string | null;
};

type EventEdit = {
  id: string;
  title: string;
  description: string;
  date: string;
  organization: string;
  signup_url: string;
  image_url: string;
  location: string;
  event_time: string;
  poc_name: string;
  poc_phone: string;
};

function formatDuration(ms: number): string {
  if (!ms || ms < 1000) return "0s";
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin > 0 ? `${hr}h ${remMin}m` : `${hr}h`;
}

function formatDurationLong(ms: number): string {
  if (!ms || ms < 1000) return "0 min";
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 60) return `${totalMin} min`;
  const hr = totalMin / 60;
  if (hr < 24) return `${hr.toFixed(1)} hr`;
  const days = hr / 24;
  return `${days.toFixed(1)} days`;
}

function pctDelta(current: number, previous: number): { sign: 1 | -1 | 0; pct: number } | null {
  if (previous <= 0) {
    if (current > 0) return { sign: 1, pct: 100 };
    return null;
  }
  const raw = ((current - previous) / previous) * 100;
  if (Math.abs(raw) < 0.5) return { sign: 0, pct: 0 };
  return { sign: raw > 0 ? 1 : -1, pct: Math.round(Math.abs(raw)) };
}

function KpiCard({
  t,
  label,
  value,
  sub,
  delta,
  subtle,
}: {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
  value: string;
  sub?: string;
  delta?: { sign: 1 | -1 | 0; pct: number } | null;
  subtle?: boolean;
}) {
  const deltaColor =
    !delta || delta.sign === 0 ? "#737373" : delta.sign === 1 ? "#16a34a" : "#dc2626";
  const deltaPrefix = !delta || delta.sign === 0 ? "" : delta.sign === 1 ? "+" : "−";
  return (
    <div
      style={{
        border: `1px solid ${t.border}`,
        borderRadius: 14,
        background: t.surface,
        padding: subtle ? 12 : 16,
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: subtle ? 22 : 28,
          fontWeight: 900,
          color: t.text,
          marginTop: 6,
          fontVariantNumeric: "tabular-nums",
          wordBreak: "break-word",
        }}
      >
        {value}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, minHeight: 16 }}>
        {delta && (
          <span style={{ fontSize: 12, fontWeight: 700, color: deltaColor }}>
            {deltaPrefix}
            {delta.pct}%
          </span>
        )}
        {sub && (
          <span style={{ fontSize: 12, color: t.textFaint }}>{sub}</span>
        )}
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("businesses");

  const [businesses, setBusinesses] = useState<BusinessListing[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [groupSearch, setGroupSearch] = useState("");
  const [flags, setFlags] = useState<Flag[]>([]);

  const [pendingOnly, setPendingOnly] = useState(true);
  const [userFilter, setUserFilter] = useState<"all" | "pending" | "verified" | "denied">("pending");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [editingBiz, setEditingBiz] = useState<BizEdit | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  const [batchActing, setBatchActing] = useState(false);
const [memWizUrl, setMemWizUrl] = useState("");
  const [memWizName, setMemWizName] = useState("");
  const [memWizDate, setMemWizDate] = useState("");
  const [memWizImage, setMemWizImage] = useState("");
  const [memWizBio, setMemWizBio] = useState("");
  const [memWizFetching, setMemWizFetching] = useState(false);
  const [memWizSaving, setMemWizSaving] = useState(false);
  const [memWizMsg, setMemWizMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [memorials, setMemorials] = useState<Memorial[]>([]);
  const [editingMemorial, setEditingMemorial] = useState<MemorialEdit | null>(null);
  const [memEditSaving, setMemEditSaving] = useState(false);
  const [memPhotoUploading, setMemPhotoUploading] = useState(false);
  const memorialPhotoInputRef = useRef<HTMLInputElement | null>(null);
  /** Admin memorial list: expand/collapse long bios (Manage Memorials cards). */
  const [memorialBioExpandedIds, setMemorialBioExpandedIds] = useState<Record<string, boolean>>({});
  /** Client-side filter for the Manage Memorials list (matches name / bio). */
  const [memorialSearch, setMemorialSearch] = useState("");
  const [isMobile, setIsMobile] = useState(false);

  const [adminEvents, setAdminEvents] = useState<AdminCalendarEvent[]>([]);
  const [editingEvent, setEditingEvent] = useState<EventEdit | null>(null);
  const [eventEditSaving, setEventEditSaving] = useState(false);
  const [eventPhotoUploading, setEventPhotoUploading] = useState(false);
  const eventPhotoInputRef = useRef<HTMLInputElement | null>(null);
  /** Client-side filter for the Manage Events list (matches title / org / location / POC). */
  const [eventSearch, setEventSearch] = useState("");

  /** Filtered lists for the Manage {Events,Memorials} admin tables. */
  const filteredAdminEvents = useMemo(() => {
    const q = eventSearch.trim().toLowerCase();
    if (!q) return adminEvents;
    return adminEvents.filter((ev) => {
      const haystack = [
        ev.title,
        ev.organization,
        ev.location,
        ev.poc_name,
        ev.event_time,
        ev.description,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [adminEvents, eventSearch]);
  const filteredMemorials = useMemo(() => {
    const q = memorialSearch.trim().toLowerCase();
    if (!q) return memorials;
    return memorials.filter((m) => {
      const haystack = [m.name, m.bio, m.death_date].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [memorials, memorialSearch]);

  const [bugReports, setBugReports] = useState<BugReport[]>([]);
  const [reportsFilter, setReportsFilter] = useState<"unreviewed" | "all">("unreviewed");

  const [directoryEntries, setDirectoryEntries] = useState<DirectoryEntry[]>([]);
  const [editingDirectory, setEditingDirectory] = useState<DirectoryEntry | null>(null);
  const [dirEditSaving, setDirEditSaving] = useState(false);
  const [locationRequests, setLocationRequests] = useState<LocationRequest[]>([]);
  const [engagement, setEngagement] = useState<EngagementSummary | null>(null);
  const [engagementLoading, setEngagementLoading] = useState(false);
  const [engagementRange, setEngagementRange] = useState<EngagementRange>("7d");

  const [newsItems, setNewsItems] = useState<AdminNewsItem[]>([]);
  const [newsFilter, setNewsFilter] = useState<NewsTabFilter>("pending");
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsActingId, setNewsActingId] = useState<string | null>(null);
  const [newsPendingCount, setNewsPendingCount] = useState(0);
  const [newsRunStats, setNewsRunStats] = useState<string | null>(null);
  const [newsRunning, setNewsRunning] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [previewStatusFilter, setPreviewStatusFilter] = useState<PreviewStatus | "all">("all");
  const [previewSearch, setPreviewSearch] = useState("");
  const [previewInsertingKey, setPreviewInsertingKey] = useState<string | null>(null);
  const [previewInsertedKeys, setPreviewInsertedKeys] = useState<Set<string>>(new Set());
  const [previewDismissingKey, setPreviewDismissingKey] = useState<string | null>(null);
  const [previewDismissedKeys, setPreviewDismissedKeys] = useState<Set<string>>(new Set());
  const [previewBulkDismissing, setPreviewBulkDismissing] = useState(false);
  const [previewSelected, setPreviewSelected] = useState<Set<string>>(new Set());
  const [previewBulkSending, setPreviewBulkSending] = useState(false);
  const [newsSelected, setNewsSelected] = useState<Set<string>>(new Set());
  const [newsBulkBusy, setNewsBulkBusy] = useState(false);

  const [pendingCounts, setPendingCounts] = useState({
    biz: 0,
    jobs: 0,
    users: 0,
    flags: 0,
    reports: 0,
    dir: 0,
    locReq: 0,
  });

  const { t, isDark } = useTheme();

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  function askConfirm(message: string, onConfirm: () => void) {
    setConfirmDialog({ message, onConfirm });
  }

  async function loadPendingCounts() {
    const next = await fetchAdminPendingBreakdown(supabase);
    setPendingCounts(next);
  }

  async function loadEngagement(range: EngagementRange = engagementRange) {
    setEngagementLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/engagement?range=${range}`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      if (!res.ok) {
        console.error("loadEngagement error", res.status);
        return;
      }
      const json = (await res.json()) as EngagementSummary;
      setEngagement(json);
    } catch (err) {
      console.error("loadEngagement failed", err);
    } finally {
      setEngagementLoading(false);
    }
  }

  async function loadNews(filter: NewsTabFilter = newsFilter) {
    setNewsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/news?status=${filter}`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      if (!res.ok) {
        console.error("loadNews error", res.status);
        setNewsItems([]);
        return;
      }
      const json = await res.json();
      setNewsItems((json.items ?? []) as AdminNewsItem[]);
    } catch (err) {
      console.error("loadNews failed", err);
    } finally {
      setNewsLoading(false);
    }
  }

  async function loadNewsPendingCount() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/news?status=pending`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      if (!res.ok) return;
      const json = await res.json();
      setNewsPendingCount((json.items ?? []).length);
    } catch { /* noop */ }
  }

  async function actOnNewsItem(id: string, action: "approve" | "reject") {
    setNewsActingId(id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/news`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ id, action }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        showToast(`Action failed: ${j.error || res.status}`);
        return;
      }
      setNewsItems((prev) => prev.filter((n) => n.id !== id));
      setNewsSelected((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      showToast(action === "approve" ? "Published to feed" : "Rejected");
      void loadNewsPendingCount();
    } finally {
      setNewsActingId(null);
    }
  }

  function toggleNewsSelected(id: string) {
    setNewsSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleNewsSelectAll() {
    setNewsSelected((prev) => {
      if (prev.size === newsItems.length && newsItems.length > 0) return new Set();
      return new Set(newsItems.map((n) => n.id));
    });
  }

  async function bulkNewsAction(payload: Record<string, unknown>, label: string) {
    setNewsBulkBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/news`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(`${label} failed: ${j.error || res.status}`);
        return;
      }
      const n = (j.deleted ?? j.updated ?? 0) as number;
      showToast(`${label}: ${n} item${n === 1 ? "" : "s"}`);
      setNewsSelected(new Set());
      await loadNews(newsFilter);
      void loadNewsPendingCount();
    } finally {
      setNewsBulkBusy(false);
    }
  }

  function bulkRejectSelected() {
    const ids = Array.from(newsSelected);
    if (ids.length === 0) return;
    askConfirm(`Reject ${ids.length} item${ids.length === 1 ? "" : "s"}?`, () =>
      void bulkNewsAction({ ids, action: "reject" }, "Rejected")
    );
  }

  function bulkApproveSelected() {
    const ids = Array.from(newsSelected);
    if (ids.length === 0) return;
    askConfirm(`Approve ${ids.length} item${ids.length === 1 ? "" : "s"} to the feed?`, () =>
      void bulkNewsAction({ ids, action: "approve" }, "Published")
    );
  }

  function bulkDeleteSelected() {
    const ids = Array.from(newsSelected);
    if (ids.length === 0) return;
    askConfirm(
      `Permanently delete ${ids.length} item${ids.length === 1 ? "" : "s"}? This cannot be undone.`,
      () => void bulkNewsAction({ ids, action: "delete" }, "Deleted")
    );
  }

  function bulkRejectAllPending() {
    askConfirm(
      `Reject ALL ${newsPendingCount} pending news items? They'll move to the Rejected tab.`,
      () =>
        void bulkNewsAction(
          { scope: "all", status: "pending", action: "reject" },
          "Rejected all pending"
        )
    );
  }

  function bulkDeleteAllRejected() {
    askConfirm(
      `Permanently delete every item in the Rejected tab? This cannot be undone.`,
      () =>
        void bulkNewsAction(
          { scope: "all", status: "rejected", action: "delete" },
          "Cleared rejected"
        )
    );
  }

  async function triggerNewsIngestion() {
    setNewsRunning(true);
    setNewsRunStats(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/news/run-ingestion`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNewsRunStats(`Error: ${j.error || res.status}`);
      } else {
        const s = j.stats || {};
        const bodyBit = s.bodyFetched ? `, body-fetched ${s.bodyFetched} (rescued ${s.bodyEnrichedPasses ?? 0})` : "";
        setNewsRunStats(
          `fetched ${s.fetched ?? 0}, scored ${s.scored ?? 0}, dropped ${s.belowThreshold ?? 0} (low score), ${s.duplicates ?? 0} dup, inserted ${s.inserted ?? 0}, capped ${s.capped ?? 0}${bodyBit}`
        );
        await loadNews(newsFilter);
        await loadNewsPendingCount();
      }
    } finally {
      setNewsRunning(false);
    }
  }

  async function loadPreview() {
    setPreviewLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/news/preview`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(`Preview failed: ${j.error || res.status}`);
        return;
      }
      setPreviewResult(j as PreviewResult);
      setPreviewInsertedKeys(new Set());
    } finally {
      setPreviewLoading(false);
    }
  }

  async function dismissPreviewCandidates(items: PreviewCandidate[], reason = "preview_dismiss"): Promise<boolean> {
    if (items.length === 0) return false;
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`/api/admin/news/preview`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token ?? ""}`,
      },
      body: JSON.stringify({
        items: items.map((c) => ({
          dedupe_key: c.dedupe_key,
          headline: c.headline,
          source_url: c.source_url,
          source_name: c.source_name,
        })),
        reason,
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast(`Dismiss failed: ${j.error || res.status}`);
      return false;
    }
    return true;
  }

  async function dismissOnePreview(c: PreviewCandidate) {
    setPreviewDismissingKey(c.dedupe_key);
    try {
      const ok = await dismissPreviewCandidates([c]);
      if (!ok) return;
      setPreviewDismissedKeys((prev) => {
        const next = new Set(prev);
        next.add(c.dedupe_key);
        return next;
      });
    } finally {
      setPreviewDismissingKey(null);
    }
  }

  function togglePreviewSelected(key: string) {
    setPreviewSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function clearPreviewSelected() {
    setPreviewSelected(new Set());
  }

  async function bulkSendSelectedToPending(selected: PreviewCandidate[]) {
    if (selected.length === 0) return;
    askConfirm(
      `Send ${selected.length} selected candidate${selected.length === 1 ? "" : "s"} to the pending queue?`,
      async () => {
        setPreviewBulkSending(true);
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const res = await fetch(`/api/admin/news/preview`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session?.access_token ?? ""}`,
            },
            body: JSON.stringify({ candidates: selected }),
          });
          const j = await res.json().catch(() => ({}));
          if (!res.ok) {
            showToast(`Bulk send failed: ${j.error || res.status}`);
            return;
          }
          setPreviewInsertedKeys((prev) => {
            const next = new Set(prev);
            for (const c of selected) next.add(c.dedupe_key);
            return next;
          });
          setPreviewSelected(new Set());
          showToast(`Sent ${j.inserted ?? 0} of ${j.requested ?? selected.length} to pending`);
          void loadNewsPendingCount();
        } finally {
          setPreviewBulkSending(false);
        }
      }
    );
  }

  async function bulkDismissSelected(selected: PreviewCandidate[]) {
    if (selected.length === 0) return;
    askConfirm(
      `Permanently dismiss ${selected.length} selected candidate${selected.length === 1 ? "" : "s"}? They'll never reappear in the pipeline.`,
      async () => {
        setPreviewBulkDismissing(true);
        try {
          const ok = await dismissPreviewCandidates(selected, "preview_dismiss_selected");
          if (!ok) return;
          setPreviewDismissedKeys((prev) => {
            const next = new Set(prev);
            for (const c of selected) next.add(c.dedupe_key);
            return next;
          });
          setPreviewSelected(new Set());
          showToast(`Blocked ${selected.length} dedupe key${selected.length === 1 ? "" : "s"}`);
        } finally {
          setPreviewBulkDismissing(false);
        }
      }
    );
  }

  async function dismissVisiblePreview(visible: PreviewCandidate[]) {
    if (visible.length === 0) return;
    const targets = visible.filter((c) => !previewDismissedKeys.has(c.dedupe_key));
    if (targets.length === 0) {
      showToast("Nothing to dismiss");
      return;
    }
    askConfirm(
      `Permanently dismiss ${targets.length} candidate${targets.length === 1 ? "" : "s"}? They'll never reappear in the pipeline (reversible via SQL).`,
      async () => {
        setPreviewBulkDismissing(true);
        try {
          const ok = await dismissPreviewCandidates(targets, "preview_dismiss_bulk");
          if (!ok) return;
          setPreviewDismissedKeys((prev) => {
            const next = new Set(prev);
            for (const c of targets) next.add(c.dedupe_key);
            return next;
          });
          showToast(`Blocked ${targets.length} dedupe key${targets.length === 1 ? "" : "s"}`);
        } finally {
          setPreviewBulkDismissing(false);
        }
      }
    );
  }

  async function insertPreviewCandidate(c: PreviewCandidate) {
    setPreviewInsertingKey(c.dedupe_key);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/news/preview`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ candidate: c }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(`Insert failed: ${j.error || res.status}`);
        return;
      }
      setPreviewInsertedKeys((prev) => {
        const next = new Set(prev);
        next.add(c.dedupe_key);
        return next;
      });
      showToast("Sent to pending queue");
      void loadNewsPendingCount();
    } finally {
      setPreviewInsertingKey(null);
    }
  }

  async function loadBusinesses() {
    const query = supabase
      .from("business_listings")
      .select("*")
      .order("created_at", { ascending: false });
    const { data, error } = pendingOnly
      ? await query.neq("is_approved", true)
      : await query;
    if (error) { console.error(error); return; }
    setBusinesses((data ?? []) as BusinessListing[]);
  }

  async function loadJobs() {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`/api/admin/jobs?pendingOnly=${pendingOnly}`, {
      headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
    });
    if (!res.ok) { console.error("loadJobs API error", res.status); return; }
    const json = await res.json();
    setJobs((json.jobs ?? []) as Job[]);
  }

  async function loadUsers() {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/admin/users", {
      headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
    });
    if (!res.ok) {
      // Fallback: direct query (works if RLS allows admin to read all profiles)
      let fallback = (await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, display_name, name, email, role, service, verification_status, is_admin, is_employer, employer_verified, created_at, access_tier")
        .order("created_at", { ascending: false })) as UsersFallbackQueryResult;
      if (fallback.error) {
        fallback = (await supabase
          .from("profiles")
          .select("user_id, first_name, last_name, display_name, role, service, verification_status, is_admin, is_employer, employer_verified, created_at, access_tier")
          .order("created_at", { ascending: false })) as UsersFallbackQueryResult;
      }
      if (fallback.error) {
        fallback = (await supabase
          .from("profiles")
          .select("user_id, first_name, last_name, display_name, role, service, verification_status, is_admin, is_employer, employer_verified, created_at")
          .order("created_at", { ascending: false })) as UsersFallbackQueryResult;
      }
      if (!fallback.error) setUsers((fallback.data ?? []).map((u) => ({ ...u, email: (u as { email?: string | null }).email ?? null })) as UserProfile[]);
      return;
    }
    const json = await res.json();
    setUsers((json.users ?? []) as UserProfile[]);
  }

  async function loadGroups(search = groupSearch) {
    const { data: { session } } = await supabase.auth.getSession();
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    const res = await fetch(`/api/admin/groups${params.toString() ? `?${params.toString()}` : ""}`, {
      headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({} as { error?: string }));
      alert(json.error ?? "Could not load groups.");
      return;
    }
    const json = await res.json();
    setGroups((json.groups ?? []) as AdminGroup[]);
  }

  async function loadFlags() {
    const { data, error } = await supabase
      .from("flags")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) { console.error(error); return; }

    const rawFlags = (data ?? []) as Flag[];

    // Enrich with reporter names and content previews
    const reporterIds = [...new Set(rawFlags.map((f) => f.reporter_id).filter(Boolean))] as string[];
    const postIds = rawFlags.filter((f) => f.content_type === "post").map((f) => f.content_id);
    const unitPostIds = rawFlags.filter((f) => f.content_type === "unit_post").map((f) => f.content_id);
    const commentIds = rawFlags.filter((f) => f.content_type === "comment").map((f) => f.content_id);
    const messageIds = rawFlags.filter((f) => f.content_type === "message").map((f) => f.content_id);

    const [profilesRes, postsRes, unitPostsRes, commentsRes, msgsRes] = await Promise.all([
      reporterIds.length > 0 ? supabase.from("profiles").select("user_id, first_name, last_name, display_name").in("user_id", reporterIds) : { data: [] },
      postIds.length > 0 ? supabase.from("posts").select("id, user_id, content").in("id", postIds) : { data: [] },
      unitPostIds.length > 0 ? supabase.from("unit_posts").select("id, user_id, content").in("id", unitPostIds) : { data: [] },
      commentIds.length > 0 ? supabase.from("post_comments").select("id, user_id, content").in("id", commentIds) : { data: [] },
      messageIds.length > 0 ? supabase.from("messages").select("id, sender_id, content, gif_url").in("id", messageIds) : { data: [] },
    ]);

    type ProfileRow = { user_id: string; first_name: string | null; last_name: string | null; display_name: string | null };
    type PostRow = { id: string; user_id: string; content: string | null };
    type CommentRow = { id: string; user_id: string; content: string | null };
    type MsgRow = { id: string; sender_id: string; content: string | null; gif_url: string | null };

    const profileMap = new Map<string, string>();
    ((profilesRes.data ?? []) as ProfileRow[]).forEach((p) => {
      profileMap.set(p.user_id, p.display_name || `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Unknown");
    });

    const contentMap = new Map<string, string>();
    const authorByContentId = new Map<string, string>();
    ((postsRes.data ?? []) as PostRow[]).forEach((c) => {
      contentMap.set(c.id, c.content || "");
      authorByContentId.set(c.id, c.user_id);
    });
    ((unitPostsRes.data ?? []) as PostRow[]).forEach((c) => {
      contentMap.set(c.id, c.content || "");
      authorByContentId.set(c.id, c.user_id);
    });
    ((commentsRes.data ?? []) as CommentRow[]).forEach((c) => {
      contentMap.set(c.id, c.content || "");
      authorByContentId.set(c.id, c.user_id);
    });
    ((msgsRes.data ?? []) as MsgRow[]).forEach((m) => {
      contentMap.set(m.id, m.content || (m.gif_url ? "[GIF message]" : ""));
      authorByContentId.set(m.id, m.sender_id);
    });

    const authorIds = [...new Set(rawFlags.map((f) => authorByContentId.get(f.content_id)).filter(Boolean))] as string[];
    const { data: authorProfiles } = authorIds.length > 0
      ? await supabase
          .from("profiles")
          .select("user_id, first_name, last_name, display_name, community_flag_count")
          .in("user_id", authorIds)
      : { data: [] };
    type AuthorRow = { user_id: string; first_name: string | null; last_name: string | null; display_name: string | null; community_flag_count: number | null };
    const authorMeta = new Map<string, { name: string; flagCount: number }>();
    ((authorProfiles ?? []) as AuthorRow[]).forEach((p) => {
      authorMeta.set(p.user_id, {
        name: p.display_name || `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Unknown",
        flagCount: p.community_flag_count ?? 0,
      });
    });

    setFlags(rawFlags.map((f) => {
      const aid = authorByContentId.get(f.content_id) ?? null;
      const am = aid ? authorMeta.get(aid) : undefined;
      const cat = f.category as FlagCategory | null;
      const categoryLabel = cat && cat in FLAG_CATEGORY_LABELS ? FLAG_CATEGORY_LABELS[cat] : f.category;
      return {
        ...f,
        category: categoryLabel ?? f.category,
        reporter_name: f.reporter_id ? profileMap.get(f.reporter_id) ?? null : null,
        content_preview: contentMap.get(f.content_id) ?? null,
        content_author_id: aid,
        content_author_name: am?.name ?? null,
        author_community_flag_count: am?.flagCount ?? null,
      };
    }));
  }

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }

      const { data: profile } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!profile?.is_admin) {
        setLoading(false);
        setAuthorized(false);
        return;
      }

      setAuthorized(true);
      await Promise.all([loadBusinesses(), loadJobs(), loadUsers(), loadFlags(), loadPendingCounts()]);
      setLoading(false);
    }
    init();
  }, []);

  useEffect(() => {
    if (!authorized) return;
    if (activeTab === "businesses") loadBusinesses();
    if (activeTab === "jobs") loadJobs();
    if (activeTab === "users") loadUsers();
    if (activeTab === "groups") loadGroups();
    if (activeTab === "flags") loadFlags();
    if (activeTab === "events") {
      void loadAdminEvents();
      void loadMemorials();
    }
    if (activeTab === "reports") loadBugReports();
    if (activeTab === "directory") loadDirectory();
    if (activeTab === "engagement") void loadEngagement(engagementRange);
    if (activeTab === "news") void loadNews(newsFilter);
  }, [pendingOnly, activeTab, authorized, engagementRange, newsFilter]);

  useEffect(() => {
    if (!authorized) return;
    void loadNewsPendingCount();
  }, [authorized]);

  useEffect(() => {
    function check() {
      setIsMobile(typeof window !== "undefined" && window.innerWidth <= 900);
    }
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (!authorized) return;
    const tick = () => void loadPendingCounts();
    const id = window.setInterval(tick, 120_000);
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [authorized]);

  async function approveBusiness(id: string, featured = false) {
    setActionLoading(id);
    const { error } = await supabase
      .from("business_listings")
      .update({ is_approved: true, is_featured: featured })
      .eq("id", id);
    if (error) { alert(error.message); } else { showToast(featured ? "Approved & featured!" : "Approved!"); await Promise.all([loadBusinesses(), loadPendingCounts()]); }
    setActionLoading(null);
  }

  async function toggleBusinessFeatured(id: string, nextFeatured: boolean) {
    setActionLoading(id);
    const { error } = await supabase
      .from("business_listings")
      .update({ is_featured: nextFeatured })
      .eq("id", id);
    if (error) {
      alert(error.message);
    } else {
      showToast(nextFeatured ? "Listing featured." : "Listing unfeatured.");
      await Promise.all([loadBusinesses(), loadPendingCounts()]);
    }
    setActionLoading(null);
  }

  async function rejectBusiness(id: string) {
    askConfirm("Delete this business listing?", async () => {
      setActionLoading(id);
      const { error } = await supabase.from("business_listings").delete().eq("id", id);
      if (error) { alert(error.message); } else { showToast("Listing removed."); await Promise.all([loadBusinesses(), loadPendingCounts()]); }
      setActionLoading(null);
    });
  }

  async function approveJob(id: string) {
    // Optimistically remove from pending list immediately
    if (pendingOnly) setJobs((prev) => prev.filter((j) => j.id !== id));
    setPendingCounts((prev) => ({ ...prev, jobs: Math.max(0, prev.jobs - 1) }));
    showToast("Job approved!");

    const { data: { session } } = await supabase.auth.getSession();
    await fetch(`/api/admin/approve-job?id=${id}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
    });
    await loadPendingCounts();
  }

  async function rejectJob(id: string) {
    askConfirm("Delete this job posting?", async () => {
      setActionLoading(id);
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/delete-job?id=${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      if (!res.ok) {
        let err: { error?: string } = {};
        try { err = await res.json(); } catch { /* ignore */ }
        alert(err.error ?? "Delete failed");
      } else {
        showToast("Job removed.");
        setJobs((prev) => prev.filter((j) => j.id !== id));
        await loadPendingCounts();
      }
      setActionLoading(null);
    });
  }

  async function batchApproveJobs() {
    if (selectedJobs.size === 0) return;
    setBatchActing(true);
    const { data: { session } } = await supabase.auth.getSession();
    const ids = [...selectedJobs];
    await Promise.all(ids.map((id) =>
      fetch(`/api/admin/approve-job?id=${id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      })
    ));
    if (pendingOnly) {
      setJobs((prev) => prev.filter((j) => !selectedJobs.has(j.id)));
    } else {
      setJobs((prev) => prev.map((j) => selectedJobs.has(j.id) ? { ...j, is_approved: true } : j));
    }
    showToast(`${ids.length} job${ids.length > 1 ? "s" : ""} approved!`);
    setSelectedJobs(new Set());
    setBatchActing(false);
    await loadPendingCounts();
  }

  async function batchRejectJobs() {
    if (selectedJobs.size === 0) return;
    askConfirm(`Delete ${selectedJobs.size} selected job${selectedJobs.size > 1 ? "s" : ""}?`, async () => {
      setBatchActing(true);
      const { data: { session } } = await supabase.auth.getSession();
      const ids = [...selectedJobs];
      await Promise.all(ids.map((id) =>
        fetch(`/api/admin/delete-job?id=${id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
        })
      ));
      setJobs((prev) => prev.filter((j) => !selectedJobs.has(j.id)));
      showToast(`${ids.length} job${ids.length > 1 ? "s" : ""} deleted.`);
      setSelectedJobs(new Set());
      setBatchActing(false);
      await loadPendingCounts();
    });
  }

  function toggleJobSelection(id: string) {
    setSelectedJobs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function deleteUser(userId: string) {
    askConfirm("Delete this user account?", async () => {
      setActionLoading(userId + "-delete");
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`/api/admin/delete-user?id=${userId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
        });
        let json: { error?: string } = {};
        try { json = await res.json(); } catch { /* ignore */ }
        if (!res.ok) {
          alert(json.error ?? "Delete failed");
        } else {
          showToast("User deleted.");
          await loadUsers();
          await loadPendingCounts();
        }
      } finally {
        setActionLoading(null);
      }
    });
  }

  async function deleteGroup(group: AdminGroup) {
    askConfirm(`Delete the group “${group.name}”? This will remove its members, posts, and join requests.`, async () => {
      setActionLoading(group.id + "-delete");
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`/api/admin/groups?id=${group.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
        });
        const json = await res.json().catch(() => ({} as { error?: string }));
        if (!res.ok) {
          alert(json.error ?? "Delete failed");
        } else {
          showToast("Group deleted.");
          await loadGroups();
        }
      } finally {
        setActionLoading(null);
      }
    });
  }

  async function setVerification(userId: string, status: string) {
    setActionLoading(userId + "-verify");
    try {
      if (status === "verified") {
        // Use API route — updates DB + sends verification email
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch("/api/admin/verify-user", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token ?? ""}`,
          },
          body: JSON.stringify({ userId }),
        });
        let json: { error?: string } = {};
        try { json = await res.json(); } catch { /* ignore */ }
        if (!res.ok) {
          alert(json.error ?? "Verification failed");
        } else {
          showToast("User verified — email sent!");
          await Promise.all([loadUsers(), loadPendingCounts()]);
        }
      } else {
        const { error } = await supabase.from("profiles").update({ verification_status: status }).eq("user_id", userId);
        if (error) { alert(error.message); } else { showToast(`Verification set to "${status}"`); await Promise.all([loadUsers(), loadPendingCounts()]); }
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function denyUser(userId: string) {
    if (!confirm("Deny this user's access? They will be blocked from the app.")) return;
    setActionLoading(userId + "-deny");
    try {
      const { error } = await supabase.from("profiles").update({ verification_status: "denied" }).eq("user_id", userId);
      if (error) { alert(error.message); } else { showToast("User denied."); await Promise.all([loadUsers(), loadPendingCounts()]); }
    } finally {
      setActionLoading(null);
    }
  }

  async function setProfileFlag(userId: string, flag: string, value: boolean, loadingKey: string, successMsg: string, extraFields?: Record<string, string>) {
    setActionLoading(loadingKey);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/set-profile-flag", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
        body: JSON.stringify({ targetUserId: userId, flag, value, extraFields }),
      });
      const json = await res.json();
      if (!res.ok) { alert(json.error ?? "Update failed"); } else { showToast(successMsg); await loadUsers(); }
    } finally {
      setActionLoading(null);
    }
  }

  async function toggleAdmin(userId: string, current: boolean | null) {
    if (!confirm(`${current ? "Remove" : "Grant"} admin access for this user?`)) return;
    await setProfileFlag(userId, "is_admin", !current, userId + "-admin", current ? "Admin removed." : "Admin granted!");
  }

  async function toggleEmployer(userId: string, current: boolean | null) {
    let extraFields: Record<string, string> | undefined;
    if (!current) {
      const url = window.prompt("Company website URL (optional):", "https://");
      if (url !== null && url.trim() && url.trim() !== "https://") {
        extraFields = { company_website: url.trim() };
      }
    }
    await setProfileFlag(userId, "is_employer", !current, userId + "-employer", !current ? "Employer status granted." : "Employer status removed.", extraFields);
  }

  async function toggleEmployerVerified(userId: string, current: boolean | null) {
    await setProfileFlag(userId, "employer_verified", !current, userId + "-empverify", !current ? "Employer verified!" : "Verification removed.");
  }

  async function setAccessTier(userId: string, accessTier: "basic" | "senior" | "master") {
    setActionLoading(userId + "-tier");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/set-access-tier", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ targetUserId: userId, accessTier }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error ?? "Tier update failed");
      } else {
        showToast(`Access tier set to ${accessTier}.`);
        await loadUsers();
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function dismissFlag(id: string) {
    setActionLoading(id);
    const { error } = await supabase.from("flags").update({ reviewed: true }).eq("id", id);
    if (error) { alert(error.message); } else { showToast("Flag dismissed."); await Promise.all([loadFlags(), loadPendingCounts()]); }
    setActionLoading(null);
  }

  function startEditBiz(biz: BusinessListing) {
    setEditingBiz({
      id: biz.id,
      business_name: biz.business_name || "",
      og_title: biz.og_title || "",
      og_description: biz.og_description || "",
      og_image: biz.og_image || "",
      custom_blurb: biz.custom_blurb || "",
      poc_name: biz.poc_name || "",
      phone_number: biz.phone_number || "",
      contact_email: biz.contact_email || "",
      city_state: biz.city_state || "",
      tags: coerceTagsFromDb(biz.tags),
    });
  }

  async function handleImageUpload(file: File) {
    setUploadingImage(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `biz-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("business-images").upload(path, file, { upsert: true });
    if (error) { alert("Upload error: " + error.message); setUploadingImage(false); return; }
    const { data } = supabase.storage.from("business-images").getPublicUrl(path);
    setEditingBiz((prev) => prev ? { ...prev, og_image: data.publicUrl } : prev);
    setUploadingImage(false);
  }

  async function saveBizEdit() {
    if (!editingBiz) return;
    setActionLoading(editingBiz.id + "-edit");
    const tagList = normalizeBizTagsInput(editingBiz.tags);
    let { error } = await supabase
      .from("business_listings")
      .update({
        business_name: editingBiz.business_name || null,
        og_title: editingBiz.og_title || null,
        og_description: editingBiz.og_description || null,
        og_image: editingBiz.og_image || null,
        custom_blurb: editingBiz.custom_blurb || null,
        poc_name: editingBiz.poc_name || null,
        phone_number: editingBiz.phone_number || null,
        contact_email: editingBiz.contact_email || null,
        city_state: editingBiz.city_state || null,
        tags: tagList,
      })
      .eq("id", editingBiz.id);
    if (error) {
      const msg = (error as { message?: string }).message?.toLowerCase() ?? "";
      if (msg.includes("tags") && msg.includes("column")) {
        const r2 = await supabase
          .from("business_listings")
          .update({
            business_name: editingBiz.business_name || null,
            og_title: editingBiz.og_title || null,
            og_description: editingBiz.og_description || null,
            og_image: editingBiz.og_image || null,
            custom_blurb: editingBiz.custom_blurb || null,
            poc_name: editingBiz.poc_name || null,
            phone_number: editingBiz.phone_number || null,
            contact_email: editingBiz.contact_email || null,
            city_state: editingBiz.city_state || null,
          })
          .eq("id", editingBiz.id);
        error = r2.error;
      }
    }
    if (error) { alert(error.message); } else { showToast("Listing updated!"); setEditingBiz(null); await loadBusinesses(); }
    setActionLoading(null);
  }

  async function removeFlaggedContent(flag: Flag) {
    if (!confirm(`Permanently delete this ${flag.content_type}?`)) return;
    setActionLoading(flag.id + "-remove");
    const table =
      flag.content_type === "post"
        ? "posts"
        : flag.content_type === "unit_post"
        ? "unit_posts"
        : "post_comments";
    const { error } = await supabase.from(table).delete().eq("id", flag.content_id);
    if (error) { alert(error.message); return; }
    await supabase.from("flags").update({ reviewed: true }).eq("id", flag.id);
    showToast(`${flag.content_type === "unit_post" ? "Group post" : flag.content_type === "post" ? "Post" : "Comment"} removed.`);
    await loadFlags();
    setActionLoading(null);
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
      if (!res.ok) throw new Error(json.error || "Could not load info");
      // og:title is "Name | EOD Warrior Foundation", og:description is "M/D/YYYY"
      if (json.title) setMemWizName(json.title);
      if (json.description) {
        // Parse M/D/YYYY → YYYY-MM-DD for the date input
        const m = json.description.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (m) setMemWizDate(`${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`);
      }
      if (json.image) setMemWizImage(json.image);
      if (json.bio) setMemWizBio(json.bio);
    } catch (err) {
      setMemWizMsg({ type: "err", text: `Could not get info from that page — fill in manually. (${err instanceof Error ? err.message : String(err)})` });
    } finally {
      setMemWizFetching(false);
    }
  }

  async function saveMemorial() {
    if (!memWizName.trim() || !memWizDate) return;
    setMemWizSaving(true);
    setMemWizMsg(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not logged in");
      const source_url = memWizUrl.trim() || null;
      // Check for duplicate
      if (source_url) {
        const { data: existing } = await supabase.from("memorials").select("id").eq("source_url", source_url).maybeSingle();
        if (existing) { setMemWizMsg({ type: "err", text: "Already imported." }); return; }
      }
      const { error } = await supabase.from("memorials").insert([{
        user_id: user.id,
        name: memWizName.trim(),
        death_date: memWizDate,
        source_url,
        bio: memWizBio.trim() || null,
        photo_url: memWizImage.trim() || null,
      }]);
      if (error) throw new Error(error.message);
      setMemWizMsg({ type: "ok", text: `${memWizName.trim()} added.` });
      setMemWizUrl("");
      setMemWizName("");
      setMemWizDate("");
      setMemWizImage("");
      setMemWizBio("");
    } catch (err) {
      setMemWizMsg({ type: "err", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setMemWizSaving(false);
    }
  }

  async function loadBugReports() {
    const query = supabase
      .from("bug_reports")
      .select("id, user_id, message, screenshot_url, page_url, created_at, reviewed")
      .order("created_at", { ascending: false });
    const { data, error } = reportsFilter === "unreviewed"
      ? await query.eq("reviewed", false)
      : await query;
    if (error) { console.error(error); return; }

    const reports = (data ?? []) as BugReport[];
    const userIds = [...new Set(reports.map((r) => r.user_id).filter(Boolean))] as string[];
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name")
        .in("user_id", userIds);
      const nameMap = new Map((profiles ?? []).map((p: { user_id: string; first_name: string | null; last_name: string | null }) => [
        p.user_id,
        `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Unknown",
      ]));
      reports.forEach((r) => { r.reporter_name = r.user_id ? (nameMap.get(r.user_id) ?? null) : null; });
    }
    setBugReports(reports);
  }

  async function markReportReviewed(id: string) {
    setActionLoading(id);
    await supabase.from("bug_reports").update({ reviewed: true }).eq("id", id);
    showToast("Marked as reviewed.");
    await Promise.all([loadBugReports(), loadPendingCounts()]);
    setActionLoading(null);
  }

  async function deleteBugReport(id: string) {
    askConfirm("Delete this report?", async () => {
      setActionLoading(id);
      await supabase.from("bug_reports").delete().eq("id", id);
      showToast("Report deleted.");
      await Promise.all([loadBugReports(), loadPendingCounts()]);
      setActionLoading(null);
    });
  }

  async function loadMemorials() {
    const { data, error } = await supabase
      .from("memorials")
      .select("id, name, death_date, photo_url, bio, source_url")
      .order("death_date", { ascending: false });
    if (error) { console.error(error); return; }
    setMemorials((data ?? []) as Memorial[]);
  }

  async function loadAdminEvents() {
    const { data, error } = await supabase
      .from("events")
      .select("id, user_id, title, description, date, organization, signup_url, image_url, location, event_time, poc_name, poc_phone, created_at, unit_id, visibility")
      .order("date", { ascending: false })
      .limit(500);
    if (error) {
      console.error("Admin events load error:", error);
      return;
    }
    setAdminEvents((data ?? []) as AdminCalendarEvent[]);
  }

  async function updateAdminEvent() {
    if (!editingEvent || !editingEvent.title.trim() || !editingEvent.date) return;
    setEventEditSaving(true);
    try {
      const { data, error } = await supabase
        .from("events")
        .update({
          title: editingEvent.title.trim(),
          description: editingEvent.description.trim() || null,
          date: editingEvent.date,
          organization: editingEvent.organization.trim() || null,
          signup_url: editingEvent.signup_url.trim() || null,
          image_url: editingEvent.image_url.trim() || null,
          location: editingEvent.location.trim() || null,
          event_time: editingEvent.event_time.trim() || null,
          poc_name: editingEvent.poc_name.trim() || null,
          poc_phone: editingEvent.poc_phone.trim() || null,
        })
        .eq("id", editingEvent.id)
        .select("id");
      if (error) throw new Error(error.message);
      // Defense-in-depth: Supabase returns success with 0 rows when an RLS
      // policy silently blocks an update — see the memorials reversion fix
      // in updateMemorial. If a future RLS regression comes back, this will
      // surface it instead of silently snapping the date back to the old value.
      if (!data || data.length === 0) {
        throw new Error(
          "No rows were updated. You may not have permission to edit this event, or the row was removed."
        );
      }
      showToast("Event updated.");
      setEditingEvent(null);
      await loadAdminEvents();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setEventEditSaving(false);
    }
  }

  async function deleteAdminEvent(id: string, title: string) {
    askConfirm(`Delete event “${title}”? This cannot be undone.`, async () => {
      const { error } = await supabase.from("events").delete().eq("id", id);
      if (error) {
        alert(error.message);
        return;
      }
      showToast("Event deleted.");
      await loadAdminEvents();
    });
  }

  async function updateMemorial() {
    if (!editingMemorial || !editingMemorial.name.trim() || !editingMemorial.death_date) return;
    setMemEditSaving(true);
    try {
      const { data, error } = await supabase.from("memorials").update({
        name: editingMemorial.name.trim(),
        death_date: editingMemorial.death_date,
        photo_url: editingMemorial.photo_url.trim() || null,
        bio: editingMemorial.bio.trim() || null,
        source_url: editingMemorial.source_url.trim() || null,
      }).eq("id", editingMemorial.id).select("id");
      if (error) throw new Error(error.message);
      // Defense-in-depth: Supabase returns success with 0 rows when an RLS
      // policy silently blocks an update. Catch that explicitly so a future
      // policy regression can never look like a successful save.
      if (!data || data.length === 0) {
        throw new Error(
          "No rows were updated. You may not have permission to edit this memorial, or the row was removed."
        );
      }
      showToast("Memorial updated.");
      setEditingMemorial(null);
      await loadMemorials();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setMemEditSaving(false);
    }
  }

  async function uploadMemorialPhoto(file: File): Promise<string> {
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `memorials/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("feed-images").upload(path, file, { upsert: false });
    if (error) throw error;
    return supabase.storage.from("feed-images").getPublicUrl(path).data.publicUrl;
  }

  async function handleMemorialPhotoPick(file: File | null) {
    if (!file) return;
    if (!editingMemorial) return;
    try {
      setMemPhotoUploading(true);
      const publicUrl = await uploadMemorialPhoto(file);
      setEditingMemorial((prev) => (prev ? { ...prev, photo_url: publicUrl } : prev));
    } catch (err) {
      const msg = (err as { message?: string } | null)?.message || "Failed to upload photo.";
      alert(msg);
    } finally {
      setMemPhotoUploading(false);
    }
  }

  async function uploadEventImage(file: File): Promise<string> {
    // Mirrors uploadMemorialPhoto + the events page's `event-covers/` prefix so
    // every event cover (whether created from /events or edited from /admin)
    // lands in the same bucket/folder.
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `event-covers/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("feed-images").upload(path, file, { upsert: false });
    if (error) throw error;
    return supabase.storage.from("feed-images").getPublicUrl(path).data.publicUrl;
  }

  async function handleEventPhotoPick(file: File | null) {
    if (!file) return;
    if (!editingEvent) return;
    try {
      setEventPhotoUploading(true);
      const publicUrl = await uploadEventImage(file);
      setEditingEvent((prev) => (prev ? { ...prev, image_url: publicUrl } : prev));
    } catch (err) {
      const msg = (err as { message?: string } | null)?.message || "Failed to upload photo.";
      alert(msg);
    } finally {
      setEventPhotoUploading(false);
    }
  }

  async function deleteMemorial(id: string, name: string) {
    askConfirm(`Delete memorial for ${name}? This cannot be undone.`, async () => {
      const { error } = await supabase.from("memorials").delete().eq("id", id);
      if (error) { alert(error.message); return; }
      showToast("Memorial deleted.");
      await loadMemorials();
    });
  }

  async function loadDirectory() {
    const [dirRes, locRes] = await Promise.all([
      supabase.from("unit_directory").select("*").order("created_at", { ascending: false }),
      supabase.from("location_requests").select("*").order("created_at", { ascending: false }),
    ]);
    if (!dirRes.error) setDirectoryEntries((dirRes.data ?? []) as DirectoryEntry[]);
    if (!locRes.error) setLocationRequests((locRes.data ?? []) as LocationRequest[]);
  }

  async function markLocReviewed(id: string) {
    await supabase.from("location_requests").update({ reviewed: true }).eq("id", id);
    setLocationRequests((prev) => prev.map((r) => r.id === id ? { ...r, reviewed: true } : r));
    await loadPendingCounts();
  }

  async function deleteLocRequest(id: string) {
    await supabase.from("location_requests").delete().eq("id", id);
    setLocationRequests((prev) => prev.filter((r) => r.id !== id));
    await loadPendingCounts();
  }

  async function approveDirectoryEntry(id: string) {
    setActionLoading(id);
    const { error } = await supabase.from("unit_directory").update({ is_approved: true }).eq("id", id);
    if (error) { alert(error.message); } else { showToast("Entry approved!"); await Promise.all([loadDirectory(), loadPendingCounts()]); }
    setActionLoading(null);
  }

  async function denyDirectoryEntry(id: string) {
    askConfirm("Delete this directory submission?", async () => {
      setActionLoading(id);
      const { error } = await supabase.from("unit_directory").delete().eq("id", id);
      if (error) { alert(error.message); } else { showToast("Entry removed."); await Promise.all([loadDirectory(), loadPendingCounts()]); }
      setActionLoading(null);
    });
  }

  async function saveDirectoryEdit() {
    if (!editingDirectory) return;
    const name = editingDirectory.name.trim();
    const org = editingDirectory.org_type.trim();
    if (!name || !org) {
      alert("Name and organization type are required.");
      return;
    }
    setDirEditSaving(true);
    try {
      const { error } = await supabase
        .from("unit_directory")
        .update({
          org_type: org,
          name,
          phone: editingDirectory.phone?.trim() || null,
          state: editingDirectory.state?.trim() || null,
          base_city: editingDirectory.base_city?.trim() || null,
          unit_slug: editingDirectory.unit_slug?.trim() || null,
          photo_url: editingDirectory.photo_url?.trim() || null,
        })
        .eq("id", editingDirectory.id);
      if (error) {
        alert(error.message);
      } else {
        showToast("Directory entry updated.");
        setEditingDirectory(null);
        await loadDirectory();
      }
    } finally {
      setDirEditSaving(false);
    }
  }

  const tabStyle = (tab: Tab): React.CSSProperties => ({
    padding: "9px 20px",
    borderRadius: 10,
    border: "none",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    background: activeTab === tab ? "#111" : t.badgeBg,
    color: activeTab === tab ? "white" : t.text,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  });

  const tabNotifyBadge = (count: number) =>
    count > 0 ? (
      <span
        style={{
          background: "#fbbf24",
          color: "black",
          borderRadius: 20,
          minWidth: 18,
          height: 18,
          fontSize: 10,
          fontWeight: 800,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 5px",
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        {formatNavBadgeCount(count)}
      </span>
    ) : null;

  const actionBtn = (color: string): React.CSSProperties => ({
    padding: "6px 14px",
    borderRadius: 8,
    border: "none",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    background: color,
    color: "white",
  });

  function memorialBioPreview(mem: Memorial, variant: "mobile" | "desktop") {
    const bio = mem.bio?.trim();
    if (!bio) return null;
    const expanded = memorialBioExpandedIds[mem.id] ?? false;
    const likelyNeedsToggle = bio.length > 90 || bio.includes("\n");
    const showToggle = likelyNeedsToggle || expanded;
    const fontSize = variant === "mobile" ? 13 : 12;
    const color = variant === "mobile" ? t.textMuted : t.textFaint;
    const marginTop = variant === "mobile" ? 8 : 2;
    return (
      <div style={{ marginTop, minWidth: 0, width: "100%" }}>
        <div
          style={{
            fontSize,
            color,
            lineHeight: 1.5,
            wordBreak: "break-word",
            ...(expanded
              ? {}
              : {
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical" as const,
                  overflow: "hidden",
                }),
          }}
        >
          {bio}
        </div>
        {showToggle && (
          <button
            type="button"
            onClick={() =>
              setMemorialBioExpandedIds((prev) => ({
                ...prev,
                [mem.id]: !prev[mem.id],
              }))
            }
            style={{
              marginTop: 6,
              padding: 0,
              border: "none",
              background: "none",
              color: "#d9582b",
              fontWeight: 700,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ width: "100%", maxWidth: 1800, margin: "0 auto", padding: "24px 20px", boxSizing: "border-box", background: t.bg, minHeight: "100vh", color: t.text, overflowX: "clip" }}>
        <NavBar />
        <div style={{ marginTop: 40, textAlign: "center", color: t.textMuted }}>Loading...</div>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div style={{ width: "100%", maxWidth: 1800, margin: "0 auto", padding: "24px 20px", boxSizing: "border-box", background: t.bg, minHeight: "100vh", color: t.text, overflowX: "clip" }}>
        <NavBar />
        <div style={{ marginTop: 60, textAlign: "center" }}>
          <div style={{ fontSize: 48 }}>🚫</div>
          <div style={{ fontSize: 22, fontWeight: 900, marginTop: 12 }}>Access Denied</div>
          <div style={{ color: t.textMuted, marginTop: 8 }}>You don&apos;t have admin privileges.</div>
        </div>
      </div>
    );
  }

  const pendingBizCount = businesses.filter((b) => !b.is_approved).length;
  const pendingJobCount = jobs.filter((j) => !j.is_approved).length;
  const unreviewedFlagCount = flags.filter((f) => !f.reviewed).length;
  const adminTotalPending = sumAdminPending(pendingCounts);
  const directoryPendingTotal = pendingCounts.dir + pendingCounts.locReq;

  return (
    <div style={{ width: "100%", maxWidth: 1800, margin: "0 auto", padding: "24px 20px", boxSizing: "border-box", background: t.bg, minHeight: "100vh", color: t.text, overflowX: "clip" }}>
      <NavBar />

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, background: "#111", color: "white", padding: "12px 20px", borderRadius: 12, fontWeight: 700, fontSize: 14, zIndex: 9999, boxShadow: "0 4px 20px rgba(0,0,0,0.2)" }}>
          ✓ {toast}
        </div>
      )}

      {/* Confirm Dialog */}
      {confirmDialog && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: t.surface, borderRadius: 16, padding: "28px 32px", maxWidth: 400, width: "100%", boxShadow: "0 8px 40px rgba(0,0,0,0.2)" }}>
            <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 8, color: t.text }}>{confirmDialog.message}</div>
            <div style={{ fontSize: 14, color: "#ef4444", fontWeight: 700, marginBottom: 24 }}>This action cannot be undone.</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setConfirmDialog(null)}
                style={{ padding: "10px 20px", borderRadius: 10, border: `1px solid ${t.border}`, background: t.surface, color: t.text, fontWeight: 700, cursor: "pointer", fontSize: 14 }}
              >
                Cancel
              </button>
              <button
                onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }}
                style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "#ef4444", color: "white", fontWeight: 700, cursor: "pointer", fontSize: 14 }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {editingDirectory && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10001, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: t.surface, borderRadius: 16, padding: "24px 28px", maxWidth: 480, width: "100%", boxShadow: "0 8px 40px rgba(0,0,0,0.2)", maxHeight: "90vh", overflow: "auto" }}>
            <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 6, color: t.text }}>Edit directory entry</div>
            <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 16 }}>Update listing details, phone, location, slug, or photo URL.</div>
            <div style={{ display: "grid", gap: 10 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: t.textMuted }}>Organization type</label>
              <input
                value={editingDirectory.org_type}
                onChange={(e) => setEditingDirectory({ ...editingDirectory, org_type: e.target.value })}
                style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.input, color: t.text, fontSize: 14 }}
              />
              <label style={{ fontSize: 12, fontWeight: 700, color: t.textMuted }}>Name</label>
              <input
                value={editingDirectory.name}
                onChange={(e) => setEditingDirectory({ ...editingDirectory, name: e.target.value })}
                style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.input, color: t.text, fontSize: 14 }}
              />
              <label style={{ fontSize: 12, fontWeight: 700, color: t.textMuted }}>Phone</label>
              <input
                value={editingDirectory.phone ?? ""}
                onChange={(e) => setEditingDirectory({ ...editingDirectory, phone: e.target.value || null })}
                style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.input, color: t.text, fontSize: 14 }}
              />
              <label style={{ fontSize: 12, fontWeight: 700, color: t.textMuted }}>State / region</label>
              <input
                value={editingDirectory.state ?? ""}
                onChange={(e) => setEditingDirectory({ ...editingDirectory, state: e.target.value || null })}
                style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.input, color: t.text, fontSize: 14 }}
              />
              <label style={{ fontSize: 12, fontWeight: 700, color: t.textMuted }}>Base / city</label>
              <input
                value={editingDirectory.base_city ?? ""}
                onChange={(e) => setEditingDirectory({ ...editingDirectory, base_city: e.target.value || null })}
                style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.input, color: t.text, fontSize: 14 }}
              />
              <label style={{ fontSize: 12, fontWeight: 700, color: t.textMuted }}>Unit slug (groups page)</label>
              <input
                value={editingDirectory.unit_slug ?? ""}
                onChange={(e) => setEditingDirectory({ ...editingDirectory, unit_slug: e.target.value || null })}
                placeholder="e.g. 192d-eod-bn"
                style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.input, color: t.text, fontSize: 14 }}
              />
              <label style={{ fontSize: 12, fontWeight: 700, color: t.textMuted }}>Photo URL</label>
              <input
                value={editingDirectory.photo_url ?? ""}
                onChange={(e) => setEditingDirectory({ ...editingDirectory, photo_url: e.target.value || null })}
                placeholder="https://…"
                style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.input, color: t.text, fontSize: 14 }}
              />
              {editingDirectory.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- admin preview
                <img src={editingDirectory.photo_url} alt="" style={{ width: 72, height: 72, borderRadius: 8, objectFit: "cover", border: `1px solid ${t.border}` }} />
              ) : null}
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
              <button
                type="button"
                onClick={() => setEditingDirectory(null)}
                disabled={dirEditSaving}
                style={{ padding: "10px 20px", borderRadius: 10, border: `1px solid ${t.border}`, background: t.surface, color: t.text, fontWeight: 700, cursor: "pointer", fontSize: 14 }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveDirectoryEdit()}
                disabled={dirEditSaving}
                style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "#1d4ed8", color: "white", fontWeight: 700, cursor: "pointer", fontSize: 14, opacity: dirEditSaving ? 0.7 : 1 }}
              >
                {dirEditSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 1000, width: "100%", minWidth: 0, margin: "0 auto", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 20, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 32, fontWeight: 900, margin: 0, color: t.text, display: "flex", alignItems: "center", gap: 10 }}>
            Admin Panel
            {tabNotifyBadge(adminTotalPending)}
          </h1>
          <span style={{ background: "#fef3c7", color: "#92400e", fontSize: 12, fontWeight: 800, padding: "3px 10px", borderRadius: 20, textTransform: "uppercase", letterSpacing: 0.5 }}>Admin Only</span>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginTop: 24, flexWrap: "wrap" }}>
          <button type="button" style={tabStyle("businesses")} onClick={() => setActiveTab("businesses")}>
            Businesses
            {tabNotifyBadge(pendingCounts.biz)}
          </button>
          <button type="button" style={tabStyle("jobs")} onClick={() => setActiveTab("jobs")}>
            Jobs
            {tabNotifyBadge(pendingCounts.jobs)}
          </button>
          <button type="button" style={tabStyle("users")} onClick={() => setActiveTab("users")}>
            Users
            {tabNotifyBadge(pendingCounts.users)}
          </button>
          <button type="button" style={tabStyle("groups")} onClick={() => setActiveTab("groups")}>
            Groups
          </button>
          <button type="button" style={tabStyle("flags")} onClick={() => setActiveTab("flags")}>
            Flags
            {tabNotifyBadge(pendingCounts.flags)}
          </button>
          <button type="button" style={tabStyle("events")} onClick={() => setActiveTab("events")}>
            Events
          </button>
          <button type="button" style={tabStyle("reports")} onClick={() => setActiveTab("reports")}>
            Reports
            {tabNotifyBadge(pendingCounts.reports)}
          </button>
          <button type="button" style={tabStyle("directory")} onClick={() => setActiveTab("directory")}>
            Directory
            {tabNotifyBadge(directoryPendingTotal)}
          </button>
          <button type="button" style={tabStyle("engagement")} onClick={() => setActiveTab("engagement")}>
            Engagement
          </button>
          <button type="button" style={tabStyle("news")} onClick={() => setActiveTab("news")}>
            News
            {tabNotifyBadge(newsPendingCount)}
          </button>

          <label style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", color: t.textMuted }}>
            <input type="checkbox" checked={pendingOnly} onChange={(e) => setPendingOnly(e.target.checked)} style={{ width: 16, height: 16, cursor: "pointer" }} />
            Pending only
          </label>
        </div>

        {/* ── BUSINESSES TAB ── */}
        {activeTab === "businesses" && (
          <div style={{ marginTop: 20 }}>
            {businesses.length === 0 && (
              <div style={{ padding: 32, textAlign: "center", color: t.textFaint, border: `1px solid ${t.border}`, borderRadius: 14, background: t.surface }}>
                {pendingOnly ? "No pending business submissions." : "No business listings found."}
              </div>
            )}
            <div style={{ display: "grid", gap: 14 }}>
              {businesses.map((biz) => (
                <div key={biz.id} style={{ border: `1px solid ${t.border}`, borderRadius: 14, background: t.surface, overflow: "hidden" }}>
                  <div style={{ display: "flex", gap: 0 }}>
                    {biz.og_image && (
                      <img src={biz.og_image} alt="" style={{ width: 140, height: 110, objectFit: "cover", flexShrink: 0 }} />
                    )}
                    <div style={{ padding: 16, flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                        <div>
                          <div style={{ fontWeight: 900, fontSize: 17, color: t.text }}>{biz.business_name || biz.og_title || biz.og_site_name || "Unnamed"}</div>
                          <a href={biz.website_url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: "#1d4ed8", wordBreak: "break-all" }}>{biz.website_url}</a>
                          {biz.custom_blurb && <div style={{ marginTop: 6, fontSize: 14, color: t.textMuted, lineHeight: 1.5 }}>{biz.custom_blurb}</div>}
                          {biz.og_description && !biz.custom_blurb && <div style={{ marginTop: 6, fontSize: 13, color: t.textMuted, lineHeight: 1.5 }}>{biz.og_description}</div>}
                          {(biz.poc_name || biz.phone_number || biz.contact_email || biz.city_state) && (
                            <div style={{ marginTop: 8, display: "grid", gap: 3 }}>
                              {biz.poc_name && <div style={{ fontSize: 12, color: t.textMuted }}><strong style={{ color: t.text }}>POC:</strong> {biz.poc_name}</div>}
                              {biz.phone_number && <div style={{ fontSize: 12, color: t.textMuted }}><strong style={{ color: t.text }}>Phone:</strong> {biz.phone_number}</div>}
                              {biz.contact_email && <div style={{ fontSize: 12, color: t.textMuted }}><strong style={{ color: t.text }}>Email:</strong> {biz.contact_email}</div>}
                              {biz.city_state && <div style={{ fontSize: 12, color: t.textMuted }}><strong style={{ color: t.text }}>Location:</strong> {biz.city_state}</div>}
                            </div>
                          )}
                          <BizListingTagChips tags={coerceTagsFromDb(biz.tags)} />
                          <div style={{ marginTop: 6, fontSize: 12, color: t.textFaint }}>{new Date(biz.created_at).toLocaleDateString()}</div>
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
                          {biz.is_approved ? (
                            <>
                              <span style={{ background: "#dcfce7", color: "#15803d", fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 20 }}>Approved</span>
                              {!biz.is_featured && (
                                <button style={{ ...actionBtn("#f59e0b"), display: "flex", alignItems: "center", gap: 5 }} disabled={actionLoading === biz.id} onClick={() => toggleBusinessFeatured(biz.id, true)}>
                                  {actionLoading === biz.id && <span className="btn-spinner" />}
                                  Feature
                                </button>
                              )}
                              {biz.is_featured && (
                                <>
                                  <span style={{ background: "#fef3c7", color: "#92400e", fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 20 }}>Featured</span>
                                  <button style={{ ...actionBtn("#92400e"), display: "flex", alignItems: "center", gap: 5 }} disabled={actionLoading === biz.id} onClick={() => toggleBusinessFeatured(biz.id, false)}>
                                    {actionLoading === biz.id && <span className="btn-spinner" />}
                                    Unfeature
                                  </button>
                                </>
                              )}
                            </>
                          ) : (
                            <>
                              <button style={{ ...actionBtn("#16a34a"), display: "flex", alignItems: "center", gap: 5 }} disabled={actionLoading === biz.id} onClick={() => approveBusiness(biz.id, false)}>
                                {actionLoading === biz.id && <span className="btn-spinner" />}
                                Approve
                              </button>
                              <button style={{ ...actionBtn("#f59e0b"), display: "flex", alignItems: "center", gap: 5 }} disabled={actionLoading === biz.id} onClick={() => approveBusiness(biz.id, true)}>
                                {actionLoading === biz.id && <span className="btn-spinner" />}
                                Approve + Feature
                              </button>
                            </>
                          )}
                          <button style={{ ...actionBtn("#ef4444"), display: "flex", alignItems: "center", gap: 5 }} disabled={actionLoading === biz.id} onClick={() => rejectBusiness(biz.id)}>
                            {actionLoading === biz.id && <span className="btn-spinner" />}
                            Delete
                          </button>
                          <button
                            style={actionBtn(editingBiz?.id === biz.id ? "#6b7280" : "#374151")}
                            onClick={() => editingBiz?.id === biz.id ? setEditingBiz(null) : startEditBiz(biz)}
                          >
                            {editingBiz?.id === biz.id ? "Cancel" : "Edit"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* Inline edit form */}
                  {editingBiz?.id === biz.id && (
                    <div style={{ borderTop: `1px solid ${t.border}`, padding: 16, background: t.bg, display: "grid", gap: 10 }}>
                      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 2, color: t.text }}>Edit Listing</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div>
                          <label style={{ fontSize: 12, fontWeight: 700, color: t.textMuted, display: "block", marginBottom: 4 }}>Business Name</label>
                          <input
                            value={editingBiz.business_name}
                            onChange={(e) => setEditingBiz({ ...editingBiz, business_name: e.target.value })}
                            style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, fontSize: 14, boxSizing: "border-box", background: t.input, color: t.text }}
                            placeholder="Business Name"
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 12, fontWeight: 700, color: t.textMuted, display: "block", marginBottom: 4 }}>OG Title</label>
                          <input
                            value={editingBiz.og_title}
                            onChange={(e) => setEditingBiz({ ...editingBiz, og_title: e.target.value })}
                            style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, fontSize: 14, boxSizing: "border-box", background: t.input, color: t.text }}
                            placeholder="Page title from website"
                          />
                        </div>
                      </div>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 700, color: t.textMuted, display: "block", marginBottom: 4 }}>Description / Blurb</label>
                        <textarea
                          value={editingBiz.custom_blurb || editingBiz.og_description}
                          onChange={(e) => setEditingBiz({ ...editingBiz, custom_blurb: e.target.value })}
                          rows={3}
                          style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, fontSize: 14, resize: "vertical", boxSizing: "border-box", background: t.input, color: t.text }}
                          placeholder="Custom description shown on the listing"
                        />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div>
                          <label style={{ fontSize: 12, fontWeight: 700, color: t.textMuted, display: "block", marginBottom: 4 }}>POC Information</label>
                          <input
                            value={editingBiz.poc_name}
                            onChange={(e) => setEditingBiz({ ...editingBiz, poc_name: e.target.value })}
                            style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, fontSize: 14, boxSizing: "border-box", background: t.input, color: t.text }}
                            placeholder="Point of contact name"
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 12, fontWeight: 700, color: t.textMuted, display: "block", marginBottom: 4 }}>Phone Number</label>
                          <input
                            value={editingBiz.phone_number}
                            onChange={(e) => setEditingBiz({ ...editingBiz, phone_number: e.target.value })}
                            style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, fontSize: 14, boxSizing: "border-box", background: t.input, color: t.text }}
                            placeholder="(555) 555-5555"
                          />
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div>
                          <label style={{ fontSize: 12, fontWeight: 700, color: t.textMuted, display: "block", marginBottom: 4 }}>Email</label>
                          <input
                            value={editingBiz.contact_email}
                            onChange={(e) => setEditingBiz({ ...editingBiz, contact_email: e.target.value })}
                            style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, fontSize: 14, boxSizing: "border-box", background: t.input, color: t.text }}
                            placeholder="support@example.org"
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 12, fontWeight: 700, color: t.textMuted, display: "block", marginBottom: 4 }}>City / State</label>
                          <input
                            value={editingBiz.city_state}
                            onChange={(e) => setEditingBiz({ ...editingBiz, city_state: e.target.value })}
                            style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, fontSize: 14, boxSizing: "border-box", background: t.input, color: t.text }}
                            placeholder="City, State"
                          />
                        </div>
                      </div>
                      <BizListingTagsField
                        value={editingBiz.tags}
                        onChange={(next) => setEditingBiz({ ...editingBiz, tags: next })}
                      />
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 700, color: t.textMuted, display: "block", marginBottom: 4 }}>Photo</label>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          {editingBiz.og_image && (
                            <img src={editingBiz.og_image} alt="" style={{ width: 80, height: 60, objectFit: "cover", borderRadius: 6, border: `1px solid ${t.border}` }} />
                          )}
                          <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 6 }}>
                            <input
                              value={editingBiz.og_image}
                              onChange={(e) => setEditingBiz({ ...editingBiz, og_image: e.target.value })}
                              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, fontSize: 13, boxSizing: "border-box", background: t.input, color: t.text }}
                              placeholder="Image URL (paste or upload below)"
                            />
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <label style={{ padding: "6px 12px", borderRadius: 8, background: "#374151", color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                                {uploadingImage ? "Uploading..." : "Upload Photo"}
                                <input
                                  type="file"
                                  accept="image/*"
                                  style={{ display: "none" }}
                                  disabled={uploadingImage}
                                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); }}
                                />
                              </label>
                              {editingBiz.og_image && (
                                <button style={{ ...actionBtn("#ef4444"), fontSize: 12 }} onClick={() => setEditingBiz({ ...editingBiz, og_image: "" })}>
                                  Remove Photo
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4 }}>
                        <button style={actionBtn("#6b7280")} onClick={() => setEditingBiz(null)}>Cancel</button>
                        <button
                          style={actionBtn("#16a34a")}
                          disabled={actionLoading === editingBiz.id + "-edit" || uploadingImage}
                          onClick={saveBizEdit}
                        >
                          {actionLoading === editingBiz.id + "-edit" ? "Saving..." : "Save Changes"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── JOBS TAB ── */}
        {activeTab === "jobs" && (
          <div style={{ marginTop: 20 }}>
            {/* Batch toolbar */}
            {jobs.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 700, cursor: "pointer", color: t.textMuted }}>
                  <input
                    type="checkbox"
                    style={{ width: 16, height: 16, cursor: "pointer" }}
                    checked={selectedJobs.size === jobs.length && jobs.length > 0}
                    onChange={(e) => setSelectedJobs(e.target.checked ? new Set(jobs.map((j) => j.id)) : new Set())}
                  />
                  Select all
                </label>
                {selectedJobs.size > 0 && (
                  <>
                    <span style={{ fontSize: 13, color: t.textMuted }}>{selectedJobs.size} selected</span>
                    <button
                      style={{ ...actionBtn("#16a34a"), opacity: batchActing ? 0.6 : 1 }}
                      disabled={batchActing}
                      onClick={batchApproveJobs}
                    >
                      {batchActing ? "..." : `Approve ${selectedJobs.size}`}
                    </button>
                    <button
                      style={{ ...actionBtn("#ef4444"), opacity: batchActing ? 0.6 : 1 }}
                      disabled={batchActing}
                      onClick={batchRejectJobs}
                    >
                      {batchActing ? "..." : `Delete ${selectedJobs.size}`}
                    </button>
                  </>
                )}
              </div>
            )}
            {jobs.length === 0 && (
              <div style={{ padding: 32, textAlign: "center", color: t.textFaint, border: `1px solid ${t.border}`, borderRadius: 14, background: t.surface }}>
                {pendingOnly ? "No pending job submissions." : "No jobs found."}
              </div>
            )}
            <div style={{ display: "grid", gap: 14 }}>
              {jobs.map((job) => (
                <div
                  key={job.id}
                  style={{ border: `1px solid ${selectedJobs.has(job.id) ? "#6366f1" : t.border}`, borderRadius: 14, padding: 16, background: selectedJobs.has(job.id) ? (t.bg === "#fff" || t.bg === "#f9fafb" ? "#f5f3ff" : "#1e1b4b22") : t.surface, transition: "border-color 0.1s" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flex: 1, minWidth: 0 }}>
                      <input
                        type="checkbox"
                        checked={selectedJobs.has(job.id)}
                        onChange={() => toggleJobSelection(job.id)}
                        style={{ width: 16, height: 16, marginTop: 3, cursor: "pointer", flexShrink: 0 }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 900, fontSize: 17, color: t.text }}>{job.title || "Untitled Job"}</div>
                        <div style={{ marginTop: 4, fontSize: 14, color: t.textMuted }}>{job.company_name || "Unknown company"}</div>
                        <div style={{ marginTop: 2, fontSize: 13, color: t.textMuted }}>{[job.location, job.category].filter(Boolean).join(" · ")}</div>
                        {job.description && (
                          <div style={{ marginTop: 8, fontSize: 13, color: t.textMuted, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>
                            {job.description}
                          </div>
                        )}
                        <div style={{ marginTop: 6, fontSize: 12, color: t.textFaint, display: "flex", gap: 12, flexWrap: "wrap" }}>
                          {job.apply_url && <a href={job.apply_url} target="_blank" rel="noreferrer" style={{ color: "#1d4ed8" }}>View posting ↗</a>}
                          <span>{job.created_at ? new Date(job.created_at).toLocaleDateString() : ""}</span>
                          <span style={{ background: t.badgeBg, color: t.badgeText, borderRadius: 20, padding: "1px 8px" }}>{job.source_type || "community"}</span>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
                      {job.is_approved && (
                        <span style={{ background: "#dcfce7", color: "#15803d", fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 20 }}>Live</span>
                      )}
                      {!job.is_approved && (
                        <button style={{ ...actionBtn("#16a34a"), display: "flex", alignItems: "center", gap: 5 }} disabled={actionLoading === job.id} onClick={() => approveJob(job.id)}>
                          {actionLoading === job.id && <span className="btn-spinner" />}
                          Approve
                        </button>
                      )}
                      <button style={{ ...actionBtn("#ef4444"), display: "flex", alignItems: "center", gap: 5 }} disabled={actionLoading === job.id} onClick={() => rejectJob(job.id)}>
                        {actionLoading === job.id && <span className="btn-spinner" />}
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── GROUPS TAB ── */}
        {activeTab === "groups" && (
          <div style={{ marginTop: 20, display: "grid", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 18, color: t.text }}>Manage Groups</div>
                <div style={{ marginTop: 3, fontSize: 13, color: t.textMuted }}>
                  Delete groups and their group-specific members, posts, and join requests.
                </div>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void loadGroups(groupSearch);
                }}
                style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
              >
                <input
                  value={groupSearch}
                  onChange={(e) => setGroupSearch(e.target.value)}
                  placeholder="Search groups..."
                  style={{
                    border: `1px solid ${t.inputBorder}`,
                    borderRadius: 10,
                    padding: "8px 12px",
                    background: t.input,
                    color: t.text,
                    minWidth: 220,
                  }}
                />
                <button type="submit" style={actionBtn("#374151")}>Search</button>
                {groupSearch && (
                  <button
                    type="button"
                    style={actionBtn("#6b7280")}
                    onClick={() => {
                      setGroupSearch("");
                      void loadGroups("");
                    }}
                  >
                    Clear
                  </button>
                )}
              </form>
            </div>

            {groups.length === 0 && (
              <div style={{ padding: 32, textAlign: "center", color: t.textFaint, border: `1px solid ${t.border}`, borderRadius: 14, background: t.surface }}>
                No groups found.
              </div>
            )}

            <div style={{ display: "grid", gap: 12 }}>
              {groups.map((group) => (
                <div key={group.id} style={{ border: `1px solid ${t.border}`, borderRadius: 14, padding: 16, background: t.surface }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", gap: 12, minWidth: 0, flex: 1 }}>
                      {group.cover_photo_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={group.cover_photo_url}
                          alt=""
                          style={{ width: 72, height: 72, borderRadius: 12, objectFit: "cover", flexShrink: 0 }}
                        />
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <Link href={`/units/${encodeURIComponent(group.slug)}`} style={{ color: t.text, textDecoration: "none", fontWeight: 900, fontSize: 17 }}>
                            {group.name}
                          </Link>
                          {group.type && (
                            <span style={{ background: t.badgeBg, color: t.badgeText, borderRadius: 999, padding: "2px 8px", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>
                              {group.type}
                            </span>
                          )}
                        </div>
                        {group.description && (
                          <div style={{ marginTop: 6, color: t.textMuted, fontSize: 13, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>
                            {group.description}
                          </div>
                        )}
                        <div style={{ marginTop: 8, display: "flex", gap: 12, flexWrap: "wrap", color: t.textFaint, fontSize: 12 }}>
                          <span>{group.member_count} member{group.member_count === 1 ? "" : "s"}</span>
                          <span>{group.post_count} post{group.post_count === 1 ? "" : "s"}</span>
                          <span>Owner: {group.owner_name ?? "Unknown"}</span>
                          {group.created_at && <span>Created {new Date(group.created_at).toLocaleDateString()}</span>}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
                      <Link href={`/units/${encodeURIComponent(group.slug)}`} style={{ ...actionBtn("#374151"), textDecoration: "none" }}>
                        View
                      </Link>
                      <button
                        type="button"
                        style={{ ...actionBtn("#ef4444"), display: "flex", alignItems: "center", gap: 5 }}
                        disabled={actionLoading === group.id + "-delete"}
                        onClick={() => deleteGroup(group)}
                      >
                        {actionLoading === group.id + "-delete" && <span className="btn-spinner" />}
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── FLAGS TAB ── */}
        {activeTab === "flags" && (
          <div style={{ marginTop: 20 }}>
            {flags.length === 0 && (
              <div style={{ padding: 32, textAlign: "center", color: t.textFaint, border: `1px solid ${t.border}`, borderRadius: 14, background: t.surface }}>
                No flags yet.
              </div>
            )}
            <div style={{ display: "grid", gap: 12 }}>
              {flags.map((flag) => (
                <div key={flag.id} style={{ border: `1px solid ${flag.reviewed ? t.border : "#fca5a5"}`, borderRadius: 14, padding: 16, background: flag.reviewed ? t.surface : "#fff5f5" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                        <span style={{ background: flag.content_type === "post" || flag.content_type === "unit_post" ? "#dbeafe" : flag.content_type === "message" ? "#ede9fe" : "#fef9c3", color: flag.content_type === "post" || flag.content_type === "unit_post" ? "#1d4ed8" : flag.content_type === "message" ? "#6d28d9" : "#854d0e", fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 20, textTransform: "uppercase" }}>
                          {flag.content_type}
                        </span>
                        {flag.reviewed && <span style={{ background: t.badgeBg, color: t.badgeText, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>Reviewed</span>}
                        <span style={{ fontSize: 12, color: t.textFaint }}>{new Date(flag.created_at).toLocaleString()}</span>
                      </div>
                      {flag.reporter_name && (
                        <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 4 }}>Flagged by: <strong>{flag.reporter_name}</strong></div>
                      )}
                      {flag.content_preview && (
                        <div style={{ fontSize: 14, color: t.text, lineHeight: 1.5, background: t.surfaceHover, borderRadius: 8, padding: "8px 12px", marginTop: 6, display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>
                          {flag.content_preview}
                        </div>
                      )}
                      {!flag.content_preview && (
                        <div style={{ fontSize: 13, color: t.textFaint, fontStyle: "italic" }}>Content may have been deleted already.</div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                      {!flag.reviewed && (
                        <button style={{ ...actionBtn("#6b7280"), display: "flex", alignItems: "center", gap: 5 }} disabled={actionLoading === flag.id} onClick={() => dismissFlag(flag.id)}>
                          {actionLoading === flag.id && <span className="btn-spinner" />}
                          Dismiss
                        </button>
                      )}
                      {flag.content_preview && (
                        <button style={{ ...actionBtn("#ef4444"), display: "flex", alignItems: "center", gap: 5 }} disabled={actionLoading === flag.id + "-remove"} onClick={() => removeFlaggedContent(flag)}>
                          {actionLoading === flag.id + "-remove" && <span className="btn-spinner" />}
                          Remove Content
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── USERS TAB ── */}
        {activeTab === "users" && (
          <div style={{ marginTop: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
              <div style={{ display: "flex", gap: 6 }}>
                {(["all", "pending", "verified", "denied"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setUserFilter(f)}
                    style={{
                      padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: "pointer",
                      border: userFilter === f ? "none" : `1px solid ${t.border}`,
                      background: userFilter === f ? "#111" : t.surface,
                      color: userFilter === f ? "white" : t.badgeText,
                    }}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                    {" "}
                    <span style={{ opacity: 0.7 }}>
                      ({users.filter((u) => f === "all" || u.verification_status === f).length})
                    </span>
                  </button>
                ))}
              </div>
              <button onClick={loadUsers} style={actionBtn("#374151")}>↻ Refresh</button>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {users.filter((u) => userFilter === "all" || u.verification_status === userFilter).map((u) => {
                const name =
                  u.display_name ||
                  u.name ||
                  `${u.first_name || ""} ${u.last_name || ""}`.trim() ||
                  "Unnamed User";
                const isVerified = u.verification_status === "verified";
                const isPending = u.verification_status === "pending";
                const isDenied = u.verification_status === "denied";
                return (
                  <div key={u.user_id} style={{ border: `1px solid ${isDenied ? "#fca5a5" : t.border}`, borderRadius: 12, padding: "12px 16px", background: isDenied ? "#fff5f5" : t.surface, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 800, fontSize: 15, color: t.text }}>{name}</span>
                        {u.is_admin && <span style={{ background: "#fef3c7", color: "#92400e", fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 20 }}>ADMIN</span>}
                        {u.is_employer ? (
                          <span style={{ background: u.employer_verified ? "#dbeafe" : "#e5e7eb", color: u.employer_verified ? "#1e40af" : "#374151", fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 20 }}>
                            {u.employer_verified ? "✓ Employer" : "Employer"}
                          </span>
                        ) : (
                          <span style={{ background: "#f3f4f6", color: "#6b7280", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>Member</span>
                        )}
                        {isVerified && <span style={{ background: "#dcfce7", color: "#15803d", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>Verified</span>}
                        {isPending && <span style={{ background: "#fef9c3", color: "#854d0e", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>Pending</span>}
                        {isDenied && <span style={{ background: "#fee2e2", color: "#b91c1c", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>Denied</span>}
                        <span style={{ background: "#e0e7ff", color: "#3730a3", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20, textTransform: "uppercase" }}>
                          Tier: {u.access_tier ?? "senior (beta default)"}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: t.textMuted, marginTop: 3 }}>
                        {[u.role, u.service].filter(Boolean).join(" · ")}
                        {u.email && <span style={{ color: t.textFaint, marginLeft: u.role || u.service ? 6 : 0 }}>{u.role || u.service ? "· " : ""}{u.email}</span>}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {/* Verification */}
                      {!isVerified && (
                        <button
                          style={actionBtn("#16a34a")}
                          disabled={actionLoading === u.user_id + "-verify"}
                          onClick={() => setVerification(u.user_id, "verified")}
                        >
                          {actionLoading === u.user_id + "-verify" ? "..." : "Verify"}
                        </button>
                      )}
                      {!isVerified && !isDenied && (
                        <button
                          style={actionBtn("#ef4444")}
                          disabled={actionLoading === u.user_id + "-deny"}
                          onClick={() => denyUser(u.user_id)}
                        >
                          {actionLoading === u.user_id + "-deny" ? "..." : "Deny"}
                        </button>
                      )}
                      {isVerified && (
                        <button
                          style={{ ...actionBtn("#6b7280"), fontSize: 12 }}
                          disabled={actionLoading === u.user_id + "-verify"}
                          onClick={() => setVerification(u.user_id, "pending")}
                        >
                          Unverify
                        </button>
                      )}

                      {/* Employer toggles */}
                      <button
                        style={actionBtn(u.is_employer ? "#1e40af" : "#6b7280")}
                        disabled={actionLoading === u.user_id + "-employer"}
                        onClick={() => toggleEmployer(u.user_id, u.is_employer)}
                      >
                        {actionLoading === u.user_id + "-employer" ? "..." : u.is_employer ? "Remove Employer" : "Make Employer"}
                      </button>
                      {u.is_employer && (
                        <button
                          style={actionBtn(u.employer_verified ? "#6b7280" : "#16a34a")}
                          disabled={actionLoading === u.user_id + "-empverify"}
                          onClick={() => toggleEmployerVerified(u.user_id, u.employer_verified)}
                        >
                          {actionLoading === u.user_id + "-empverify" ? "..." : u.employer_verified ? "Unverify Employer" : "Verify Employer"}
                        </button>
                      )}

                      {/* Admin toggle */}
                      <button
                        style={actionBtn(u.is_admin ? "#ef4444" : "#6366f1")}
                        disabled={actionLoading === u.user_id + "-admin"}
                        onClick={() => toggleAdmin(u.user_id, u.is_admin)}
                      >
                        {actionLoading === u.user_id + "-admin" ? "..." : u.is_admin ? "Remove Admin" : "Make Admin"}
                      </button>

                      <select
                        value={u.access_tier ?? "senior"}
                        disabled={actionLoading === u.user_id + "-tier"}
                        onChange={(e) => setAccessTier(u.user_id, e.target.value as "basic" | "senior" | "master")}
                        style={{
                          borderRadius: 8,
                          border: `1px solid ${t.border}`,
                          background: t.surface,
                          color: t.text,
                          padding: "7px 10px",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: actionLoading === u.user_id + "-tier" ? "not-allowed" : "pointer",
                        }}
                        title="Set access tier"
                      >
                        <option value="basic">Tier: Basic</option>
                        <option value="senior">Tier: Senior</option>
                        <option value="master">Tier: Master</option>
                      </select>

                      {/* View wall */}
                      <a href={`/profile/${u.user_id}`} target="_blank" rel="noreferrer" style={{ ...actionBtn("#374151"), textDecoration: "none", display: "inline-block" }}>
                        View
                      </a>

                      {/* Delete user */}
                      <button
                        style={actionBtn("#ef4444")}
                        disabled={actionLoading === u.user_id + "-delete"}
                        onClick={() => deleteUser(u.user_id)}
                      >
                        {actionLoading === u.user_id + "-delete" ? "..." : "Delete"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {/* ── REPORTS TAB ── */}
        {activeTab === "reports" && (
          <div style={{ marginTop: 20, display: "grid", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button onClick={() => setReportsFilter("unreviewed")} style={{ ...tabStyle("reports"), background: reportsFilter === "unreviewed" ? "#111" : t.badgeBg, color: reportsFilter === "unreviewed" ? "white" : t.text, fontSize: 13, padding: "6px 14px" }}>Unreviewed</button>
              <button onClick={() => setReportsFilter("all")} style={{ ...tabStyle("reports"), background: reportsFilter === "all" ? "#111" : t.badgeBg, color: reportsFilter === "all" ? "white" : t.text, fontSize: 13, padding: "6px 14px" }}>All</button>
            </div>

            {bugReports.length === 0 && (
              <div style={{ color: t.textFaint, fontSize: 14, padding: 20 }}>No reports found.</div>
            )}

            {bugReports.map((r) => (
              <div key={r.id} style={{ border: `1px solid ${t.border}`, borderRadius: 12, padding: 18, background: t.surface, opacity: r.reviewed ? 0.6 : 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{r.reporter_name ?? "Anonymous"}</div>
                    <div style={{ fontSize: 12, color: t.textFaint, marginTop: 2 }}>{new Date(r.created_at).toLocaleString()}</div>
                    {r.page_url && <div style={{ fontSize: 11, color: t.textFaint, marginTop: 2, wordBreak: "break-all" }}>{r.page_url}</div>}
                  </div>
                  {r.reviewed && <span style={{ background: "#d1fae5", color: "#065f46", borderRadius: 6, padding: "3px 10px", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>Reviewed</span>}
                </div>

                <div style={{ fontSize: 14, color: t.text, lineHeight: 1.6, whiteSpace: "pre-wrap", marginBottom: r.screenshot_url ? 12 : 0 }}>{r.message}</div>

                {r.screenshot_url && (
                  <a href={r.screenshot_url} target="_blank" rel="noreferrer">
                    <img src={r.screenshot_url} alt="Screenshot" style={{ maxWidth: "100%", maxHeight: 280, borderRadius: 10, border: `1px solid ${t.border}`, display: "block", marginBottom: 12 }} />
                  </a>
                )}

                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  {!r.reviewed && (
                    <button onClick={() => markReportReviewed(r.id)} disabled={actionLoading === r.id} style={{ ...actionBtn("#16a34a"), display: "flex", alignItems: "center", gap: 5 }}>
                      {actionLoading === r.id && <span className="btn-spinner" />}
                      Mark Reviewed
                    </button>
                  )}
                  <button onClick={() => deleteBugReport(r.id)} disabled={actionLoading === r.id} style={{ ...actionBtn("#ef4444"), display: "flex", alignItems: "center", gap: 5 }}>
                    {actionLoading === r.id && <span className="btn-spinner" />}
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── DIRECTORY TAB ── */}
        {activeTab === "directory" && (
          <div style={{ marginTop: 20, display: "grid", gap: 20 }}>

            {/* Location requests */}
            {locationRequests.filter(r => !r.reviewed).length > 0 && (
              <div style={{ border: `1px solid #fbbf24`, borderRadius: 14, background: t.surface, padding: 20 }}>
                <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 12, color: t.text }}>
                  📍 Location Requests <span style={{ background: "#fef3c7", color: "#92400e", borderRadius: 20, padding: "2px 10px", fontSize: 12, marginLeft: 6 }}>{locationRequests.filter(r => !r.reviewed).length} new</span>
                </div>
                <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 14 }}>
                  These are user-requested locations. Add them to the <code>OVERSEAS_LOCATIONS</code> array in <code>app/directory/page.tsx</code>, then mark reviewed.
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {locationRequests.filter(r => !r.reviewed).map((req) => (
                    <div key={req.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", border: `1px solid ${t.border}`, borderRadius: 8, background: t.bg }}>
                      <span style={{ flex: 1, fontWeight: 700, color: t.text }}>{req.location_name}</span>
                      <span style={{ fontSize: 12, color: t.textFaint }}>{new Date(req.created_at).toLocaleDateString()}</span>
                      <button onClick={() => markLocReviewed(req.id)} style={{ background: "#16a34a", color: "white", border: "none", borderRadius: 6, padding: "4px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                        Mark Done
                      </button>
                      <button onClick={() => deleteLocRequest(req.id)} style={{ background: "#ef4444", color: "white", border: "none", borderRadius: 6, padding: "4px 10px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Unit submissions */}
            <div>
            <div style={{ marginBottom: 14, fontSize: 14, color: t.textMuted }}>
              Showing all submissions — approve to make them public, or delete to reject.
            </div>
            {directoryEntries.length === 0 && (
              <div style={{ padding: 32, textAlign: "center", color: t.textFaint, border: `1px solid ${t.border}`, borderRadius: 14, background: t.surface }}>
                No directory submissions.
              </div>
            )}
            <div style={{ display: "grid", gap: 10 }}>
              {directoryEntries.map((entry) => (
                <div key={entry.id} style={{ border: `1px solid ${t.border}`, borderRadius: 12, background: t.surface, padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                  {!entry.is_approved && (
                    <span style={{ background: "#fef3c7", color: "#92400e", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>PENDING</span>
                  )}
                  {entry.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- admin preview
                    <img src={entry.photo_url} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover", flexShrink: 0, border: `1px solid ${t.border}` }} />
                  ) : null}
                  <span style={{ background: "#374151", color: "#fff", borderRadius: 6, padding: "3px 10px", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap", flexShrink: 0 }}>{entry.org_type}</span>
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <div style={{ fontWeight: 800, fontSize: 15, color: t.text }}>{entry.name}</div>
                    <div style={{ fontSize: 13, color: t.textMuted, marginTop: 2 }}>
                      {[entry.state, entry.base_city, entry.phone, entry.unit_slug ? `slug: ${entry.unit_slug}` : null].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    {!entry.is_approved && (
                      <button
                        onClick={() => approveDirectoryEntry(entry.id)}
                        disabled={actionLoading === entry.id}
                        style={{ ...actionBtn("#16a34a"), display: "flex", alignItems: "center", gap: 5 }}
                      >
                        {actionLoading === entry.id && <span className="btn-spinner" />}
                        Approve
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setEditingDirectory({ ...entry })}
                      style={{ ...actionBtn("#374151"), display: "flex", alignItems: "center", gap: 5 }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => denyDirectoryEntry(entry.id)}
                      disabled={actionLoading === entry.id}
                      style={{ ...actionBtn("#ef4444"), display: "flex", alignItems: "center", gap: 5 }}
                    >
                      {actionLoading === entry.id && <span className="btn-spinner" />}
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
            </div>{/* end unit submissions */}
          </div>
        )}

        {/* ── ENGAGEMENT TAB ── */}
        {activeTab === "engagement" && (
          <div style={{ marginTop: 20, display: "grid", gap: 16 }}>
            {/* Header: range selector + refresh */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(["today", "7d", "30d"] as const).map((r) => {
                  const active = engagementRange === r;
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setEngagementRange(r)}
                      style={{
                        padding: "7px 14px",
                        borderRadius: 8,
                        border: "none",
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: "pointer",
                        background: active ? "#111" : t.badgeBg,
                        color: active ? "white" : t.text,
                      }}
                    >
                      {r === "today" ? "Today" : r === "7d" ? "Last 7 days" : "Last 30 days"}
                    </button>
                  );
                })}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: t.textMuted }}>
                {engagement?.generated_at && (
                  <span>Updated {new Date(engagement.generated_at).toLocaleTimeString()}</span>
                )}
                <button
                  type="button"
                  onClick={() => void loadEngagement(engagementRange)}
                  disabled={engagementLoading}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: `1px solid ${t.border}`,
                    background: t.surface,
                    color: t.text,
                    fontWeight: 600,
                    fontSize: 12,
                    cursor: engagementLoading ? "default" : "pointer",
                    opacity: engagementLoading ? 0.6 : 1,
                  }}
                >
                  {engagementLoading ? "Refreshing…" : "Refresh"}
                </button>
              </div>
            </div>

            {!engagement && engagementLoading && (
              <div style={{ padding: 24, textAlign: "center", color: t.textMuted, border: `1px solid ${t.border}`, borderRadius: 14, background: t.surface }}>
                Loading engagement data…
              </div>
            )}

            {!engagement && !engagementLoading && (
              <div style={{ padding: 24, textAlign: "center", color: t.textFaint, border: `1px solid ${t.border}`, borderRadius: 14, background: t.surface }}>
                No data yet. Once visitors start hitting the site, metrics will appear here.
              </div>
            )}

            {engagement && (
              <>
                {/* KPI ROW */}
                <div
                  style={{
                    display: "grid",
                    gap: 12,
                    gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)",
                  }}
                >
                  <KpiCard
                    t={t}
                    label="New signups"
                    value={engagement.kpis.new_signups.toLocaleString()}
                    delta={pctDelta(engagement.kpis.new_signups, engagement.kpis.new_signups_prev)}
                    sub={`Total users: ${engagement.kpis.total_users.toLocaleString()}`}
                  />
                  <KpiCard
                    t={t}
                    label="Visits"
                    value={engagement.kpis.visits.toLocaleString()}
                    delta={pctDelta(engagement.kpis.visits, engagement.kpis.visits_prev)}
                    sub={`Unique: ${engagement.kpis.unique_visitors_in_range.toLocaleString()}`}
                  />
                  <KpiCard
                    t={t}
                    label="Avg session"
                    value={formatDuration(engagement.kpis.avg_session_ms)}
                    sub="Active time per session"
                  />
                  <KpiCard
                    t={t}
                    label="Total time on platform"
                    value={formatDurationLong(engagement.kpis.total_active_ms)}
                    sub="Sum across all users"
                  />
                </div>

                {/* DAU / WAU / MAU strip */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)",
                    gap: 12,
                  }}
                >
                  <KpiCard t={t} label="Unique visitors today" value={engagement.kpis.dau.toLocaleString()} sub="DAU" subtle />
                  <KpiCard t={t} label="Unique visitors (7d)" value={engagement.kpis.wau.toLocaleString()} sub="WAU" subtle />
                  <KpiCard t={t} label="Unique visitors (30d)" value={engagement.kpis.mau.toLocaleString()} sub="MAU" subtle />
                </div>

                {/* Top pages by time + Most engaged users */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                    gap: 12,
                  }}
                >
                  <div style={{ border: `1px solid ${t.border}`, borderRadius: 14, background: t.surface, padding: 16, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12, color: t.text }}>
                      Top pages by time spent
                    </div>
                    {engagement.top_pages.length === 0 ? (
                      <div style={{ fontSize: 13, color: t.textFaint }}>No page data yet.</div>
                    ) : (
                      <div style={{ display: "grid", gap: 8 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 70px 70px", fontSize: 11, fontWeight: 700, color: t.textMuted, paddingBottom: 6, borderBottom: `1px solid ${t.borderLight}` }}>
                          <div>Path</div>
                          <div style={{ textAlign: "right" }}>Time</div>
                          <div style={{ textAlign: "right" }}>Visits</div>
                          <div style={{ textAlign: "right" }}>Avg</div>
                        </div>
                        {engagement.top_pages.map((p) => (
                          <div
                            key={p.path}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr 70px 70px 70px",
                              fontSize: 13,
                              alignItems: "center",
                              color: t.text,
                              padding: "4px 0",
                            }}
                          >
                            <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 6 }} title={p.path}>
                              {p.path}
                            </div>
                            <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatDuration(p.total_ms)}</div>
                            <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: t.textMuted }}>{p.visits}</div>
                            <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: t.textMuted }}>{formatDuration(p.avg_ms)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ border: `1px solid ${t.border}`, borderRadius: 14, background: t.surface, padding: 16, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12, color: t.text }}>
                      Most engaged users
                    </div>
                    {engagement.most_engaged_users.length === 0 ? (
                      <div style={{ fontSize: 13, color: t.textFaint }}>No authenticated activity yet.</div>
                    ) : (
                      <div style={{ display: "grid", gap: 8 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 70px", fontSize: 11, fontWeight: 700, color: t.textMuted, paddingBottom: 6, borderBottom: `1px solid ${t.borderLight}` }}>
                          <div>User</div>
                          <div style={{ textAlign: "right" }}>Time</div>
                          <div style={{ textAlign: "right" }}>Sessions</div>
                        </div>
                        {engagement.most_engaged_users.map((u) => (
                          <div
                            key={u.user_id}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr 70px 70px",
                              fontSize: 13,
                              alignItems: "center",
                              color: t.text,
                              padding: "4px 0",
                            }}
                          >
                            <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 6 }} title={u.user_id}>
                              {u.display_name || <span style={{ color: t.textFaint }}>unnamed</span>}
                            </div>
                            <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatDuration(u.total_ms)}</div>
                            <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: t.textMuted }}>{u.sessions}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Deep-link footer */}
                <div
                  style={{
                    border: `1px solid ${t.border}`,
                    borderRadius: 14,
                    background: t.surface,
                    padding: 14,
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ fontSize: 12, color: t.textMuted, maxWidth: 540 }}>
                    For raw pageviews, top referrers, devices, and Core Web Vitals, open the native dashboards.
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <a
                      href="https://vercel.com/dashboard"
                      target="_blank"
                      rel="noreferrer noopener"
                      style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontWeight: 700, fontSize: 12, textDecoration: "none" }}
                    >
                      Vercel Analytics ↗
                    </a>
                    <a
                      href="https://supabase.com/dashboard"
                      target="_blank"
                      rel="noreferrer noopener"
                      style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontWeight: 700, fontSize: 12, textDecoration: "none" }}
                    >
                      Supabase Logs ↗
                    </a>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── NEWS TAB ── */}
        {activeTab === "news" && (
          <div style={{ marginTop: 20, display: "grid", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: "space-between" }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(["pending", "published", "rejected"] as const).map((f) => {
                  const active = newsFilter === f;
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => { setNewsFilter(f); setNewsSelected(new Set()); }}
                      style={{
                        padding: "7px 14px",
                        borderRadius: 8,
                        border: "none",
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: "pointer",
                        background: active ? "#111" : t.badgeBg,
                        color: active ? "white" : t.text,
                      }}
                    >
                      {f === "pending" ? "Pending review" : f === "published" ? "In feed" : "Rejected"}
                      {f === "pending" && newsPendingCount > 0 && (
                        <span style={{ marginLeft: 6, padding: "1px 6px", borderRadius: 999, background: active ? "white" : "#ef4444", color: active ? "#111" : "white", fontSize: 11 }}>{newsPendingCount}</span>
                      )}
                    </button>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {newsRunStats && (
                  <span style={{ fontSize: 12, color: t.textMuted, maxWidth: 360 }}>{newsRunStats}</span>
                )}
                <button
                  type="button"
                  onClick={() => void loadPreview()}
                  disabled={previewLoading}
                  style={{
                    padding: "7px 14px",
                    borderRadius: 8,
                    border: `1px solid ${t.border}`,
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: previewLoading ? "default" : "pointer",
                    background: t.surface,
                    color: t.text,
                    opacity: previewLoading ? 0.7 : 1,
                  }}
                  title="Run the pipeline read-only and show every candidate (passed AND dropped)"
                >
                  {previewLoading ? "Scanning…" : "Preview pipeline"}
                </button>
                <button
                  type="button"
                  onClick={() => void triggerNewsIngestion()}
                  disabled={newsRunning}
                  style={{
                    padding: "7px 14px",
                    borderRadius: 8,
                    border: "none",
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: newsRunning ? "default" : "pointer",
                    background: newsRunning ? t.badgeBg : "#1d4ed8",
                    color: newsRunning ? t.text : "white",
                    opacity: newsRunning ? 0.7 : 1,
                  }}
                >
                  {newsRunning ? "Running…" : "Run ingestion now"}
                </button>
              </div>
            </div>

            <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.5 }}>
              External stories ingest hourly via Supabase cron. Nothing reaches the public feed until you approve it here. Items below the relevance threshold are dropped before they ever land in this queue. Use <strong>Preview pipeline</strong> to inspect every candidate the scorer saw and surface false negatives.
            </div>

            {newsItems.length > 0 && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 12px", border: `1px solid ${t.border}`, borderRadius: 10, background: t.surface }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: t.text, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={newsSelected.size === newsItems.length && newsItems.length > 0}
                    ref={(el) => {
                      if (el) el.indeterminate = newsSelected.size > 0 && newsSelected.size < newsItems.length;
                    }}
                    onChange={toggleNewsSelectAll}
                  />
                  {newsSelected.size > 0 ? `${newsSelected.size} selected` : "Select all"}
                </label>
                {newsSelected.size > 0 && (
                  <>
                    {newsFilter === "pending" && (
                      <button
                        type="button"
                        onClick={bulkApproveSelected}
                        disabled={newsBulkBusy}
                        style={{ padding: "5px 11px", borderRadius: 8, border: "none", background: "#16a34a", color: "white", fontWeight: 700, fontSize: 12, cursor: newsBulkBusy ? "default" : "pointer", opacity: newsBulkBusy ? 0.7 : 1 }}
                      >
                        Approve selected
                      </button>
                    )}
                    {newsFilter !== "rejected" && (
                      <button
                        type="button"
                        onClick={bulkRejectSelected}
                        disabled={newsBulkBusy}
                        style={{ padding: "5px 11px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontWeight: 700, fontSize: 12, cursor: newsBulkBusy ? "default" : "pointer", opacity: newsBulkBusy ? 0.7 : 1 }}
                      >
                        Reject selected
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={bulkDeleteSelected}
                      disabled={newsBulkBusy}
                      style={{ padding: "5px 11px", borderRadius: 8, border: "none", background: "#ef4444", color: "white", fontWeight: 700, fontSize: 12, cursor: newsBulkBusy ? "default" : "pointer", opacity: newsBulkBusy ? 0.7 : 1 }}
                    >
                      Delete selected
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewsSelected(new Set())}
                      disabled={newsBulkBusy}
                      style={{ padding: "5px 11px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.bg, color: t.textMuted, fontWeight: 700, fontSize: 12, cursor: "pointer" }}
                    >
                      Clear
                    </button>
                  </>
                )}
                <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {newsFilter === "pending" && newsPendingCount > 0 && (
                    <button
                      type="button"
                      onClick={bulkRejectAllPending}
                      disabled={newsBulkBusy}
                      style={{ padding: "5px 11px", borderRadius: 8, border: `1px dashed ${t.border}`, background: t.bg, color: t.text, fontWeight: 700, fontSize: 12, cursor: newsBulkBusy ? "default" : "pointer", opacity: newsBulkBusy ? 0.7 : 1 }}
                      title="Reject every pending item — useful for clearing junk batches"
                    >
                      Reject all pending ({newsPendingCount})
                    </button>
                  )}
                  {newsFilter === "rejected" && (
                    <button
                      type="button"
                      onClick={bulkDeleteAllRejected}
                      disabled={newsBulkBusy}
                      style={{ padding: "5px 11px", borderRadius: 8, border: "none", background: "#ef4444", color: "white", fontWeight: 700, fontSize: 12, cursor: newsBulkBusy ? "default" : "pointer", opacity: newsBulkBusy ? 0.7 : 1 }}
                      title="Permanently delete every rejected item from the database"
                    >
                      Empty rejected
                    </button>
                  )}
                </div>
              </div>
            )}

            {previewResult && (() => {
              // Hide anything we've already acted on (dismissed → blocklist, or
              // sent → pending). Keeps the working queue shrinking as we triage.
              const visibleCandidates = previewResult.candidates
                .filter((c) => !previewDismissedKeys.has(c.dedupe_key) && !previewInsertedKeys.has(c.dedupe_key))
                .filter((c) => previewStatusFilter === "all" || c.status === previewStatusFilter)
                .filter((c) => {
                  const q = previewSearch.trim().toLowerCase();
                  if (!q) return true;
                  return (
                    c.headline.toLowerCase().includes(q) ||
                    (c.summary ?? "").toLowerCase().includes(q) ||
                    (c.source_name ?? "").toLowerCase().includes(q)
                  );
                });
              const dismissableVisible = visibleCandidates;
              const actionableVisible = visibleCandidates;
              const selectedActionable = actionableVisible.filter((c) => previewSelected.has(c.dedupe_key));
              const allActionableSelected = actionableVisible.length > 0 && selectedActionable.length === actionableVisible.length;
              const someActionableSelected = selectedActionable.length > 0 && !allActionableSelected;
              return (
              <div style={{ border: `1px solid ${t.border}`, borderRadius: 14, background: t.surface, padding: 14, display: "grid", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 2 }}>
                      Pipeline preview · {previewResult.totalFetched} candidates fetched
                      {previewResult.blockedCount > 0 && (
                        <span style={{ fontWeight: 600, color: t.textMuted, marginLeft: 6 }}>
                          ({previewResult.blockedCount} hidden by blocklist)
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.5 }}>
                      Read-only scan. <strong>Send to pending</strong> for items the scorer dropped that should have been kept. <strong>Dismiss</strong> for junk you never want to see again — that dedupe key is permanently blocked from future runs.
                    </div>
                    {previewResult.queryLaneStats && previewResult.queryLaneStats.length > 0 && (
                      <div style={{ marginTop: 10, fontSize: 11, color: t.textMuted, maxWidth: "100%" }}>
                        <div style={{ fontWeight: 800, marginBottom: 6, color: t.text }}>Source / query lane performance (this scan)</div>
                        <div style={{ overflowX: "auto", border: `1px solid ${t.border}`, borderRadius: 8, background: t.bg }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                            <thead>
                              <tr style={{ textAlign: "left", borderBottom: `1px solid ${t.border}` }}>
                                <th style={{ padding: "6px 8px", fontWeight: 800 }}>Lane</th>
                                <th style={{ padding: "6px 6px", fontWeight: 800, textAlign: "right" }}>Fetched</th>
                                <th style={{ padding: "6px 6px", fontWeight: 800, textAlign: "right", color: "#166534" }}>Would insert</th>
                                <th style={{ padding: "6px 6px", fontWeight: 800, textAlign: "right" }}>Low score</th>
                                <th style={{ padding: "6px 6px", fontWeight: 800, textAlign: "right" }}>No kw</th>
                                <th style={{ padding: "6px 6px", fontWeight: 800, textAlign: "right" }}>Neg</th>
                                <th style={{ padding: "6px 6px", fontWeight: 800, textAlign: "right" }}>Dup DB</th>
                                <th style={{ padding: "6px 8px", fontWeight: 800, textAlign: "right" }}>Dup batch</th>
                              </tr>
                            </thead>
                            <tbody>
                              {previewResult.queryLaneStats.map((row) => (
                                <tr key={row.lane} style={{ borderBottom: `1px solid ${t.border}` }}>
                                  <td style={{ padding: "6px 8px", wordBreak: "break-word", maxWidth: 280 }}>{row.lane}</td>
                                  <td style={{ padding: "6px 6px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.fetched}</td>
                                  <td style={{ padding: "6px 6px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.would_insert}</td>
                                  <td style={{ padding: "6px 6px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.below_threshold}</td>
                                  <td style={{ padding: "6px 6px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.no_positive_hits}</td>
                                  <td style={{ padding: "6px 6px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.negative_in_title}</td>
                                  <td style={{ padding: "6px 6px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.duplicate_in_db}</td>
                                  <td style={{ padding: "6px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.duplicate_in_batch}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => { setPreviewResult(null); setPreviewSearch(""); setPreviewStatusFilter("all"); setPreviewDismissedKeys(new Set()); setPreviewSelected(new Set()); }}
                    style={{ padding: "5px 12px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontWeight: 700, fontSize: 12, cursor: "pointer" }}
                  >
                    Close
                  </button>
                </div>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {(["all", "would_insert", "below_threshold", "no_positive_hits", "negative_in_title", "duplicate_in_db", "duplicate_in_batch"] as const).map((s) => {
                    const active = previewStatusFilter === s;
                    const count = s === "all" ? previewResult.candidates.length : (previewResult.byStatus[s] ?? 0);
                    const label =
                      s === "all" ? "All"
                      : s === "would_insert" ? "Would insert"
                      : s === "below_threshold" ? "Below threshold"
                      : s === "no_positive_hits" ? "No EOD keyword"
                      : s === "negative_in_title" ? "Negative phrase"
                      : s === "duplicate_in_db" ? "Already in DB"
                      : "Dup in batch";
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => { setPreviewStatusFilter(s); setPreviewSelected(new Set()); }}
                        style={{
                          padding: "5px 10px",
                          borderRadius: 999,
                          border: "none",
                          background: active ? "#111" : t.badgeBg,
                          color: active ? "white" : t.text,
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        {label} · {count}
                      </button>
                    );
                  })}
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    type="text"
                    value={previewSearch}
                    onChange={(e) => setPreviewSearch(e.target.value)}
                    placeholder="Filter by headline / source / summary…"
                    style={{ flex: 1, minWidth: 220, border: `1px solid ${t.inputBorder}`, borderRadius: 8, padding: "7px 11px", fontSize: 13, background: t.input, color: t.text }}
                  />
                  {(() => {
                    const remaining = previewResult.candidates.filter(
                      (c) => !previewDismissedKeys.has(c.dedupe_key) && !previewInsertedKeys.has(c.dedupe_key)
                    ).length;
                    const acted = previewResult.candidates.length - remaining;
                    return (
                      <span style={{ fontSize: 11, color: t.textMuted }}>
                        showing {visibleCandidates.length} of {remaining} left{acted > 0 ? ` · ${acted} done` : ""}
                      </span>
                    );
                  })()}
                  {dismissableVisible.length > 0 && previewStatusFilter !== "would_insert" && (
                    <button
                      type="button"
                      onClick={() => void dismissVisiblePreview(visibleCandidates)}
                      disabled={previewBulkDismissing}
                      style={{ padding: "5px 11px", borderRadius: 8, border: "none", background: "#ef4444", color: "white", fontSize: 12, fontWeight: 700, cursor: previewBulkDismissing ? "default" : "pointer", opacity: previewBulkDismissing ? 0.7 : 1 }}
                      title="Add every visible dedupe key to the permanent blocklist"
                    >
                      {previewBulkDismissing ? "Dismissing…" : `Dismiss all visible (${dismissableVisible.length})`}
                    </button>
                  )}
                </div>

                {actionableVisible.length > 0 && (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "6px 10px", border: `1px solid ${t.border}`, borderRadius: 8, background: t.bg }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: t.text, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={allActionableSelected}
                        ref={(el) => { if (el) el.indeterminate = someActionableSelected; }}
                        onChange={() => {
                          if (allActionableSelected) clearPreviewSelected();
                          else setPreviewSelected(new Set(actionableVisible.map((c) => c.dedupe_key)));
                        }}
                      />
                      {selectedActionable.length > 0 ? `${selectedActionable.length} selected` : `Select all (${actionableVisible.length})`}
                    </label>
                    {selectedActionable.length > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={() => void bulkSendSelectedToPending(selectedActionable)}
                          disabled={previewBulkSending || previewBulkDismissing}
                          style={{ padding: "5px 11px", borderRadius: 8, border: "none", background: "#16a34a", color: "white", fontSize: 12, fontWeight: 700, cursor: previewBulkSending ? "default" : "pointer", opacity: previewBulkSending ? 0.7 : 1 }}
                          title="Force-insert selected candidates into the pending queue"
                        >
                          {previewBulkSending ? "Sending…" : `Send ${selectedActionable.length} to pending`}
                        </button>
                        <button
                          type="button"
                          onClick={() => void bulkDismissSelected(selectedActionable)}
                          disabled={previewBulkDismissing || previewBulkSending}
                          style={{ padding: "5px 11px", borderRadius: 8, border: "none", background: "#ef4444", color: "white", fontSize: 12, fontWeight: 700, cursor: previewBulkDismissing ? "default" : "pointer", opacity: previewBulkDismissing ? 0.7 : 1 }}
                          title="Add selected dedupe keys to the permanent blocklist"
                        >
                          {previewBulkDismissing ? "Dismissing…" : `Dismiss ${selectedActionable.length}`}
                        </button>
                        <button
                          type="button"
                          onClick={clearPreviewSelected}
                          style={{ padding: "5px 11px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.surface, color: t.textMuted, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                        >
                          Clear
                        </button>
                      </>
                    )}
                  </div>
                )}

                <div style={{ display: "grid", gap: 8, maxHeight: 600, overflowY: "auto" }}>
                  {visibleCandidates.map((c, i) => {
                      const inserted = previewInsertedKeys.has(c.dedupe_key);
                      const isInserting = previewInsertingKey === c.dedupe_key;
                      const dismissed = previewDismissedKeys.has(c.dedupe_key);
                      const isDismissing = previewDismissingKey === c.dedupe_key;
                      const statusColor: Record<PreviewStatus, { bg: string; fg: string }> = {
                        would_insert: { bg: isDark ? "#0c3a1f" : "#dcfce7", fg: isDark ? "#86efac" : "#166534" },
                        below_threshold: { bg: isDark ? "#3a2a00" : "#fef9c3", fg: isDark ? "#fde68a" : "#854d0e" },
                        no_positive_hits: { bg: isDark ? "#3a0c0c" : "#fee2e2", fg: isDark ? "#fca5a5" : "#991b1b" },
                        negative_in_title: { bg: isDark ? "#3a0c0c" : "#fee2e2", fg: isDark ? "#fca5a5" : "#991b1b" },
                        duplicate_in_db: { bg: t.badgeBg, fg: t.textMuted },
                        duplicate_in_batch: { bg: t.badgeBg, fg: t.textMuted },
                      };
                      const sc = statusColor[c.status];
                      const statusLabel: Record<PreviewStatus, string> = {
                        would_insert: "would insert",
                        below_threshold: "below threshold",
                        no_positive_hits: "no EOD keyword",
                        negative_in_title: "negative phrase",
                        duplicate_in_db: "already in db",
                        duplicate_in_batch: "dup in batch",
                      };
                      const b = c.breakdown;
                      const selectable = !dismissed && !inserted;
                      const selected = previewSelected.has(c.dedupe_key);
                      return (
                        <div key={`${c.dedupe_key}-${i}`} style={{ border: `1px solid ${selected ? "#1d4ed8" : t.border}`, borderRadius: 10, padding: 10, background: t.bg, display: "grid", gap: 6, opacity: dismissed ? 0.45 : 1, filter: dismissed ? "saturate(0.4)" : "none" }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            {selectable && (
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => togglePreviewSelected(c.dedupe_key)}
                                style={{ cursor: "pointer" }}
                                aria-label="Select candidate"
                              />
                            )}
                            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", padding: "2px 7px", borderRadius: 999, background: sc.bg, color: sc.fg }}>
                              {statusLabel[c.status]}
                            </span>
                            <span style={{ fontSize: 11, color: t.textMuted, background: t.badgeBg, padding: "2px 7px", borderRadius: 999, fontVariantNumeric: "tabular-nums" }}>
                              score {b.score} <span style={{ opacity: 0.6 }}>(raw {b.rawScore})</span>
                            </span>
                            {c.enriched_from_body && (
                              <span
                                style={{ fontSize: 10, fontWeight: 800, padding: "1px 6px", borderRadius: 999, background: isDark ? "#0c2a4a" : "#dbeafe", color: isDark ? "#93c5fd" : "#1e40af" }}
                                title={c.score_before_body !== null ? `Snippet score was ${c.score_before_body}; body fetch raised it to ${b.score}` : "Body fetched"}
                              >
                                BODY
                                {c.score_before_body !== null && b.score > c.score_before_body
                                  ? ` +${b.score - c.score_before_body}`
                                  : ""}
                              </span>
                            )}
                            <span style={{ fontSize: 11, color: t.textMuted }}>
                              T:{b.titleHits} B:{b.bodyHits}
                              {typeof b.leBoostAmount === "number" && b.leBoostAmount > 0 ? ` · LE+${b.leBoostAmount}` : ""}
                              {typeof b.compoundAmount === "number" && b.compoundAmount > 0 ? ` · cmp+${b.compoundAmount}` : ""}
                              {b.hasContext ? " · ctx" : ""} {b.freshnessBonus ? `· fresh+${b.freshnessBonus}` : ""} {b.sourceWeight ? `· src+${b.sourceWeight}` : ""} {b.negativeIn ? `· neg(${b.negativeIn})` : ""}
                            </span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: t.text, marginLeft: "auto" }}>{c.source_name || "external"}</span>
                            {c.is_satire && (
                              <span style={{ fontSize: 10, fontWeight: 800, padding: "1px 6px", borderRadius: 999, background: isDark ? "#3a2a00" : "#fef3c7", color: isDark ? "#fde68a" : "#92400e" }}>SATIRE</span>
                            )}
                          </div>
                          <a href={c.source_url} target="_blank" rel="noreferrer noopener" style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.3, color: t.text, textDecoration: "none" }}>
                            {c.headline}
                          </a>
                          {c.summary && (
                            <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.45 }}>
                              {c.summary.length > 240 ? `${c.summary.slice(0, 240)}…` : c.summary}
                            </div>
                          )}
                          {c.intake_debug && (
                            <div style={{ fontSize: 11, color: t.textMuted, lineHeight: 1.45, padding: "8px 10px", borderRadius: 8, background: t.badgeBg, border: `1px solid ${t.border}` }}>
                              <div><strong style={{ color: t.text }}>Intake</strong> · provider {c.intake_debug.provider} · final score {c.intake_debug.final_score}</div>
                              {c.intake_debug.matched_queries.length > 0 && (
                                <div style={{ marginTop: 4 }}>
                                  <span style={{ fontWeight: 700, color: t.text }}>Queries:</span> {c.intake_debug.matched_queries.join(" · ")}
                                </div>
                              )}
                              {c.intake_debug.matched_terms.length > 0 && (
                                <div style={{ marginTop: 4 }}>
                                  <span style={{ fontWeight: 700, color: t.text }}>Matched terms:</span> {c.intake_debug.matched_terms.slice(0, 24).join(", ")}{c.intake_debug.matched_terms.length > 24 ? "…" : ""}
                                </div>
                              )}
                              <div style={{ marginTop: 4, fontStyle: "italic" }}>{c.intake_debug.inclusion_reason.length > 360 ? `${c.intake_debug.inclusion_reason.slice(0, 360)}…` : c.intake_debug.inclusion_reason}</div>
                            </div>
                          )}
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <a href={c.source_url} target="_blank" rel="noreferrer noopener" style={{ fontSize: 10, color: "#1d4ed8", wordBreak: "break-all", flex: 1 }}>
                              {c.source_url}
                            </a>
                            {c.status !== "would_insert" && c.status !== "duplicate_in_db" && !inserted && !dismissed && (
                              <button
                                type="button"
                                onClick={() => void insertPreviewCandidate(c)}
                                disabled={isInserting}
                                style={{ padding: "5px 11px", borderRadius: 8, border: "none", background: "#16a34a", color: "white", fontSize: 12, fontWeight: 700, cursor: isInserting ? "default" : "pointer", opacity: isInserting ? 0.7 : 1 }}
                                title="Force-insert this candidate into the pending queue"
                              >
                                {isInserting ? "Sending…" : "Send to pending"}
                              </button>
                            )}
                            {!inserted && !dismissed && (
                              <button
                                type="button"
                                onClick={() => void dismissOnePreview(c)}
                                disabled={isDismissing}
                                style={{ padding: "5px 11px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.surface, color: t.text, fontSize: 12, fontWeight: 700, cursor: isDismissing ? "default" : "pointer", opacity: isDismissing ? 0.7 : 1 }}
                                title="Permanently block this dedupe key from future ingestion runs"
                              >
                                {isDismissing ? "Dismissing…" : "Dismiss"}
                              </button>
                            )}
                            {inserted && (
                              <span style={{ fontSize: 11, fontWeight: 700, color: "#16a34a" }}>✓ Sent</span>
                            )}
                            {dismissed && (
                              <span style={{ fontSize: 11, fontWeight: 700, color: t.textMuted }}>✓ Blocked</span>
                            )}
                            {c.status === "duplicate_in_db" && (
                              <span style={{ fontSize: 11, color: t.textFaint }}>already in db</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
              );
            })()}

            {newsLoading && (
              <div style={{ padding: 24, textAlign: "center", color: t.textMuted, border: `1px solid ${t.border}`, borderRadius: 14, background: t.surface }}>
                Loading…
              </div>
            )}

            {!newsLoading && newsItems.length === 0 && (
              <div style={{ padding: 24, textAlign: "center", color: t.textFaint, border: `1px solid ${t.border}`, borderRadius: 14, background: t.surface }}>
                {newsFilter === "pending" ? "No items waiting for review." : newsFilter === "published" ? "Nothing has been approved into the feed yet." : "No items have been rejected."}
              </div>
            )}

            <div style={{ display: "grid", gap: 12 }}>
              {newsItems.map((n) => (
                <div key={n.id} style={{ border: `1px solid ${newsSelected.has(n.id) ? "#1d4ed8" : t.border}`, borderRadius: 14, background: t.surface, padding: 14, display: "grid", gap: 10 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <input
                      type="checkbox"
                      checked={newsSelected.has(n.id)}
                      onChange={() => toggleNewsSelected(n.id)}
                      style={{ marginTop: 4, cursor: "pointer" }}
                      aria-label="Select item"
                    />
                    {n.thumbnail_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={n.thumbnail_url} alt="" style={{ width: 120, height: 80, objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 240 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{
                          fontSize: 10, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase",
                          padding: "2px 7px", borderRadius: 999,
                          background: n.is_satire ? (isDark ? "#3a2a00" : "#fef3c7") : (isDark ? "#0c2a4a" : "#dbeafe"),
                          color: n.is_satire ? (isDark ? "#fde68a" : "#92400e") : (isDark ? "#93c5fd" : "#1e40af"),
                        }}>
                          {n.is_satire ? "Satire" : "Newswire"}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: t.text }}>{n.source_name || "external"}</span>
                        {typeof n.relevance_score === "number" && (
                          <span style={{ fontSize: 11, color: t.textMuted, background: t.badgeBg, padding: "2px 7px", borderRadius: 999 }}>
                            score {n.relevance_score.toFixed(0)}
                          </span>
                        )}
                        <span style={{ fontSize: 11, color: t.textFaint, marginLeft: "auto" }}>
                          {n.published_at ? new Date(n.published_at).toLocaleString() : new Date(n.ingested_at).toLocaleString()}
                        </span>
                      </div>
                      <a href={n.source_url} target="_blank" rel="noreferrer noopener" style={{ display: "block", marginTop: 6, fontWeight: 800, fontSize: 16, lineHeight: 1.3, color: t.text, textDecoration: "none" }}>
                        {n.headline}
                      </a>
                      {n.summary && (
                        <div style={{ marginTop: 6, fontSize: 13, color: t.textMuted, lineHeight: 1.5 }}>{n.summary}</div>
                      )}
                      {n.raw_payload?.intake_debug && (
                        <div style={{ marginTop: 8, fontSize: 11, color: t.textMuted, lineHeight: 1.45, padding: "8px 10px", borderRadius: 8, background: t.bg, border: `1px solid ${t.border}` }}>
                          <div><strong style={{ color: t.text }}>Intake debug</strong> · score {n.raw_payload.intake_debug.final_score} · {n.raw_payload.intake_debug.provider}</div>
                          {n.raw_payload.intake_debug.matched_queries.length > 0 && (
                            <div style={{ marginTop: 4 }}><strong style={{ color: t.text }}>Queries:</strong> {n.raw_payload.intake_debug.matched_queries.join(" · ")}</div>
                          )}
                          {n.raw_payload.intake_debug.matched_terms.length > 0 && (
                            <div style={{ marginTop: 4 }}><strong style={{ color: t.text }}>Terms:</strong> {n.raw_payload.intake_debug.matched_terms.slice(0, 20).join(", ")}{n.raw_payload.intake_debug.matched_terms.length > 20 ? "…" : ""}</div>
                          )}
                          <div style={{ marginTop: 4, fontStyle: "italic" }}>{n.raw_payload.intake_debug.inclusion_reason.length > 300 ? `${n.raw_payload.intake_debug.inclusion_reason.slice(0, 300)}…` : n.raw_payload.intake_debug.inclusion_reason}</div>
                        </div>
                      )}
                      <a href={n.source_url} target="_blank" rel="noreferrer noopener" style={{ display: "inline-block", marginTop: 6, fontSize: 11, color: "#1d4ed8", wordBreak: "break-all" }}>
                        {n.source_url}
                      </a>
                    </div>
                  </div>
                  {newsFilter === "pending" && (
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        onClick={() => void actOnNewsItem(n.id, "reject")}
                        disabled={newsActingId === n.id}
                        style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.surface, color: t.text, fontWeight: 700, fontSize: 13, cursor: newsActingId === n.id ? "default" : "pointer", opacity: newsActingId === n.id ? 0.7 : 1 }}
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => void actOnNewsItem(n.id, "approve")}
                        disabled={newsActingId === n.id}
                        style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: "#16a34a", color: "white", fontWeight: 700, fontSize: 13, cursor: newsActingId === n.id ? "default" : "pointer", opacity: newsActingId === n.id ? 0.7 : 1 }}
                      >
                        {newsActingId === n.id ? "Saving…" : "Approve to feed"}
                      </button>
                    </div>
                  )}
                  {newsFilter !== "pending" && n.reviewed_at && (
                    <div style={{ fontSize: 11, color: t.textFaint, textAlign: "right" }}>
                      Reviewed {new Date(n.reviewed_at).toLocaleString()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── EVENTS TAB ── */}
        {activeTab === "events" && (
          <div style={{ marginTop: 20, display: "grid", gap: 16 }}>
            <div style={{ border: `1px solid ${t.border}`, borderRadius: 14, padding: 24, background: t.surface }}>
              <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 6 }}>Manage Events</div>
              <div style={{ fontSize: 14, color: t.textMuted, marginBottom: 16 }}>
                Review, edit, or delete calendar events (same data as the Events page).
              </div>

              {adminEvents.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                  <input
                    type="search"
                    value={eventSearch}
                    onChange={(e) => setEventSearch(e.target.value)}
                    placeholder="Search by title, organization, location, POC..."
                    style={{
                      flex: 1,
                      border: `1px solid ${t.inputBorder}`,
                      borderRadius: 10,
                      padding: "8px 12px",
                      fontSize: 14,
                      background: t.input,
                      color: t.text,
                      outline: "none",
                    }}
                  />
                  {eventSearch.trim() && (
                    <span style={{ fontSize: 12, color: t.textMuted, whiteSpace: "nowrap" }}>
                      {filteredAdminEvents.length} / {adminEvents.length}
                    </span>
                  )}
                </div>
              )}

              {adminEvents.length === 0 && (
                <div style={{ color: t.textFaint, fontSize: 14 }}>No events yet.</div>
              )}
              {adminEvents.length > 0 && filteredAdminEvents.length === 0 && (
                <div style={{ color: t.textFaint, fontSize: 14 }}>No events match “{eventSearch}”.</div>
              )}

              <div style={{ display: "grid", gap: 12, minWidth: 0, width: "100%" }}>
                {filteredAdminEvents.map((ev) => (
                  <div key={ev.id}>
                    {editingEvent?.id === ev.id ? (
                      <div style={{ border: "2px solid #1e3a5f", borderRadius: 12, padding: 16, display: "grid", gap: 10 }}>
                        <input
                          value={editingEvent.title}
                          onChange={(e) => setEditingEvent((p) => p && ({ ...p, title: e.target.value }))}
                          placeholder="Event title"
                          style={{ border: `1px solid ${t.inputBorder}`, borderRadius: 8, padding: "8px 12px", fontSize: 14, background: t.input, color: t.text }}
                        />
                        <input
                          type="date"
                          value={editingEvent.date}
                          onChange={(e) => setEditingEvent((p) => p && ({ ...p, date: e.target.value }))}
                          style={{ border: `1px solid ${t.inputBorder}`, borderRadius: 8, padding: "8px 12px", fontSize: 14, background: t.input, color: t.text }}
                        />
                        <input
                          value={editingEvent.organization}
                          onChange={(e) => setEditingEvent((p) => p && ({ ...p, organization: e.target.value }))}
                          placeholder="Organization (optional)"
                          style={{ border: `1px solid ${t.inputBorder}`, borderRadius: 8, padding: "8px 12px", fontSize: 14, background: t.input, color: t.text }}
                        />
                        <input
                          value={editingEvent.signup_url}
                          onChange={(e) => setEditingEvent((p) => p && ({ ...p, signup_url: e.target.value }))}
                          placeholder="Sign-up URL (optional)"
                          style={{ border: `1px solid ${t.inputBorder}`, borderRadius: 8, padding: "8px 12px", fontSize: 14, background: t.input, color: t.text }}
                        />
                        <input
                          value={editingEvent.event_time}
                          onChange={(e) => setEditingEvent((p) => p && ({ ...p, event_time: e.target.value }))}
                          placeholder='Time (e.g. "6:00 PM EST")'
                          style={{ border: `1px solid ${t.inputBorder}`, borderRadius: 8, padding: "8px 12px", fontSize: 14, background: t.input, color: t.text }}
                        />
                        <input
                          value={editingEvent.location}
                          onChange={(e) => setEditingEvent((p) => p && ({ ...p, location: e.target.value }))}
                          placeholder="Location / address (optional)"
                          style={{ border: `1px solid ${t.inputBorder}`, borderRadius: 8, padding: "8px 12px", fontSize: 14, background: t.input, color: t.text }}
                        />
                        <input
                          value={editingEvent.poc_name}
                          onChange={(e) => setEditingEvent((p) => p && ({ ...p, poc_name: e.target.value }))}
                          placeholder="POC name (optional)"
                          style={{ border: `1px solid ${t.inputBorder}`, borderRadius: 8, padding: "8px 12px", fontSize: 14, background: t.input, color: t.text }}
                        />
                        <input
                          value={editingEvent.poc_phone}
                          onChange={(e) => setEditingEvent((p) => p && ({ ...p, poc_phone: e.target.value }))}
                          placeholder="POC phone (optional)"
                          type="tel"
                          style={{ border: `1px solid ${t.inputBorder}`, borderRadius: 8, padding: "8px 12px", fontSize: 14, background: t.input, color: t.text }}
                        />
                        <input
                          value={editingEvent.image_url}
                          onChange={(e) => setEditingEvent((p) => p && ({ ...p, image_url: e.target.value }))}
                          placeholder="Cover image URL (optional)"
                          style={{ border: `1px solid ${t.inputBorder}`, borderRadius: 8, padding: "8px 12px", fontSize: 14, background: t.input, color: t.text }}
                        />
                        <input
                          ref={eventPhotoInputRef}
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          onChange={(e) => {
                            const file = e.target.files?.[0] ?? null;
                            void handleEventPhotoPick(file);
                            e.currentTarget.value = "";
                          }}
                        />
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={() => eventPhotoInputRef.current?.click()}
                            disabled={eventPhotoUploading}
                            style={{
                              background: "#1e3a5f",
                              color: "white",
                              border: "none",
                              borderRadius: 8,
                              padding: "7px 12px",
                              fontWeight: 700,
                              fontSize: 13,
                              cursor: eventPhotoUploading ? "not-allowed" : "pointer",
                              opacity: eventPhotoUploading ? 0.6 : 1,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {eventPhotoUploading ? "Uploading..." : editingEvent.image_url?.trim() ? "Change Photo" : "Add Photo"}
                          </button>
                          {editingEvent.image_url?.trim() && (
                            <button
                              type="button"
                              onClick={() => setEditingEvent((p) => (p ? { ...p, image_url: "" } : p))}
                              disabled={eventPhotoUploading}
                              style={{
                                background: t.badgeBg,
                                color: t.text,
                                border: `1px solid ${t.border}`,
                                borderRadius: 8,
                                padding: "7px 12px",
                                fontWeight: 700,
                                fontSize: 13,
                                cursor: eventPhotoUploading ? "not-allowed" : "pointer",
                                opacity: eventPhotoUploading ? 0.6 : 1,
                                whiteSpace: "nowrap",
                              }}
                            >
                              Clear Photo
                            </button>
                          )}
                        </div>
                        {editingEvent.image_url?.trim() && (
                          <div style={{ position: "relative", width: 160, height: 100 }}>
                            <img
                              src={editingEvent.image_url}
                              alt=""
                              style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8, border: `2px solid ${t.border}` }}
                            />
                            <button
                              type="button"
                              onClick={() => eventPhotoInputRef.current?.click()}
                              disabled={eventPhotoUploading}
                              style={{
                                position: "absolute",
                                inset: 0,
                                border: "none",
                                borderRadius: 8,
                                background: "rgba(0,0,0,0.38)",
                                color: "white",
                                fontSize: 11,
                                fontWeight: 800,
                                cursor: eventPhotoUploading ? "not-allowed" : "pointer",
                              }}
                              title="Change event photo"
                            >
                              {eventPhotoUploading ? "Uploading..." : "Change Photo"}
                            </button>
                          </div>
                        )}
                        <textarea
                          value={editingEvent.description}
                          onChange={(e) => setEditingEvent((p) => p && ({ ...p, description: e.target.value }))}
                          placeholder="Description (optional)"
                          rows={4}
                          style={{ border: `1px solid ${t.inputBorder}`, borderRadius: 8, padding: "8px 12px", fontSize: 14, background: t.input, color: t.text, resize: "vertical" }}
                        />
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={updateAdminEvent}
                            disabled={eventEditSaving || !editingEvent.title.trim() || !editingEvent.date}
                            style={{ background: "#1e3a5f", color: "white", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 800, fontSize: 14, cursor: "pointer", opacity: eventEditSaving ? 0.6 : 1 }}
                          >
                            {eventEditSaving ? "Saving..." : "Save Changes"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingEvent(null)}
                            style={{ background: t.badgeBg, color: t.text, border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : isMobile ? (
                      <div
                        style={{
                          border: `1px solid ${t.border}`,
                          borderRadius: 14,
                          padding: 16,
                          background: t.bg,
                          display: "flex",
                          flexDirection: "column",
                          gap: 10,
                          boxSizing: "border-box",
                          width: "100%",
                          maxWidth: "100%",
                        }}
                      >
                        <div style={{ fontWeight: 800, fontSize: 16, lineHeight: 1.25 }}>{ev.title}</div>
                        <div style={{ fontSize: 13, color: t.textMuted }}>
                          {new Date(`${ev.date}T12:00:00`).toLocaleDateString("en-US", {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                          {ev.organization ? ` · ${ev.organization}` : ""}
                        </div>
                        {ev.description && (
                          <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.45, wordBreak: "break-word" }}>{ev.description}</div>
                        )}
                        {ev.signup_url && (
                          <a href={ev.signup_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 700, color: "#7c3aed", wordBreak: "break-all" }}>
                            Sign-up link ↗
                          </a>
                        )}
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={() =>
                              setEditingEvent({
                                id: ev.id,
                                title: ev.title,
                                description: ev.description ?? "",
                                date: ev.date,
                                organization: ev.organization ?? "",
                                signup_url: ev.signup_url ?? "",
                                image_url: ev.image_url ?? "",
                                location: ev.location ?? "",
                                event_time: ev.event_time ?? "",
                                poc_name: ev.poc_name ?? "",
                                poc_phone: ev.poc_phone ?? "",
                              })
                            }
                            style={{ background: "#1e3a5f", color: "white", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteAdminEvent(ev.id, ev.title)}
                            style={{ background: "#ef4444", color: "white", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap", minWidth: 0, width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: `1px solid ${t.border}`, background: t.bg, overflow: "hidden" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: 14, wordBreak: "break-word" }}>{ev.title}</div>
                          <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>
                            {new Date(`${ev.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            {ev.organization ? ` · ${ev.organization}` : ""}
                          </div>
                          {ev.description && (
                            <div style={{ fontSize: 12, color: t.textFaint, marginTop: 2, overflowWrap: "anywhere", wordBreak: "break-word" }}>
                              {ev.description}
                            </div>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: "auto", flexWrap: "wrap", justifyContent: "flex-end", maxWidth: "100%" }}>
                          <button
                            type="button"
                            onClick={() =>
                              setEditingEvent({
                                id: ev.id,
                                title: ev.title,
                                description: ev.description ?? "",
                                date: ev.date,
                                organization: ev.organization ?? "",
                                signup_url: ev.signup_url ?? "",
                                image_url: ev.image_url ?? "",
                                location: ev.location ?? "",
                                event_time: ev.event_time ?? "",
                                poc_name: ev.poc_name ?? "",
                                poc_phone: ev.poc_phone ?? "",
                              })
                            }
                            style={{ background: "#1e3a5f", color: "white", border: "none", borderRadius: 8, padding: "6px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteAdminEvent(ev.id, ev.title)}
                            style={{ background: "#ef4444", color: "white", border: "none", borderRadius: 8, padding: "6px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Manage Memorials */}
            <div style={{ border: `1px solid ${t.border}`, borderRadius: 14, padding: 24, background: t.surface }}>
              <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 6 }}>Manage Memorials</div>
              <div style={{ fontSize: 14, color: t.textMuted, marginBottom: 16 }}>
                Edit or delete memorial entries (same data as the Events page). New memorials should be added from the Events page.
              </div>

              {memorials.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                  <input
                    type="search"
                    value={memorialSearch}
                    onChange={(e) => setMemorialSearch(e.target.value)}
                    placeholder="Search by name or bio..."
                    style={{
                      flex: 1,
                      border: `1px solid ${t.inputBorder}`,
                      borderRadius: 10,
                      padding: "8px 12px",
                      fontSize: 14,
                      background: t.input,
                      color: t.text,
                      outline: "none",
                    }}
                  />
                  {memorialSearch.trim() && (
                    <span style={{ fontSize: 12, color: t.textMuted, whiteSpace: "nowrap" }}>
                      {filteredMemorials.length} / {memorials.length}
                    </span>
                  )}
                </div>
              )}

              {memorials.length === 0 && (
                <div style={{ color: t.textFaint, fontSize: 14 }}>No memorials yet.</div>
              )}
              {memorials.length > 0 && filteredMemorials.length === 0 && (
                <div style={{ color: t.textFaint, fontSize: 14 }}>No memorials match “{memorialSearch}”.</div>
              )}

              <div style={{ display: "grid", gap: 12, minWidth: 0, width: "100%" }}>
                {filteredMemorials.map((mem) => (
                  <div key={mem.id}>
                    {editingMemorial?.id === mem.id ? (
                      /* ── Inline edit form ── */
                      <div style={{ border: `2px solid #d9582b`, borderRadius: 12, padding: 16, display: "grid", gap: 10 }}>
                        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 180px", gap: 8 }}>
                          <input
                            value={editingMemorial.name}
                            onChange={(e) => setEditingMemorial((p) => p && ({ ...p, name: e.target.value }))}
                            placeholder="Full name"
                            style={{ border: `1px solid ${t.inputBorder}`, borderRadius: 8, padding: "8px 12px", fontSize: 14, background: t.input, color: t.text }}
                          />
                          <input
                            type="date"
                            value={editingMemorial.death_date}
                            onChange={(e) => setEditingMemorial((p) => p && ({ ...p, death_date: e.target.value }))}
                            style={{ border: `1px solid ${t.inputBorder}`, borderRadius: 8, padding: "8px 12px", fontSize: 14, background: t.input, color: t.text }}
                          />
                        </div>
                        <input
                          value={editingMemorial.photo_url}
                          onChange={(e) => setEditingMemorial((p) => p && ({ ...p, photo_url: e.target.value }))}
                          placeholder="Photo URL"
                          style={{ border: `1px solid ${t.inputBorder}`, borderRadius: 8, padding: "8px 12px", fontSize: 14, background: t.input, color: t.text }}
                        />
                        <input
                          ref={memorialPhotoInputRef}
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          onChange={(e) => {
                            const file = e.target.files?.[0] ?? null;
                            void handleMemorialPhotoPick(file);
                            e.currentTarget.value = "";
                          }}
                        />
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={() => memorialPhotoInputRef.current?.click()}
                            disabled={memPhotoUploading}
                            style={{
                              background: "#d9582b",
                              color: "white",
                              border: "none",
                              borderRadius: 8,
                              padding: "7px 12px",
                              fontWeight: 700,
                              fontSize: 13,
                              cursor: memPhotoUploading ? "not-allowed" : "pointer",
                              opacity: memPhotoUploading ? 0.6 : 1,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {memPhotoUploading ? "Uploading..." : editingMemorial.photo_url?.trim() ? "Change Photo" : "Add Photo"}
                          </button>
                          {editingMemorial.photo_url?.trim() && (
                            <button
                              type="button"
                              onClick={() => setEditingMemorial((p) => (p ? { ...p, photo_url: "" } : p))}
                              disabled={memPhotoUploading}
                              style={{
                                background: t.badgeBg,
                                color: t.text,
                                border: `1px solid ${t.border}`,
                                borderRadius: 8,
                                padding: "7px 12px",
                                fontWeight: 700,
                                fontSize: 13,
                                cursor: memPhotoUploading ? "not-allowed" : "pointer",
                                opacity: memPhotoUploading ? 0.6 : 1,
                                whiteSpace: "nowrap",
                              }}
                            >
                              Clear Photo
                            </button>
                          )}
                        </div>
                        <textarea
                          value={editingMemorial.bio}
                          onChange={(e) => setEditingMemorial((p) => p && ({ ...p, bio: e.target.value }))}
                          placeholder="Bio"
                          rows={4}
                          style={{ border: `1px solid ${t.inputBorder}`, borderRadius: 8, padding: "8px 12px", fontSize: 14, background: t.input, color: t.text, resize: "vertical" }}
                        />
                        <input
                          value={editingMemorial.source_url}
                          onChange={(e) => setEditingMemorial((p) => p && ({ ...p, source_url: e.target.value }))}
                          placeholder="Source URL (optional)"
                          style={{ border: `1px solid ${t.inputBorder}`, borderRadius: 8, padding: "8px 12px", fontSize: 14, background: t.input, color: t.text }}
                        />
                        {editingMemorial.photo_url && (
                          <div style={{ position: "relative", width: 72, height: 90 }}>
                            <img src={editingMemorial.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8, border: "2px solid #d9582b" }} />
                            <button
                              type="button"
                              onClick={() => memorialPhotoInputRef.current?.click()}
                              disabled={memPhotoUploading}
                              style={{
                                position: "absolute",
                                inset: 0,
                                border: "none",
                                borderRadius: 8,
                                background: "rgba(0,0,0,0.38)",
                                color: "white",
                                fontSize: 11,
                                fontWeight: 800,
                                cursor: memPhotoUploading ? "not-allowed" : "pointer",
                              }}
                              title="Change memorial photo"
                            >
                              {memPhotoUploading ? "Uploading..." : "Change Photo"}
                            </button>
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={updateMemorial}
                            disabled={memEditSaving || !editingMemorial.name.trim() || !editingMemorial.death_date}
                            style={{ background: "#d9582b", color: "white", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 800, fontSize: 14, cursor: "pointer", opacity: memEditSaving ? 0.6 : 1 }}
                          >
                            {memEditSaving ? "Saving..." : "Save Changes"}
                          </button>
                          <button
                            onClick={() => setEditingMemorial(null)}
                            style={{ background: t.badgeBg, color: t.text, border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : isMobile ? (
                      /* ── Mobile: same card pattern as events page day-detail memorials ── */
                      <div
                        style={{
                          border: "2px solid #d9582b",
                          borderRadius: 14,
                          padding: 20,
                          background: isDark ? "#2a1409" : "#fdf3ed",
                          display: "flex",
                          flexDirection: "column",
                          gap: 14,
                          boxSizing: "border-box",
                          width: "100%",
                          maxWidth: "100%",
                        }}
                      >
                        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", minWidth: 0 }}>
                          {mem.photo_url ? (
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
                              <img src={mem.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            </div>
                          ) : (
                            <div
                              style={{
                                width: 72,
                                height: 72,
                                borderRadius: "50%",
                                background: t.badgeBg,
                                flexShrink: 0,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 28,
                                border: "3px solid #d9582b",
                              }}
                            >
                              🪖
                            </div>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 800, fontSize: 16, lineHeight: 1.25 }}>{mem.name}</div>
                            <div style={{ fontSize: 13, color: t.textMuted, marginTop: 4 }}>
                              {mem.death_date
                                ? new Date(mem.death_date + "T00:00:00").toLocaleDateString("en-US", {
                                    year: "numeric",
                                    month: "long",
                                    day: "numeric",
                                  })
                                : "No date"}
                            </div>
                            {memorialBioPreview(mem, "mobile")}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={() =>
                              setEditingMemorial({
                                id: mem.id,
                                name: mem.name,
                                death_date: mem.death_date,
                                photo_url: mem.photo_url ?? "",
                                bio: mem.bio ?? "",
                                source_url: mem.source_url ?? "",
                              })
                            }
                            style={{ background: "#1e3a5f", color: "white", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteMemorial(mem.id, mem.name)}
                            style={{ background: "#ef4444", color: "white", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* ── Desktop: row view ── */
                      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap", minWidth: 0, width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: `1px solid ${t.border}`, background: t.bg, overflow: "hidden" }}>
                        {mem.photo_url
                          ? <img src={mem.photo_url} alt="" style={{ width: 44, height: 56, objectFit: "cover", borderRadius: 6, flexShrink: 0, border: "2px solid #d9582b" }} />
                          : <div style={{ width: 44, height: 56, borderRadius: 6, background: t.badgeBg, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🪖</div>
                        }
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: 14, wordBreak: "break-word" }}>{mem.name}</div>
                          <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>
                            {mem.death_date ? new Date(mem.death_date + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "No date"}
                          </div>
                          {memorialBioPreview(mem, "desktop")}
                        </div>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0, alignSelf: "center", marginLeft: "auto", flexWrap: "wrap", justifyContent: "flex-end", maxWidth: "100%" }}>
                          <button
                            type="button"
                            onClick={() => setEditingMemorial({ id: mem.id, name: mem.name, death_date: mem.death_date, photo_url: mem.photo_url ?? "", bio: mem.bio ?? "", source_url: mem.source_url ?? "" })}
                            style={{ background: "#1e3a5f", color: "white", border: "none", borderRadius: 8, padding: "6px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteMemorial(mem.id, mem.name)}
                            style={{ background: "#ef4444", color: "white", border: "none", borderRadius: 8, padding: "6px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
