"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "../lib/lib/supabaseClient";
import NavBar from "../components/NavBar";

const SERVICE_OPTIONS = ["Army", "Navy", "Marines", "Air Force", "Civilian Bomb Tech"];
const STATUS_OPTIONS = ["Active", "Former", "Retired", "Civil Service"];
const SKILL_BADGE_OPTIONS = ["Basic", "Senior", "Master", "Civil Service"];
const YEARS_OPTIONS = [...Array.from({ length: 39 }, (_, i) => String(i + 1)), "40+"];

type Profile = {
  user_id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  bio: string | null;
  photo_url: string | null;
  role: string | null;
  service: string | null;
  status: string | null;
  years_experience: string | null;
  skill_badge: string | null;
  is_admin: boolean | null;
  seeking_employment: boolean | null;
};

type SavedJob = {
  id: string;
  job_id: string;
  title: string | null;
  company_name: string | null;
  location: string | null;
  category: string | null;
  apply_url: string | null;
  created_at: string | null;
};

type SavedEvent = {
  id: string;
  event_id: string;
  title: string | null;
  organization: string | null;
  date: string | null;
  description: string | null;
  signup_url: string | null;
};

export default function MyAccountPage() {
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editRole, setEditRole] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editService, setEditService] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editYearsExp, setEditYearsExp] = useState("");
  const [editSkillBadge, setEditSkillBadge] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [seekingEmployment, setSeekingEmployment] = useState(false);
  const [togglingSeek, setTogglingSeek] = useState(false);

  const [savedJobs, setSavedJobs] = useState<SavedJob[]>([]);
  const [unsavingJobId, setUnsavingJobId] = useState<string | null>(null);
  const [savedEvents, setSavedEvents] = useState<SavedEvent[]>([]);
  const [unsavingEventId, setUnsavingEventId] = useState<string | null>(null);

  async function loadSavedJobs(userId: string) {
    const { data, error } = await supabase
      .from("saved_jobs")
      .select("id, job_id, jobs(title, company_name, location, category, apply_url, created_at)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Saved jobs load error:", error);
      return;
    }

    type RawRow = {
      id: string;
      job_id: string;
      jobs: { title: string | null; company_name: string | null; location: string | null; category: string | null; apply_url: string | null; created_at: string | null } | { title: string | null; company_name: string | null; location: string | null; category: string | null; apply_url: string | null; created_at: string | null }[] | null;
    };

    const rows = (data ?? []) as unknown as RawRow[];

    setSavedJobs(
      rows.map((r) => {
        const job = Array.isArray(r.jobs) ? r.jobs[0] ?? null : r.jobs;
        return {
          id: r.id,
          job_id: r.job_id,
          title: job?.title ?? null,
          company_name: job?.company_name ?? null,
          location: job?.location ?? null,
          category: job?.category ?? null,
          apply_url: job?.apply_url ?? null,
          created_at: job?.created_at ?? null,
        };
      })
    );
  }

  async function unsaveJob(savedJobRowId: string) {
    try {
      setUnsavingJobId(savedJobRowId);
      await supabase.from("saved_jobs").delete().eq("id", savedJobRowId);
      setSavedJobs((prev) => prev.filter((j) => j.id !== savedJobRowId));
    } catch (err) {
      console.error("Unsave job error:", err);
    } finally {
      setUnsavingJobId(null);
    }
  }

  async function loadSavedEvents(userId: string) {
    const { data, error } = await supabase
      .from("saved_events")
      .select("id, event_id, events(title, organization, date, description, signup_url)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) { console.error("Saved events load error:", error); return; }

    type RawRow = {
      id: string;
      event_id: string;
      events: { title: string | null; organization: string | null; date: string | null; description: string | null; signup_url: string | null } | { title: string | null; organization: string | null; date: string | null; description: string | null; signup_url: string | null }[] | null;
    };

    const rows = (data ?? []) as unknown as RawRow[];
    setSavedEvents(rows.map((r) => {
      const ev = Array.isArray(r.events) ? r.events[0] ?? null : r.events;
      return {
        id: r.id,
        event_id: r.event_id,
        title: ev?.title ?? null,
        organization: ev?.organization ?? null,
        date: ev?.date ?? null,
        description: ev?.description ?? null,
        signup_url: ev?.signup_url ?? null,
      };
    }));
  }

  async function unsaveEvent(savedEventRowId: string) {
    try {
      setUnsavingEventId(savedEventRowId);
      await supabase.from("saved_events").delete().eq("id", savedEventRowId);
      setSavedEvents((prev) => prev.filter((e) => e.id !== savedEventRowId));
    } finally {
      setUnsavingEventId(null);
    }
  }

  async function loadProfile(userId: string) {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("Error loading profile:", error);
      return;
    }

    const p = (data as Profile | null) ?? null;
    setProfile(p);
    setSeekingEmployment(p?.seeking_employment ?? false);
  }

  function openEdit() {
    setEditRole(profile?.role ?? "");
    setEditBio(profile?.bio ?? "");
    setEditService(profile?.service ?? "");
    setEditStatus(profile?.status ?? "");
    setEditYearsExp(profile?.years_experience ?? "");
    setEditSkillBadge(profile?.skill_badge ?? "");
    setEditing(true);
  }

  async function handleSaveProfile() {
    if (!currentUserId) return;
    try {
      setSavingProfile(true);
      const { error } = await supabase
        .from("profiles")
        .update({
          role: editRole || null,
          bio: editBio || null,
          service: editService || null,
          status: editStatus || null,
          years_experience: editYearsExp || null,
          skill_badge: editSkillBadge || null,
        })
        .eq("user_id", currentUserId);
      if (error) { alert(error.message); return; }
      await loadProfile(currentUserId);
      setEditing(false);
    } finally {
      setSavingProfile(false);
    }
  }

  async function toggleSeekingEmployment() {
    if (!currentUserId || togglingSeek) return;
    const next = !seekingEmployment;
    setSeekingEmployment(next);
    setTogglingSeek(true);
    const { error } = await supabase
      .from("profiles")
      .update({ seeking_employment: next })
      .eq("user_id", currentUserId);
    if (error) setSeekingEmployment(!next); // revert on failure
    setTogglingSeek(false);
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!currentUserId) return;

    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingAvatar(true);

      const filePath = `${currentUserId}/${Date.now()}-avatar-${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from("profile-photos")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from("profile-photos")
        .getPublicUrl(filePath);

      const publicUrl = data.publicUrl;

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ photo_url: publicUrl })
        .eq("user_id", currentUserId);

      if (updateError) throw updateError;

      await loadProfile(currentUserId);
    } catch (err) {
      console.error(err);
      alert("Avatar upload failed");
    } finally {
      setUploadingAvatar(false);
      e.target.value = "";
    }
  }

  useEffect(() => {
    async function init() {
      const { data, error } = await supabase.auth.getUser();

      if (error) {
        console.error("Auth error:", error);
        setLoading(false);
        return;
      }

      const userId = data.user?.id ?? null;

      if (!userId) {
        window.location.href = "/login";
        return;
      }

      setCurrentUserId(userId);
      await Promise.all([loadProfile(userId), loadSavedJobs(userId), loadSavedEvents(userId)]);
      setLoading(false);
    }

    init();
  }, []);

  const skeletonBase: React.CSSProperties = {
    background: "linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)",
    backgroundSize: "200% 100%",
    borderRadius: 8,
  };

  const fullName =
    profile?.display_name ||
    `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() ||
    "User";

  return (
    <div style={{ width: "100%", maxWidth: 1800, margin: "0 auto", padding: "24px 20px", boxSizing: "border-box" as const }}>
      <NavBar />

      <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <h1 style={{ fontSize: 32, fontWeight: 900, marginTop: 20 }}>My Account</h1>

      <div style={{ marginTop: 24, border: "1px solid #e5e7eb", borderRadius: 16, padding: 24, background: "white" }}>
        {loading ? (
          <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
            <div style={{ ...skeletonBase, width: 120, height: 120, borderRadius: "50%", flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ ...skeletonBase, height: 28, width: "40%", marginBottom: 10 }} />
              <div style={{ ...skeletonBase, height: 14, width: "25%", marginBottom: 16 }} />
              <div style={{ display: "flex", gap: 8 }}>
                {[80,100,90].map((w,i) => <div key={i} style={{ ...skeletonBase, height: 30, width: w }} />)}
              </div>
            </div>
          </div>
        ) : (
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
          {/* Avatar */}
          <div style={{ width: 120, height: 120, borderRadius: "50%", overflow: "hidden", background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", color: "#666", fontWeight: 700, flexShrink: 0 }}>
            {profile?.photo_url ? (
              <img src={profile.photo_url} alt={fullName} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            ) : "Photo"}
          </div>

          {/* Info + actions */}
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
              <div>
                <div style={{ fontSize: 28, fontWeight: 900 }}>{fullName}</div>
                <div style={{ marginTop: 4, color: "#666" }}>{profile?.role || "No role added yet"}</div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <label style={{ display: "inline-block", background: "white", color: "black", border: "1px solid #ccc", padding: "8px 16px", borderRadius: 10, fontWeight: 700, cursor: uploadingAvatar ? "not-allowed" : "pointer", opacity: uploadingAvatar ? 0.6 : 1 }}>
                  {uploadingAvatar ? "Uploading..." : "Update Photo"}
                  <input type="file" accept="image/*" onChange={handleAvatarUpload} style={{ display: "none" }} />
                </label>
                <button
                  onClick={openEdit}
                  style={{ background: "white", border: "1px solid #ccc", borderRadius: 10, padding: "8px 16px", fontWeight: 700, cursor: "pointer" }}
                >
                  Edit Profile
                </button>
                {profile?.is_admin && (
                  <a
                    href="/admin"
                    style={{ display: "inline-block", background: "black", color: "white", border: "none", borderRadius: 10, padding: "8px 16px", fontWeight: 700, cursor: "pointer", textDecoration: "none", fontSize: 14 }}
                  >
                    Admin Panel
                  </a>
                )}
              </div>
            </div>

            {/* Profile detail pills */}
            <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 8 }}>
              {profile?.service && (
                <span style={{ background: "#f3f4f6", borderRadius: 20, padding: "4px 12px", fontSize: 13, fontWeight: 700 }}>{profile.service}</span>
              )}
              {profile?.status && (
                <span style={{ background: "#f3f4f6", borderRadius: 20, padding: "4px 12px", fontSize: 13, fontWeight: 700 }}>{profile.status}</span>
              )}
              {profile?.skill_badge && (
                <span style={{ background: "#f3f4f6", borderRadius: 20, padding: "4px 12px", fontSize: 13, fontWeight: 700 }}>{profile.skill_badge} Badge</span>
              )}
              {profile?.years_experience && (
                <span style={{ background: "#f3f4f6", borderRadius: 20, padding: "4px 12px", fontSize: 13, fontWeight: 700 }}>{profile.years_experience} yrs exp</span>
              )}
            </div>

            {profile?.bio && (
              <div style={{ marginTop: 12, color: "#444", lineHeight: 1.6 }}>{profile.bio}</div>
            )}

          </div>
        </div>
        )}
      </div>

      {/* Seeking Employment Toggle */}
      {!loading && (
        <div style={{ marginTop: 16, border: "1px solid #e5e7eb", borderRadius: 16, padding: "18px 24px", background: "white", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>Open to Opportunities</div>
            <div style={{ fontSize: 13, color: "#666", marginTop: 3, lineHeight: 1.5 }}>
              Only visible to verified employer accounts — never shown to other members or publicly.
            </div>
          </div>
          <button
            onClick={toggleSeekingEmployment}
            disabled={togglingSeek}
            style={{
              width: 52, height: 28, borderRadius: 14, border: "none", cursor: "pointer", flexShrink: 0,
              background: seekingEmployment ? "#16a34a" : "#d1d5db",
              position: "relative", transition: "background 0.2s", padding: 0,
            }}
            aria-label="Toggle seeking employment"
          >
            <span style={{
              position: "absolute", top: 3, left: seekingEmployment ? 27 : 3,
              width: 22, height: 22, borderRadius: "50%", background: "white",
              boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transition: "left 0.2s",
              display: "block",
            }} />
          </button>
        </div>
      )}

      {/* Edit Profile Form */}
      {editing && (
        <div style={{ marginTop: 16, border: "1px solid #e5e7eb", borderRadius: 16, padding: 24, background: "white" }}>
          <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 16 }}>Edit Profile</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={{ fontWeight: 700, display: "block", marginBottom: 5 }}>Role / Job Title</label>
              <input value={editRole} onChange={(e) => setEditRole(e.target.value)} placeholder="e.g. EOD Tech" style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ccc", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontWeight: 700, display: "block", marginBottom: 5 }}>Service Branch</label>
              <select value={editService} onChange={(e) => setEditService(e.target.value)} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ccc", background: "white" }}>
                <option value="">Select service...</option>
                {SERVICE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontWeight: 700, display: "block", marginBottom: 5 }}>Status</label>
              <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ccc", background: "white" }}>
                <option value="">Select status...</option>
                {STATUS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontWeight: 700, display: "block", marginBottom: 5 }}>Skill Badge</label>
              <select value={editSkillBadge} onChange={(e) => setEditSkillBadge(e.target.value)} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ccc", background: "white" }}>
                <option value="">Select badge...</option>
                {SKILL_BADGE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontWeight: 700, display: "block", marginBottom: 5 }}>Years of Experience</label>
              <select value={editYearsExp} onChange={(e) => setEditYearsExp(e.target.value)} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ccc", background: "white" }}>
                <option value="">Select years...</option>
                {YEARS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontWeight: 700, display: "block", marginBottom: 5 }}>Bio</label>
              <textarea value={editBio} onChange={(e) => setEditBio(e.target.value)} placeholder="Tell people about yourself..." rows={4} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ccc", resize: "vertical", boxSizing: "border-box", fontSize: 14, fontFamily: "inherit" }} />
            </div>
          </div>
          <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
            <button onClick={handleSaveProfile} disabled={savingProfile} style={{ background: "black", color: "white", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 700, cursor: savingProfile ? "not-allowed" : "pointer", opacity: savingProfile ? 0.7 : 1 }}>
              {savingProfile ? "Saving..." : "Save Changes"}
            </button>
            <button onClick={() => setEditing(false)} style={{ background: "white", border: "1px solid #ccc", borderRadius: 10, padding: "10px 20px", fontWeight: 700, cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Saved Jobs */}
      <div
        style={{
          marginTop: 24,
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          padding: 24,
          background: "white",
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 16 }}>Saved Jobs</div>

        {savedJobs.length === 0 ? (
          <div style={{ color: "#666" }}>No saved jobs yet. Save jobs from the feed to see them here.</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {savedJobs.map((job) => (
              <div
                key={job.id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 12,
                  padding: 16,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>
                    {job.title || "Untitled Job"}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 14, color: "#444" }}>
                    {job.company_name || "Unknown Company"}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 13, color: "#666" }}>
                    {[job.location, job.category].filter(Boolean).join(" • ")}
                  </div>
                  {job.apply_url && (
                    <a
                      href={job.apply_url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ display: "inline-block", marginTop: 10, fontWeight: 700, fontSize: 14 }}
                    >
                      View Job
                    </a>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => unsaveJob(job.id)}
                  disabled={unsavingJobId === job.id}
                  style={{
                    background: "transparent",
                    border: "1px solid #d1d5db",
                    borderRadius: 8,
                    padding: "6px 12px",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: unsavingJobId === job.id ? "not-allowed" : "pointer",
                    opacity: unsavingJobId === job.id ? 0.6 : 1,
                    flexShrink: 0,
                    color: "#555",
                  }}
                >
                  {unsavingJobId === job.id ? "Removing..." : "Remove"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Saved Events */}
      <div style={{ marginTop: 24, border: "1px solid #e5e7eb", borderRadius: 16, padding: 24, background: "white" }}>
        <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 16 }}>Saved Events</div>

        {savedEvents.length === 0 ? (
          <div style={{ color: "#666" }}>No saved events yet. Save events from the Events calendar to see them here.</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {savedEvents.map((ev) => (
              <div key={ev.id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{ev.title || "Untitled Event"}</div>
                  {ev.organization && <div style={{ marginTop: 4, fontSize: 14, color: "#444" }}>{ev.organization}</div>}
                  {ev.date && (
                    <div style={{ marginTop: 4, fontSize: 13, color: "#666" }}>
                      {new Date(ev.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric" })}
                    </div>
                  )}
                  {ev.description && <div style={{ marginTop: 6, fontSize: 13, color: "#555", lineHeight: 1.5 }}>{ev.description}</div>}
                  {ev.signup_url && (
                    <a href={ev.signup_url} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 10, fontWeight: 700, fontSize: 14 }}>
                      View / Sign Up →
                    </a>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => unsaveEvent(ev.id)}
                  disabled={unsavingEventId === ev.id}
                  style={{ background: "transparent", border: "1px solid #d1d5db", borderRadius: 8, padding: "6px 12px", fontSize: 13, fontWeight: 700, cursor: unsavingEventId === ev.id ? "not-allowed" : "pointer", opacity: unsavingEventId === ev.id ? 0.6 : 1, flexShrink: 0, color: "#555" }}
                >
                  {unsavingEventId === ev.id ? "Removing..." : "Remove"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}