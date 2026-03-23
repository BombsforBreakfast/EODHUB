"use client";

import { useEffect, useState } from "react";
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
  role: string | null;
  service: string | null;
  verification_status: string | null;
  is_admin: boolean | null;
  created_at: string | null;
};

type Tab = "businesses" | "jobs" | "users";

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("businesses");

  const [businesses, setBusinesses] = useState<BusinessListing[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);

  const [pendingOnly, setPendingOnly] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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
      ? await query.eq("is_approved", false)
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
      ? await query.eq("is_approved", false)
      : await query;
    if (error) { console.error(error); return; }
    setJobs((data ?? []) as Job[]);
  }

  async function loadUsers() {
    const { data, error } = await supabase
      .from("profiles")
      .select("user_id, first_name, last_name, display_name, role, service, verification_status, is_admin, created_at")
      .order("created_at", { ascending: false });
    if (error) { console.error(error); return; }
    setUsers((data ?? []) as UserProfile[]);
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
      await Promise.all([loadBusinesses(), loadJobs(), loadUsers()]);
      setLoading(false);
    }
    init();
  }, []);

  useEffect(() => {
    if (!authorized) return;
    if (activeTab === "businesses") loadBusinesses();
    if (activeTab === "jobs") loadJobs();
    if (activeTab === "users") loadUsers();
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
    const { error } = await supabase.from("jobs").delete().eq("id", id);
    if (error) { alert(error.message); } else { showToast("Job removed."); await loadJobs(); }
    setActionLoading(null);
  }

  async function setVerification(userId: string, status: string) {
    setActionLoading(userId + "-verify");
    const { error } = await supabase.from("profiles").update({ verification_status: status }).eq("user_id", userId);
    if (error) { alert(error.message); } else { showToast(`Verification set to "${status}"`); await loadUsers(); }
    setActionLoading(null);
  }

  async function toggleAdmin(userId: string, current: boolean | null) {
    if (!confirm(`${current ? "Remove" : "Grant"} admin access for this user?`)) return;
    setActionLoading(userId + "-admin");
    const { error } = await supabase.from("profiles").update({ is_admin: !current }).eq("user_id", userId);
    if (error) { alert(error.message); } else { showToast(current ? "Admin removed." : "Admin granted!"); await loadUsers(); }
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
                        </div>
                      </div>
                    </div>
                  </div>
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
                        <span style={{ background: "#dcfce7", color: "#15803d", fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 20 }}>Live</span>
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

        {/* ── USERS TAB ── */}
        {activeTab === "users" && (
          <div style={{ marginTop: 20 }}>
            <div style={{ display: "grid", gap: 10 }}>
              {users.map((u) => {
                const name = u.display_name || `${u.first_name || ""} ${u.last_name || ""}`.trim() || "Unnamed User";
                const isVerified = u.verification_status === "verified";
                const isPending = u.verification_status === "pending";
                return (
                  <div key={u.user_id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: "12px 16px", background: "white", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 800, fontSize: 15 }}>{name}</span>
                        {u.is_admin && <span style={{ background: "#fef3c7", color: "#92400e", fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 20 }}>ADMIN</span>}
                        {isVerified && <span style={{ background: "#dcfce7", color: "#15803d", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>Verified</span>}
                        {isPending && <span style={{ background: "#fef9c3", color: "#854d0e", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>Pending</span>}
                      </div>
                      <div style={{ fontSize: 13, color: "#666", marginTop: 3 }}>
                        {[u.role, u.service].filter(Boolean).join(" · ")}
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
