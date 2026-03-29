"use client";

export const dynamic = "force-dynamic";

import React, { useEffect, useState } from "react";
import { supabase } from "../lib/lib/supabaseClient";
import NavBar from "../components/NavBar";
import { useTheme } from "../lib/ThemeContext";

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
  created_at: string | null;
};

type Tab = "businesses" | "jobs" | "users" | "flags" | "tools";

type Flag = {
  id: string;
  created_at: string;
  reporter_id: string | null;
  content_type: string;
  content_id: string;
  reason: string | null;
  reviewed: boolean;
  reporter_name?: string | null;
  content_preview?: string | null;
};

type BizEdit = {
  id: string;
  business_name: string;
  og_title: string;
  og_description: string;
  og_image: string;
  custom_blurb: string;
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
  const [importingMemorials, setImportingMemorials] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; total: number; errors: string[] } | null>(null);
  const [memWizUrl, setMemWizUrl] = useState("");
  const [memWizName, setMemWizName] = useState("");
  const [memWizDate, setMemWizDate] = useState("");
  const [memWizImage, setMemWizImage] = useState("");
  const [memWizBio, setMemWizBio] = useState("");
  const [memWizFetching, setMemWizFetching] = useState(false);
  const [memWizSaving, setMemWizSaving] = useState(false);
  const [memWizMsg, setMemWizMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const { t, isDark } = useTheme();

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  function askConfirm(message: string, onConfirm: () => void) {
    setConfirmDialog({ message, onConfirm });
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
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, display_name, role, service, verification_status, is_admin, created_at")
        .order("created_at", { ascending: false });
      if (!error) setUsers((data ?? []).map((u) => ({ ...u, email: null })) as UserProfile[]);
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

    const [profilesRes, postsRes, commentsRes] = await Promise.all([
      reporterIds.length > 0 ? supabase.from("profiles").select("user_id, first_name, last_name, display_name").in("user_id", reporterIds) : { data: [] },
      postIds.length > 0 ? supabase.from("posts").select("id, content").in("id", postIds) : { data: [] },
      commentIds.length > 0 ? supabase.from("post_comments").select("id, content").in("id", commentIds) : { data: [] },
    ]);

    type ProfileRow = { user_id: string; first_name: string | null; last_name: string | null; display_name: string | null };
    type ContentRow = { id: string; content: string | null };

    const profileMap = new Map<string, string>();
    ((profilesRes.data ?? []) as ProfileRow[]).forEach((p) => {
      profileMap.set(p.user_id, p.display_name || `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Unknown");
    });

    const contentMap = new Map<string, string>();
    ([...(postsRes.data ?? []), ...(commentsRes.data ?? [])] as ContentRow[]).forEach((c) => {
      contentMap.set(c.id, c.content || "");
    });

    setFlags(rawFlags.map((f) => ({
      ...f,
      reporter_name: f.reporter_id ? profileMap.get(f.reporter_id) ?? null : null,
      content_preview: contentMap.get(f.content_id) ?? null,
    })));
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
      await Promise.all([loadBusinesses(), loadJobs(), loadUsers(), loadFlags()]);
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
  }, [pendingOnly, activeTab, authorized]);

  async function approveBusiness(id: string, featured = false) {
    setActionLoading(id);
    const { error } = await supabase
      .from("business_listings")
      .update({ is_approved: true, is_featured: featured })
      .eq("id", id);
    if (error) { alert(error.message); } else { showToast(featured ? "Approved & featured!" : "Approved!"); await loadBusinesses(); }
    setActionLoading(null);
  }

  async function rejectBusiness(id: string) {
    askConfirm("Delete this business listing?", async () => {
      setActionLoading(id);
      const { error } = await supabase.from("business_listings").delete().eq("id", id);
      if (error) { alert(error.message); } else { showToast("Listing removed."); await loadBusinesses(); }
      setActionLoading(null);
    });
  }

  async function approveJob(id: string) {
    // Optimistically remove from pending list immediately
    if (pendingOnly) setJobs((prev) => prev.filter((j) => j.id !== id));
    showToast("Job approved!");

    const { data: { session } } = await supabase.auth.getSession();
    await fetch(`/api/admin/approve-job?id=${id}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
    });
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
          await loadUsers();
        }
      } else {
        const { error } = await supabase.from("profiles").update({ verification_status: status }).eq("user_id", userId);
        if (error) { alert(error.message); } else { showToast(`Verification set to "${status}"`); await loadUsers(); }
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
      if (error) { alert(error.message); } else { showToast("User denied."); await loadUsers(); }
    } finally {
      setActionLoading(null);
    }
  }

  async function toggleAdmin(userId: string, current: boolean | null) {
    if (!confirm(`${current ? "Remove" : "Grant"} admin access for this user?`)) return;
    setActionLoading(userId + "-admin");
    const { error } = await supabase.from("profiles").update({ is_admin: !current }).eq("user_id", userId);
    if (error) { alert(error.message); } else { showToast(current ? "Admin removed." : "Admin granted!"); await loadUsers(); }
    setActionLoading(null);
  }

  async function dismissFlag(id: string) {
    setActionLoading(id);
    const { error } = await supabase.from("flags").update({ reviewed: true }).eq("id", id);
    if (error) { alert(error.message); } else { showToast("Flag dismissed."); await loadFlags(); }
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

  async function importMemorials() {
    setImportingMemorials(true);
    setImportResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/import-memorials", {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Import failed");
      setImportResult(json);
    } catch (err) {
      setImportResult({ imported: 0, skipped: 0, total: 0, errors: [err instanceof Error ? err.message : String(err)] });
    } finally {
      setImportingMemorials(false);
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

  const tabStyle = (tab: Tab): React.CSSProperties => ({
    padding: "9px 20px",
    borderRadius: 10,
    border: "none",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    background: activeTab === tab ? "#111" : t.badgeBg,
    color: activeTab === tab ? "white" : t.text,
  });

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
          <h1 style={{ fontSize: 32, fontWeight: 900, margin: 0, color: t.text }}>Admin Panel</h1>
          <span style={{ background: "#fef3c7", color: "#92400e", fontSize: 12, fontWeight: 800, padding: "3px 10px", borderRadius: 20, textTransform: "uppercase", letterSpacing: 0.5 }}>Admin Only</span>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginTop: 24, flexWrap: "wrap" }}>
          <button style={tabStyle("businesses")} onClick={() => setActiveTab("businesses")}>
            Businesses {pendingOnly && pendingBizCount > 0 && <span style={{ background: "#ef4444", color: "white", borderRadius: "50%", padding: "1px 6px", fontSize: 11, marginLeft: 6 }}>{pendingBizCount}</span>}
          </button>
          <button style={tabStyle("jobs")} onClick={() => setActiveTab("jobs")}>
            Jobs {pendingOnly && pendingJobCount > 0 && <span style={{ background: "#ef4444", color: "white", borderRadius: "50%", padding: "1px 6px", fontSize: 11, marginLeft: 6 }}>{pendingJobCount}</span>}
          </button>
          <button style={tabStyle("users")} onClick={() => setActiveTab("users")}>
            Users
          </button>
          <button style={tabStyle("flags")} onClick={() => setActiveTab("flags")}>
            Flags {unreviewedFlagCount > 0 && <span style={{ background: "#ef4444", color: "white", borderRadius: "50%", padding: "1px 6px", fontSize: 11, marginLeft: 6 }}>{unreviewedFlagCount}</span>}
          </button>
          <button style={tabStyle("tools")} onClick={() => setActiveTab("tools")}>
            Tools
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
                                <button style={actionBtn("#f59e0b")} disabled={actionLoading === biz.id} onClick={() => approveBusiness(biz.id, true)}>
                                  Feature
                                </button>
                              )}
                              {biz.is_featured && <span style={{ background: "#fef3c7", color: "#92400e", fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 20 }}>Featured</span>}
                            </>
                          ) : (
                            <>
                              <button style={actionBtn("#16a34a")} disabled={actionLoading === biz.id} onClick={() => approveBusiness(biz.id, false)}>
                                {actionLoading === biz.id ? "..." : "Approve"}
                              </button>
                              <button style={actionBtn("#f59e0b")} disabled={actionLoading === biz.id} onClick={() => approveBusiness(biz.id, true)}>
                                Approve + Feature
                              </button>
                            </>
                          )}
                          <button style={actionBtn("#ef4444")} disabled={actionLoading === biz.id} onClick={() => rejectBusiness(biz.id)}>
                            {actionLoading === biz.id ? "..." : "Delete"}
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
                        <button style={actionBtn("#16a34a")} disabled={actionLoading === job.id} onClick={() => approveJob(job.id)}>
                          {actionLoading === job.id ? "..." : "Approve"}
                        </button>
                      )}
                      <button style={actionBtn("#ef4444")} disabled={actionLoading === job.id} onClick={() => rejectJob(job.id)}>
                        {actionLoading === job.id ? "..." : "Delete"}
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
                        <span style={{ background: flag.content_type === "post" ? "#dbeafe" : "#fef9c3", color: flag.content_type === "post" ? "#1d4ed8" : "#854d0e", fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 20, textTransform: "uppercase" }}>
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
                        <button style={actionBtn("#6b7280")} disabled={actionLoading === flag.id} onClick={() => dismissFlag(flag.id)}>
                          {actionLoading === flag.id ? "..." : "Dismiss"}
                        </button>
                      )}
                      {flag.content_preview && (
                        <button style={actionBtn("#ef4444")} disabled={actionLoading === flag.id + "-remove"} onClick={() => removeFlaggedContent(flag)}>
                          {actionLoading === flag.id + "-remove" ? "..." : "Remove Content"}
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
                        {isVerified && <span style={{ background: "#dcfce7", color: "#15803d", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>Verified</span>}
                        {isPending && <span style={{ background: "#fef9c3", color: "#854d0e", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>Pending</span>}
                        {isDenied && <span style={{ background: "#fee2e2", color: "#b91c1c", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>Denied</span>}
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

                      {/* Admin toggle */}
                      <button
                        style={actionBtn(u.is_admin ? "#ef4444" : "#6366f1")}
                        disabled={actionLoading === u.user_id + "-admin"}
                        onClick={() => toggleAdmin(u.user_id, u.is_admin)}
                      >
                        {actionLoading === u.user_id + "-admin" ? "..." : u.is_admin ? "Remove Admin" : "Make Admin"}
                      </button>

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
        {/* ── TOOLS TAB ── */}
        {activeTab === "tools" && (
          <div style={{ marginTop: 20, display: "grid", gap: 16 }}>

            {/* Import Memorials */}
            <div style={{ border: `1px solid ${t.border}`, borderRadius: 14, padding: 24, background: t.surface }}>
              <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 6 }}>Import Memorials from EOD-WF</div>
              <div style={{ fontSize: 14, color: t.textMuted, marginBottom: 16, lineHeight: 1.6 }}>
                Scrapes <strong>eod-wf.org/category/virtual-memorial</strong> and imports each fallen soldier&apos;s
                name, death date, and memorial URL. Already-imported entries are skipped.
                This may take a minute — the scraper paginates all listing pages.
              </div>
              <button
                onClick={importMemorials}
                disabled={importingMemorials}
                style={{ background: importingMemorials ? t.badgeBg : "#7c3aed", color: importingMemorials ? t.textMuted : "white", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 800, fontSize: 14, cursor: importingMemorials ? "not-allowed" : "pointer", opacity: importingMemorials ? 0.7 : 1 }}
              >
                {importingMemorials ? "Importing... (this takes ~1–2 min)" : "Run Memorial Import"}
              </button>

              {importResult && (
                <div style={{ marginTop: 16, padding: 16, borderRadius: 10, background: t.bg, border: `1px solid ${t.border}` }}>
                  <div style={{ fontWeight: 800, marginBottom: 8 }}>
                    {importResult.errors.length === 0 && importResult.imported === 0 && importResult.skipped > 0
                      ? "All memorials already imported — nothing new."
                      : `Done: ${importResult.imported} imported, ${importResult.skipped} skipped (${importResult.total} total found)`
                    }
                  </div>
                  {importResult.errors.length > 0 && (
                    <div style={{ fontSize: 13, color: "#ef4444" }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>{importResult.errors.length} errors:</div>
                      {importResult.errors.map((e, i) => <div key={i} style={{ marginBottom: 2 }}>• {e}</div>)}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Add Memorial by URL */}
            <div style={{ border: `1px solid ${t.border}`, borderRadius: 14, padding: 24, background: t.surface }}>
              <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 6 }}>Add Memorial by URL</div>
              <div style={{ fontSize: 14, color: t.textMuted, marginBottom: 16, lineHeight: 1.6 }}>
                Paste a memorial URL and hit Fetch — name and date auto-fill from the page. Edit if needed, then save. Repeat for each entry.
              </div>

              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={memWizUrl}
                    onChange={(e) => setMemWizUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && fetchMemorialMeta()}
                    placeholder="https://eod-wf.org/virtual-memorial/army/..."
                    style={{ flex: 1, border: `1px solid ${t.inputBorder}`, borderRadius: 8, padding: "8px 12px", fontSize: 14, background: t.input, color: t.text }}
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

          </div>
        )}

      </div>
    </div>
  );
}
