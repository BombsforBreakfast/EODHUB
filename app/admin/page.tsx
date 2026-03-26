"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "../lib/lib/supabaseClient";
import NavBar from "../components/NavBar";

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

type Tab = "businesses" | "jobs" | "users" | "flags";

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
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [editingBiz, setEditingBiz] = useState<BizEdit | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
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
    const query = supabase
      .from("jobs")
      .select("id, created_at, title, company_name, location, category, description, apply_url, is_approved, source_type")
      .order("created_at", { ascending: false });
    const { data, error } = pendingOnly
      ? await query.neq("is_approved", true)
      : await query;
    if (error) { console.error(error); return; }
    setJobs((data ?? []) as Job[]);
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
    if (!confirm("Delete this listing permanently?")) return;
    setActionLoading(id);
    const { error } = await supabase.from("business_listings").delete().eq("id", id);
    if (error) { alert(error.message); } else { showToast("Listing removed."); await loadBusinesses(); }
    setActionLoading(null);
  }

  async function approveJob(id: string) {
    setActionLoading(id);
    const { error } = await supabase.from("jobs").update({ is_approved: true }).eq("id", id);
    if (error) { alert(error.message); } else { showToast("Job approved!"); await loadJobs(); }
    setActionLoading(null);
  }

  async function rejectJob(id: string) {
    if (!confirm("Delete this job permanently?")) return;
    setActionLoading(id);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`/api/admin/delete-job?id=${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error ?? "Delete failed");
    } else {
      showToast("Job removed.");
      setJobs((prev) => prev.filter((j) => j.id !== id));
    }
    setActionLoading(null);
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

  const tabStyle = (tab: Tab): React.CSSProperties => ({
    padding: "9px 20px",
    borderRadius: 10,
    border: "none",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    background: activeTab === tab ? "black" : "#f3f4f6",
    color: activeTab === tab ? "white" : "#333",
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
      <div style={{ width: "100%", maxWidth: 1800, margin: "0 auto", padding: "24px 20px", boxSizing: "border-box" }}>
        <NavBar />
        <div style={{ marginTop: 40, textAlign: "center", color: "#666" }}>Loading...</div>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div style={{ width: "100%", maxWidth: 1800, margin: "0 auto", padding: "24px 20px", boxSizing: "border-box" }}>
        <NavBar />
        <div style={{ marginTop: 60, textAlign: "center" }}>
          <div style={{ fontSize: 48 }}>🚫</div>
          <div style={{ fontSize: 22, fontWeight: 900, marginTop: 12 }}>Access Denied</div>
          <div style={{ color: "#666", marginTop: 8 }}>You don&apos;t have admin privileges.</div>
        </div>
      </div>
    );
  }

  const pendingBizCount = businesses.filter((b) => !b.is_approved).length;
  const pendingJobCount = jobs.filter((j) => !j.is_approved).length;
  const unreviewedFlagCount = flags.filter((f) => !f.reviewed).length;

  return (
    <div style={{ width: "100%", maxWidth: 1800, margin: "0 auto", padding: "24px 20px", boxSizing: "border-box" }}>
      <NavBar />

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, background: "#111", color: "white", padding: "12px 20px", borderRadius: 12, fontWeight: 700, fontSize: 14, zIndex: 9999, boxShadow: "0 4px 20px rgba(0,0,0,0.2)" }}>
          ✓ {toast}
        </div>
      )}

      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 20, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 32, fontWeight: 900, margin: 0 }}>Admin Panel</h1>
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

          <label style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", color: "#555" }}>
            <input type="checkbox" checked={pendingOnly} onChange={(e) => setPendingOnly(e.target.checked)} style={{ width: 16, height: 16, cursor: "pointer" }} />
            Pending only
          </label>
        </div>

        {/* ── BUSINESSES TAB ── */}
        {activeTab === "businesses" && (
          <div style={{ marginTop: 20 }}>
            {businesses.length === 0 && (
              <div style={{ padding: 32, textAlign: "center", color: "#888", border: "1px solid #e5e7eb", borderRadius: 14, background: "white" }}>
                {pendingOnly ? "No pending business submissions." : "No business listings found."}
              </div>
            )}
            <div style={{ display: "grid", gap: 14 }}>
              {businesses.map((biz) => (
                <div key={biz.id} style={{ border: "1px solid #e5e7eb", borderRadius: 14, background: "white", overflow: "hidden" }}>
                  <div style={{ display: "flex", gap: 0 }}>
                    {biz.og_image && (
                      <img src={biz.og_image} alt="" style={{ width: 140, height: 110, objectFit: "cover", flexShrink: 0 }} />
                    )}
                    <div style={{ padding: 16, flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                        <div>
                          <div style={{ fontWeight: 900, fontSize: 17 }}>{biz.business_name || biz.og_title || biz.og_site_name || "Unnamed"}</div>
                          <a href={biz.website_url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: "#1d4ed8", wordBreak: "break-all" }}>{biz.website_url}</a>
                          {biz.custom_blurb && <div style={{ marginTop: 6, fontSize: 14, color: "#555", lineHeight: 1.5 }}>{biz.custom_blurb}</div>}
                          {biz.og_description && !biz.custom_blurb && <div style={{ marginTop: 6, fontSize: 13, color: "#777", lineHeight: 1.5 }}>{biz.og_description}</div>}
                          <div style={{ marginTop: 6, fontSize: 12, color: "#999" }}>{new Date(biz.created_at).toLocaleDateString()}</div>
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
                              <button style={actionBtn("#ef4444")} disabled={actionLoading === biz.id} onClick={() => rejectBusiness(biz.id)}>
                                Reject
                              </button>
                            </>
                          )}
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
                    <div style={{ borderTop: "1px solid #e5e7eb", padding: 16, background: "#f9fafb", display: "grid", gap: 10 }}>
                      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 2 }}>Edit Listing</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div>
                          <label style={{ fontSize: 12, fontWeight: 700, color: "#555", display: "block", marginBottom: 4 }}>Business Name</label>
                          <input
                            value={editingBiz.business_name}
                            onChange={(e) => setEditingBiz({ ...editingBiz, business_name: e.target.value })}
                            style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, boxSizing: "border-box" }}
                            placeholder="Business Name"
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 12, fontWeight: 700, color: "#555", display: "block", marginBottom: 4 }}>OG Title</label>
                          <input
                            value={editingBiz.og_title}
                            onChange={(e) => setEditingBiz({ ...editingBiz, og_title: e.target.value })}
                            style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, boxSizing: "border-box" }}
                            placeholder="Page title from website"
                          />
                        </div>
                      </div>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 700, color: "#555", display: "block", marginBottom: 4 }}>Description / Blurb</label>
                        <textarea
                          value={editingBiz.custom_blurb || editingBiz.og_description}
                          onChange={(e) => setEditingBiz({ ...editingBiz, custom_blurb: e.target.value })}
                          rows={3}
                          style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, resize: "vertical", boxSizing: "border-box" }}
                          placeholder="Custom description shown on the listing"
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 700, color: "#555", display: "block", marginBottom: 4 }}>Photo</label>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          {editingBiz.og_image && (
                            <img src={editingBiz.og_image} alt="" style={{ width: 80, height: 60, objectFit: "cover", borderRadius: 6, border: "1px solid #e5e7eb" }} />
                          )}
                          <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 6 }}>
                            <input
                              value={editingBiz.og_image}
                              onChange={(e) => setEditingBiz({ ...editingBiz, og_image: e.target.value })}
                              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, boxSizing: "border-box" }}
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
            {jobs.length === 0 && (
              <div style={{ padding: 32, textAlign: "center", color: "#888", border: "1px solid #e5e7eb", borderRadius: 14, background: "white" }}>
                {pendingOnly ? "No pending job submissions." : "No jobs found."}
              </div>
            )}
            <div style={{ display: "grid", gap: 14 }}>
              {jobs.map((job) => (
                <div key={job.id} style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 16, background: "white" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 900, fontSize: 17 }}>{job.title || "Untitled Job"}</div>
                      <div style={{ marginTop: 4, fontSize: 14, color: "#444" }}>{job.company_name || "Unknown company"}</div>
                      <div style={{ marginTop: 2, fontSize: 13, color: "#666" }}>{[job.location, job.category].filter(Boolean).join(" · ")}</div>
                      {job.description && (
                        <div style={{ marginTop: 8, fontSize: 13, color: "#666", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>
                          {job.description}
                        </div>
                      )}
                      <div style={{ marginTop: 6, fontSize: 12, color: "#999", display: "flex", gap: 12, flexWrap: "wrap" }}>
                        {job.apply_url && <a href={job.apply_url} target="_blank" rel="noreferrer" style={{ color: "#1d4ed8" }}>View posting ↗</a>}
                        <span>{job.created_at ? new Date(job.created_at).toLocaleDateString() : ""}</span>
                        <span style={{ background: "#f3f4f6", borderRadius: 20, padding: "1px 8px" }}>{job.source_type || "community"}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
                      {job.is_approved ? (
                        <>
                          <span style={{ background: "#dcfce7", color: "#15803d", fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 20 }}>Live</span>
                          <button style={actionBtn("#ef4444")} disabled={actionLoading === job.id} onClick={() => rejectJob(job.id)}>
                            {actionLoading === job.id ? "..." : "Delete"}
                          </button>
                        </>
                      ) : (
                        <>
                          <button style={actionBtn("#16a34a")} disabled={actionLoading === job.id} onClick={() => approveJob(job.id)}>
                            {actionLoading === job.id ? "..." : "Approve"}
                          </button>
                          <button style={actionBtn("#ef4444")} disabled={actionLoading === job.id} onClick={() => rejectJob(job.id)}>
                            Reject
                          </button>
                        </>
                      )}
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
              <div style={{ padding: 32, textAlign: "center", color: "#888", border: "1px solid #e5e7eb", borderRadius: 14, background: "white" }}>
                No flags yet.
              </div>
            )}
            <div style={{ display: "grid", gap: 12 }}>
              {flags.map((flag) => (
                <div key={flag.id} style={{ border: `1px solid ${flag.reviewed ? "#e5e7eb" : "#fca5a5"}`, borderRadius: 14, padding: 16, background: flag.reviewed ? "white" : "#fff5f5" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                        <span style={{ background: flag.content_type === "post" ? "#dbeafe" : "#fef9c3", color: flag.content_type === "post" ? "#1d4ed8" : "#854d0e", fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 20, textTransform: "uppercase" }}>
                          {flag.content_type}
                        </span>
                        {flag.reviewed && <span style={{ background: "#f3f4f6", color: "#666", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>Reviewed</span>}
                        <span style={{ fontSize: 12, color: "#999" }}>{new Date(flag.created_at).toLocaleString()}</span>
                      </div>
                      {flag.reporter_name && (
                        <div style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>Flagged by: <strong>{flag.reporter_name}</strong></div>
                      )}
                      {flag.content_preview && (
                        <div style={{ fontSize: 14, color: "#333", lineHeight: 1.5, background: "#f9fafb", borderRadius: 8, padding: "8px 12px", marginTop: 6, display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>
                          {flag.content_preview}
                        </div>
                      )}
                      {!flag.content_preview && (
                        <div style={{ fontSize: 13, color: "#999", fontStyle: "italic" }}>Content may have been deleted already.</div>
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
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
              <button onClick={loadUsers} style={actionBtn("#374151")}>↻ Refresh</button>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {users.map((u) => {
                const name = u.display_name || `${u.first_name || ""} ${u.last_name || ""}`.trim() || "Unnamed User";
                const isVerified = u.verification_status === "verified";
                const isPending = u.verification_status === "pending";
                const isDenied = u.verification_status === "denied";
                return (
                  <div key={u.user_id} style={{ border: `1px solid ${isDenied ? "#fca5a5" : "#e5e7eb"}`, borderRadius: 12, padding: "12px 16px", background: isDenied ? "#fff5f5" : "white", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 800, fontSize: 15 }}>{name}</span>
                        {u.is_admin && <span style={{ background: "#fef3c7", color: "#92400e", fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 20 }}>ADMIN</span>}
                        {isVerified && <span style={{ background: "#dcfce7", color: "#15803d", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>Verified</span>}
                        {isPending && <span style={{ background: "#fef9c3", color: "#854d0e", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>Pending</span>}
                        {isDenied && <span style={{ background: "#fee2e2", color: "#b91c1c", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>Denied</span>}
                      </div>
                      <div style={{ fontSize: 13, color: "#666", marginTop: 3 }}>
                        {[u.role, u.service].filter(Boolean).join(" · ")}
                        {u.email && <span style={{ color: "#9ca3af", marginLeft: u.role || u.service ? 6 : 0 }}>{u.role || u.service ? "· " : ""}{u.email}</span>}
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
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
