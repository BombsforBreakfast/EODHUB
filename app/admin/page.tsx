"use client";

export const dynamic = "force-dynamic";

import React, { useEffect, useState } from "react";
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

type BusinessListing = {
  id: string;
  created_at: string;
  business_name: string | null;
  website_url: string;
  custom_blurb: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  og_site_name: string | null;
  is_approved: boolean;
  is_featured: boolean;
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

type Tab = "businesses" | "jobs" | "users" | "flags" | "events" | "reports" | "directory";

type DirectoryEntry = {
  id: string;
  org_type: string;
  name: string;
  phone: string | null;
  state: string | null;
  unit_slug: string | null;
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
  created_at: string;
};

type EventEdit = {
  id: string;
  title: string;
  description: string;
  date: string;
  organization: string;
  signup_url: string;
};

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("businesses");

  const [businesses, setBusinesses] = useState<BusinessListing[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
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
  /** Admin memorial list: expand/collapse long bios (Manage Memorials cards). */
  const [memorialBioExpandedIds, setMemorialBioExpandedIds] = useState<Record<string, boolean>>({});
  const [isMobile, setIsMobile] = useState(false);

  const [adminEvents, setAdminEvents] = useState<AdminCalendarEvent[]>([]);
  const [editingEvent, setEditingEvent] = useState<EventEdit | null>(null);
  const [eventEditSaving, setEventEditSaving] = useState(false);

  const [bugReports, setBugReports] = useState<BugReport[]>([]);
  const [reportsFilter, setReportsFilter] = useState<"unreviewed" | "all">("unreviewed");

  const [directoryEntries, setDirectoryEntries] = useState<DirectoryEntry[]>([]);
  const [locationRequests, setLocationRequests] = useState<LocationRequest[]>([]);
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
      const withTier = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, display_name, role, service, verification_status, is_admin, is_employer, employer_verified, created_at, access_tier")
        .order("created_at", { ascending: false });
      const fallback = withTier.error
        ? await supabase
            .from("profiles")
            .select("user_id, first_name, last_name, display_name, role, service, verification_status, is_admin, is_employer, employer_verified, created_at")
            .order("created_at", { ascending: false })
        : withTier;
      if (!fallback.error) setUsers((fallback.data ?? []).map((u) => ({ ...u, email: null })) as UserProfile[]);
      return;
    }
    const json = await res.json();
    setUsers((json.users ?? []) as UserProfile[]);
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
    const commentIds = rawFlags.filter((f) => f.content_type === "comment").map((f) => f.content_id);
    const messageIds = rawFlags.filter((f) => f.content_type === "message").map((f) => f.content_id);

    const [profilesRes, postsRes, commentsRes, msgsRes] = await Promise.all([
      reporterIds.length > 0 ? supabase.from("profiles").select("user_id, first_name, last_name, display_name").in("user_id", reporterIds) : { data: [] },
      postIds.length > 0 ? supabase.from("posts").select("id, user_id, content").in("id", postIds) : { data: [] },
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
    if (activeTab === "flags") loadFlags();
    if (activeTab === "events") {
      void loadAdminEvents();
      void loadMemorials();
    }
    if (activeTab === "reports") loadBugReports();
    if (activeTab === "directory") loadDirectory();
  }, [pendingOnly, activeTab, authorized]);

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
    const { error } = await supabase
      .from("business_listings")
      .update({
        business_name: editingBiz.business_name || null,
        og_title: editingBiz.og_title || null,
        og_description: editingBiz.og_description || null,
        og_image: editingBiz.og_image || null,
        custom_blurb: editingBiz.custom_blurb || null,
      })
      .eq("id", editingBiz.id);
    if (error) { alert(error.message); } else { showToast("Listing updated!"); setEditingBiz(null); await loadBusinesses(); }
    setActionLoading(null);
  }

  async function removeFlaggedContent(flag: Flag) {
    if (!confirm(`Permanently delete this ${flag.content_type}?`)) return;
    setActionLoading(flag.id + "-remove");
    const table = flag.content_type === "post" ? "posts" : "post_comments";
    const { error } = await supabase.from(table).delete().eq("id", flag.content_id);
    if (error) { alert(error.message); return; }
    await supabase.from("flags").update({ reviewed: true }).eq("id", flag.id);
    showToast(`${flag.content_type === "post" ? "Post" : "Comment"} removed.`);
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
      if (!res.ok) throw new Error(json.error || "Fetch failed");
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
      setMemWizMsg({ type: "err", text: `Could not fetch metadata — fill in manually. (${err instanceof Error ? err.message : String(err)})` });
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
      .select("id, user_id, title, description, date, organization, signup_url, created_at")
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
      const { error } = await supabase
        .from("events")
        .update({
          title: editingEvent.title.trim(),
          description: editingEvent.description.trim() || null,
          date: editingEvent.date,
          organization: editingEvent.organization.trim() || null,
          signup_url: editingEvent.signup_url.trim() || null,
        })
        .eq("id", editingEvent.id);
      if (error) throw new Error(error.message);
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
      const { error } = await supabase.from("memorials").update({
        name: editingMemorial.name.trim(),
        death_date: editingMemorial.death_date,
        photo_url: editingMemorial.photo_url.trim() || null,
        bio: editingMemorial.bio.trim() || null,
        source_url: editingMemorial.source_url.trim() || null,
      }).eq("id", editingMemorial.id);
      if (error) throw new Error(error.message);
      showToast("Memorial updated.");
      setEditingMemorial(null);
      await loadMemorials();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setMemEditSaving(false);
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
              color: "#7c3aed",
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
      <div style={{ width: "100%", maxWidth: 1800, margin: "0 auto", padding: "24px 20px", boxSizing: "border-box", background: t.bg, minHeight: "100vh", color: t.text }}>
        <NavBar />
        <div style={{ marginTop: 40, textAlign: "center", color: t.textMuted }}>Loading...</div>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div style={{ width: "100%", maxWidth: 1800, margin: "0 auto", padding: "24px 20px", boxSizing: "border-box", background: t.bg, minHeight: "100vh", color: t.text }}>
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
    <div style={{ width: "100%", maxWidth: 1800, margin: "0 auto", padding: "24px 20px", boxSizing: "border-box", background: t.bg, minHeight: "100vh", color: t.text }}>
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

      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
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
                        <span style={{ background: flag.content_type === "post" ? "#dbeafe" : flag.content_type === "message" ? "#ede9fe" : "#fef9c3", color: flag.content_type === "post" ? "#1d4ed8" : flag.content_type === "message" ? "#6d28d9" : "#854d0e", fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 20, textTransform: "uppercase" }}>
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
                const name = u.display_name || `${u.first_name || ""} ${u.last_name || ""}`.trim() || "Unnamed User";
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
                  <span style={{ background: "#374151", color: "#fff", borderRadius: 6, padding: "3px 10px", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap", flexShrink: 0 }}>{entry.org_type}</span>
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <div style={{ fontWeight: 800, fontSize: 15, color: t.text }}>{entry.name}</div>
                    <div style={{ fontSize: 13, color: t.textMuted, marginTop: 2 }}>
                      {[entry.state, entry.phone, entry.unit_slug ? `slug: ${entry.unit_slug}` : null].filter(Boolean).join(" · ")}
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

        {/* ── EVENTS TAB ── */}
        {activeTab === "events" && (
          <div style={{ marginTop: 20, display: "grid", gap: 16 }}>
            <div style={{ border: `1px solid ${t.border}`, borderRadius: 14, padding: 24, background: t.surface }}>
              <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 6 }}>Manage Events</div>
              <div style={{ fontSize: 14, color: t.textMuted, marginBottom: 16 }}>
                Review, edit, or delete calendar events (same data as the Events page).
              </div>

              {adminEvents.length === 0 && (
                <div style={{ color: t.textFaint, fontSize: 14 }}>No events yet.</div>
              )}

              <div style={{ display: "grid", gap: 12, minWidth: 0, width: "100%" }}>
                {adminEvents.map((ev) => (
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
                      <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 12px", borderRadius: 10, border: `1px solid ${t.border}`, background: t.bg, overflow: "hidden" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: 14 }}>{ev.title}</div>
                          <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>
                            {new Date(`${ev.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            {ev.organization ? ` · ${ev.organization}` : ""}
                          </div>
                          {ev.description && (
                            <div style={{ fontSize: 12, color: t.textFaint, marginTop: 2, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                              {ev.description}
                            </div>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
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
                Edit or delete memorial entries (same data as the Events page).
              </div>

              {memorials.length === 0 && (
                <div style={{ color: t.textFaint, fontSize: 14 }}>No memorials yet.</div>
              )}

              <div style={{ display: "grid", gap: 12, minWidth: 0, width: "100%" }}>
                {memorials.map((mem) => (
                  <div key={mem.id}>
                    {editingMemorial?.id === mem.id ? (
                      /* ── Inline edit form ── */
                      <div style={{ border: `2px solid #7c3aed`, borderRadius: 12, padding: 16, display: "grid", gap: 10 }}>
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
                          <img src={editingMemorial.photo_url} alt="" style={{ width: 72, height: 90, objectFit: "cover", borderRadius: 8, border: "2px solid #7c3aed" }} />
                        )}
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={updateMemorial}
                            disabled={memEditSaving || !editingMemorial.name.trim() || !editingMemorial.death_date}
                            style={{ background: "#7c3aed", color: "white", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 800, fontSize: 14, cursor: "pointer", opacity: memEditSaving ? 0.6 : 1 }}
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
                          border: "2px solid #7c3aed",
                          borderRadius: 14,
                          padding: 20,
                          background: isDark ? "#1a0d2e" : "#faf5ff",
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
                                border: "3px solid #7c3aed",
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
                                border: "3px solid #7c3aed",
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
                      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 12px", borderRadius: 10, border: `1px solid ${t.border}`, background: t.bg, overflow: "hidden" }}>
                        {mem.photo_url
                          ? <img src={mem.photo_url} alt="" style={{ width: 44, height: 56, objectFit: "cover", borderRadius: 6, flexShrink: 0, border: "2px solid #7c3aed" }} />
                          : <div style={{ width: 44, height: 56, borderRadius: 6, background: t.badgeBg, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🪖</div>
                        }
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: 14 }}>{mem.name}</div>
                          <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>
                            {mem.death_date ? new Date(mem.death_date + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "No date"}
                          </div>
                          {memorialBioPreview(mem, "desktop")}
                        </div>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0, alignSelf: "center" }}>
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

            {/* Add Memorial by URL — desktop only; mobile uses public Events page to add */}
            {!isMobile && (
            <div style={{ border: `1px solid ${t.border}`, borderRadius: 14, padding: 24, background: t.surface }}>
              <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 6 }}>Add Memorial by URL</div>
              <div style={{ fontSize: 14, color: t.textMuted, marginBottom: 16, lineHeight: 1.6 }}>
                Paste a memorial URL and hit Fetch — name and date auto-fill from the page. Edit if needed, then save. Repeat for each entry.
              </div>

              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input
                    value={memWizUrl}
                    onChange={(e) => setMemWizUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && fetchMemorialMeta()}
                    placeholder="https://eod-wf.org/virtual-memorial/army/..."
                    style={{ flex: 1, minWidth: 0, border: `1px solid ${t.inputBorder}`, borderRadius: 8, padding: "8px 12px", fontSize: 14, background: t.input, color: t.text }}
                  />
                  <button
                    onClick={fetchMemorialMeta}
                    disabled={memWizFetching || !memWizUrl.trim()}
                    style={{ background: t.text, color: t.surface, border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 700, fontSize: 14, cursor: memWizFetching || !memWizUrl.trim() ? "not-allowed" : "pointer", opacity: memWizFetching || !memWizUrl.trim() ? 0.5 : 1, whiteSpace: "nowrap" }}
                  >
                    {memWizFetching ? "Fetching..." : "Fetch"}
                  </button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 180px", gap: 8 }}>
                  <input
                    value={memWizName}
                    onChange={(e) => setMemWizName(e.target.value)}
                    placeholder="Full name"
                    style={{ border: `1px solid ${t.inputBorder}`, borderRadius: 8, padding: "8px 12px", fontSize: 14, background: t.input, color: t.text }}
                  />
                  <input
                    type="date"
                    value={memWizDate}
                    onChange={(e) => setMemWizDate(e.target.value)}
                    style={{ border: `1px solid ${t.inputBorder}`, borderRadius: 8, padding: "8px 12px", fontSize: 14, background: t.input, color: t.text }}
                  />
                </div>

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
                      {!memWizBio && <div style={{ fontSize: 13, color: t.textFaint, marginTop: 4 }}>No bio extracted — add manually if needed.</div>}
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <button
                    onClick={saveMemorial}
                    disabled={memWizSaving || !memWizName.trim() || !memWizDate}
                    style={{ background: "#7c3aed", color: "white", border: "none", borderRadius: 8, padding: "9px 20px", fontWeight: 800, fontSize: 14, cursor: memWizSaving || !memWizName.trim() || !memWizDate ? "not-allowed" : "pointer", opacity: memWizSaving || !memWizName.trim() || !memWizDate ? 0.5 : 1 }}
                  >
                    {memWizSaving ? "Saving..." : "Add Memorial"}
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

            {isMobile && (
              <div style={{ border: `1px solid ${t.border}`, borderRadius: 14, padding: 16, background: t.surface }}>
                <div style={{ fontSize: 14, color: t.textMuted, lineHeight: 1.55 }}>
                  To add memorials from your phone, use the{" "}
                  <Link href="/events" style={{ color: "#7c3aed", fontWeight: 800 }}>
                    Events
                  </Link>{" "}
                  page. Edit or remove submitted events and memorials under Admin{" "}
                  <strong>Events</strong>.
                </div>
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  );
}
