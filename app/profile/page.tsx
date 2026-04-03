"use client";

import React, { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/lib/supabaseClient";
import NavBar from "../components/NavBar";
import { useTheme } from "../lib/ThemeContext";

function BillingCard({ subscriptionStatus }: { subscriptionStatus: string | null }) {
  const { t } = useTheme();
  const [loading, setLoading] = useState(false);
  const isActive = subscriptionStatus === "active" || subscriptionStatus === "trialing";

  async function handleSubscribe() {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      const json = await res.json();
      if (json.url) window.location.href = json.url;
      else alert(json.error ?? "Something went wrong.");
    } finally { setLoading(false); }
  }

  async function handlePortal() {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      const json = await res.json();
      if (json.url) window.location.href = json.url;
      else alert(json.error ?? "Something went wrong.");
    } finally { setLoading(false); }
  }

  const statusLabel: Record<string, string> = {
    active: "Active",
    trialing: "Trial",
    past_due: "Past Due",
    cancelled: "Cancelled",
  };
  const statusColor: Record<string, string> = {
    active: "#16a34a",
    trialing: "#2563eb",
    past_due: "#dc2626",
    cancelled: "#6b7280",
  };
  const label = subscriptionStatus ? (statusLabel[subscriptionStatus] ?? subscriptionStatus) : "No subscription";
  const color = subscriptionStatus ? (statusColor[subscriptionStatus] ?? "#6b7280") : "#6b7280";

  return (
    <div style={{ border: `1px solid ${t.border}`, borderRadius: 16, padding: "18px 24px", background: t.surface, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: t.text }}>Membership</div>
        <div style={{ fontSize: 13, color: t.textMuted, marginTop: 3 }}>
          $2/month · <span style={{ fontWeight: 700, color }}>{label}</span>
        </div>
      </div>
      {isActive ? (
        <button
          onClick={handlePortal}
          disabled={loading}
          style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10, padding: "8px 18px", fontWeight: 700, fontSize: 14, cursor: loading ? "not-allowed" : "pointer", color: t.text, opacity: loading ? 0.6 : 1, display: "flex", alignItems: "center", gap: 6 }}
        >
          {loading && <span className="btn-spinner btn-spinner-dark" />}
          Manage Billing
        </button>
      ) : (
        <button
          onClick={handleSubscribe}
          disabled={loading}
          style={{ background: "#111", color: "white", border: "none", borderRadius: 10, padding: "8px 18px", fontWeight: 700, fontSize: 14, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1, display: "flex", alignItems: "center", gap: 6 }}
        >
          {loading && <span className="btn-spinner" />}
          Subscribe — $2/mo
        </button>
      )}
    </div>
  );
}

const SERVICE_OPTIONS = ["Army", "Navy", "Marines", "Air Force", "Civil Service", "Federal", "Civilian Bomb Tech"];
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
  account_type: string | null;
  subscription_status: string | null;
  is_employer: boolean | null;
  employer_verified: boolean | null;
  company_website: string | null;
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
  const [editCompanyWebsite, setEditCompanyWebsite] = useState("");
  const [employerJobs, setEmployerJobs] = useState<{ id: string; title: string | null; company_name: string | null; is_approved: boolean | null; created_at: string | null; saveCount: number }[]>([]);

  const [seekingEmployment, setSeekingEmployment] = useState(false);
  const [togglingSeek, setTogglingSeek] = useState(false);

  const photoInputRef = useRef<HTMLInputElement>(null);

  const [savedJobs, setSavedJobs] = useState<SavedJob[]>([]);
  const [unsavingJobId, setUnsavingJobId] = useState<string | null>(null);
  const [savedEvents, setSavedEvents] = useState<SavedEvent[]>([]);
  const [unsavingEventId, setUnsavingEventId] = useState<string | null>(null);
  const [myUnits, setMyUnits] = useState<{ id: string; name: string; slug: string; type: string; cover_photo_url: string | null; my_role?: string }[]>([]);

  async function loadMyUnits(userId: string) {
    const { data } = await supabase
      .from("unit_members")
      .select("role, units(id, name, slug, type, cover_photo_url)")
      .eq("user_id", userId)
      .eq("status", "approved");
    if (data) {
      type UnitRow = { id: string; name: string; slug: string; type: string; cover_photo_url: string | null };
      const rows = data as unknown as { role: string; units: UnitRow | null }[];
      setMyUnits(
        rows
          .filter((r) => r.units !== null)
          .map((r) => ({ ...r.units!, my_role: r.role }))
      );
    }
  }

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
    if (p?.is_employer) loadEmployerJobs(userId);
  }

  async function loadEmployerJobs(userId: string) {
    const { data: jobData } = await supabase
      .from("jobs")
      .select("id, title, company_name, is_approved, created_at")
      .eq("user_id", userId)
      .eq("source_type", "community")
      .order("created_at", { ascending: false });
    const jobs = (jobData ?? []) as { id: string; title: string | null; company_name: string | null; is_approved: boolean | null; created_at: string | null }[];
    if (jobs.length === 0) { setEmployerJobs([]); return; }
    const { data: saves } = await supabase
      .from("saved_jobs")
      .select("job_id")
      .in("job_id", jobs.map((j) => j.id));
    const saveCounts = new Map<string, number>();
    ((saves ?? []) as { job_id: string }[]).forEach((s) => saveCounts.set(s.job_id, (saveCounts.get(s.job_id) ?? 0) + 1));
    setEmployerJobs(jobs.map((j) => ({ ...j, saveCount: saveCounts.get(j.id) ?? 0 })));
  }

  function openEdit() {
    setEditRole(profile?.role ?? "");
    setEditBio(profile?.bio ?? "");
    setEditService(profile?.service ?? "");
    setEditStatus(profile?.status ?? "");
    setEditYearsExp(profile?.years_experience ?? "");
    setEditSkillBadge(profile?.skill_badge ?? "");
    setEditCompanyWebsite(profile?.company_website ?? "");
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
          company_website: editCompanyWebsite || null,
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

    if (!file.type.startsWith("image/")) {
      alert("Only image files are allowed for profile photos.");
      e.target.value = "";
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      alert("Photo must be under 8 MB. Try compressing the image first.");
      e.target.value = "";
      return;
    }

    try {
      setUploadingAvatar(true);

      const safeName = `${Date.now()}-avatar-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const filePath = `${currentUserId}/${safeName}`;

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
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Photo upload failed: ${msg}`);
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
      await Promise.all([loadProfile(userId), loadSavedJobs(userId), loadSavedEvents(userId), loadMyUnits(userId)]);
      setLoading(false);
    }

    init();
  }, []);

  const { t, isDark, toggleDark } = useTheme();

  const skeletonBase: React.CSSProperties = {
    background: isDark
      ? "linear-gradient(90deg, #222 25%, #2a2a2a 50%, #222 75%)"
      : "linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)",
    backgroundSize: "200% 100%",
    borderRadius: 8,
  };

  const card: React.CSSProperties = { border: `1px solid ${t.border}`, borderRadius: 16, padding: 24, background: t.surface };
  const inputStyle: React.CSSProperties = { width: "100%", padding: 10, borderRadius: 10, border: `1px solid ${t.inputBorder}`, boxSizing: "border-box", background: t.input, color: t.text };
  const selectStyle: React.CSSProperties = { ...inputStyle, cursor: "pointer" };
  const pill: React.CSSProperties = { background: t.badgeBg, color: t.badgeText, borderRadius: 20, padding: "4px 12px", fontSize: 13, fontWeight: 700 };

  const fullName =
    profile?.display_name ||
    `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() ||
    "User";

  return (
    <div style={{ width: "100%", maxWidth: 1800, margin: "0 auto", padding: "24px 20px", boxSizing: "border-box" as const, background: t.bg, minHeight: "100vh", color: t.text }}>
      <NavBar />

      <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <h1 style={{ fontSize: 32, fontWeight: 900, marginTop: 20, color: t.text }}>My Account</h1>

      {/* Profile card */}
      <div style={{ marginTop: 24, ...card }}>
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
          {/* Clickable avatar */}
          <div
            onClick={() => !uploadingAvatar && photoInputRef.current?.click()}
            title={profile?.is_employer ? "Click to update logo" : "Click to update photo"}
            style={{ position: "relative", width: profile?.is_employer ? 160 : 120, height: profile?.is_employer ? 72 : 120, borderRadius: profile?.is_employer ? 12 : "50%", overflow: "hidden", background: profile?.is_employer ? "#f8f8f8" : t.bg, border: profile?.is_employer ? "3px solid #d97706" : undefined, display: "flex", alignItems: "center", justifyContent: "center", color: t.textMuted, fontWeight: 700, flexShrink: 0, cursor: uploadingAvatar ? "not-allowed" : "pointer", padding: 0, boxSizing: "border-box" }}
          >
            {profile?.photo_url ? (
              <img src={profile.photo_url} alt={fullName} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            ) : <span style={{ fontSize: 13 }}>{profile?.is_employer ? "Add Logo" : "Add Photo"}</span>}
            {/* Hover overlay */}
            <div style={{
              position: "absolute", inset: 0, borderRadius: "50%",
              background: "rgba(0,0,0,0.45)", display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 4,
              opacity: uploadingAvatar ? 1 : 0, transition: "opacity 0.2s",
            }}
              onMouseEnter={(e) => { if (!uploadingAvatar) e.currentTarget.style.opacity = "1"; }}
              onMouseLeave={(e) => { if (!uploadingAvatar) e.currentTarget.style.opacity = "0"; }}
            >
              <span style={{ fontSize: 22 }}>📷</span>
              <span style={{ fontSize: 11, color: "white", fontWeight: 700 }}>
                {uploadingAvatar ? "Uploading..." : "Update"}
              </span>
            </div>
            <input ref={photoInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} style={{ display: "none" }} />
          </div>

          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 28, fontWeight: 900, color: t.text }}>{fullName}</div>
                  {profile?.is_employer && (
                    <span style={{ background: profile.employer_verified ? "#1e40af" : "#6b7280", color: "white", borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 800, flexShrink: 0 }}>
                      {profile.employer_verified ? "✓ Verified Employer" : "Employer"}
                    </span>
                  )}
                </div>
                <div style={{ marginTop: 4, color: t.textMuted }}>{profile?.role || "No role added yet"}</div>
                {profile?.company_website && (
                  <div style={{ marginTop: 4, fontSize: 14 }}>
                    <a href={profile.company_website} target="_blank" rel="noreferrer" style={{ color: "#1d4ed8" }}>{profile.company_website}</a>
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={openEdit} style={{ background: t.surface, border: `1px solid ${t.inputBorder}`, color: t.text, borderRadius: 10, padding: "8px 16px", fontWeight: 700, cursor: "pointer" }}>
                  Edit Profile
                </button>
                {profile?.is_admin && (
                  <a href="/admin" style={{ display: "inline-block", background: "#111", color: "white", border: "none", borderRadius: 10, padding: "8px 16px", fontWeight: 700, cursor: "pointer", textDecoration: "none", fontSize: 14 }}>
                    Admin Panel
                  </a>
                )}
              </div>
            </div>

            <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 8 }}>
              {profile?.service && <span style={pill}>{profile.service}</span>}
              {profile?.status && <span style={pill}>{profile.status}</span>}
              {profile?.skill_badge && <span style={pill}>{profile.skill_badge} Badge</span>}
              {profile?.years_experience && <span style={pill}>{profile.years_experience} yrs exp</span>}
            </div>

            {profile?.bio && (
              <div style={{ marginTop: 12, color: t.textMuted, lineHeight: 1.6 }}>{profile.bio}</div>
            )}
          </div>
        </div>
        )}
      </div>

      {/* Toggles row */}
      {!loading && (
        <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
          {/* Dark Mode Toggle */}
          <div style={{ ...card, padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: t.text }}>Dark Mode</div>
              <div style={{ fontSize: 13, color: t.textMuted, marginTop: 3 }}>Black &amp; greyscale theme across all pages.</div>
            </div>
            <button
              onClick={toggleDark}
              style={{ width: 52, height: 28, borderRadius: 14, border: "none", cursor: "pointer", flexShrink: 0, background: isDark ? "#6366f1" : "#d1d5db", position: "relative", transition: "background 0.2s", padding: 0 }}
              aria-label="Toggle dark mode"
            >
              <span style={{ position: "absolute", top: 3, left: isDark ? 27 : 3, width: 22, height: 22, borderRadius: "50%", background: "white", boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transition: "left 0.2s", display: "block" }} />
            </button>
          </div>

          {/* Seeking Employment Toggle */}
          <div style={{ ...card, padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: t.text }}>Open to Opportunities</div>
              <div style={{ fontSize: 13, color: t.textMuted, marginTop: 3, lineHeight: 1.5 }}>
                Only visible to verified employer accounts — never shown to other members or publicly.
              </div>
            </div>
            <button
              onClick={toggleSeekingEmployment}
              disabled={togglingSeek}
              style={{ width: 52, height: 28, borderRadius: 14, border: "none", cursor: "pointer", flexShrink: 0, background: seekingEmployment ? "#16a34a" : "#d1d5db", position: "relative", transition: "background 0.2s", padding: 0 }}
              aria-label="Toggle seeking employment"
            >
              <span style={{ position: "absolute", top: 3, left: seekingEmployment ? 27 : 3, width: 22, height: 22, borderRadius: "50%", background: "white", boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transition: "left 0.2s", display: "block" }} />
            </button>
          </div>
        </div>
      )}

      {/* Billing Card — employers are always free, members/businesses show subscription status */}
      {!loading && profile?.account_type !== "employer" && (
        <div style={{ marginTop: 16 }}>
          <BillingCard subscriptionStatus={profile?.subscription_status ?? null} />
        </div>
      )}

      {/* Edit Profile Form */}
      {editing && (
        <div style={{ marginTop: 16, ...card }}>
          <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 16, color: t.text }}>Edit Profile</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={{ fontWeight: 700, display: "block", marginBottom: 5, color: t.text }}>Role / Job Title</label>
              <input value={editRole} onChange={(e) => setEditRole(e.target.value)} placeholder="e.g. EOD Tech" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontWeight: 700, display: "block", marginBottom: 5, color: t.text }}>Service Branch</label>
              <select value={editService} onChange={(e) => setEditService(e.target.value)} style={selectStyle}>
                <option value="">Select service...</option>
                {SERVICE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontWeight: 700, display: "block", marginBottom: 5, color: t.text }}>Status</label>
              <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)} style={selectStyle}>
                <option value="">Select status...</option>
                {STATUS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontWeight: 700, display: "block", marginBottom: 5, color: t.text }}>Skill Badge</label>
              <select value={editSkillBadge} onChange={(e) => setEditSkillBadge(e.target.value)} style={selectStyle}>
                <option value="">Select badge...</option>
                {SKILL_BADGE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontWeight: 700, display: "block", marginBottom: 5, color: t.text }}>Years of Experience</label>
              <select value={editYearsExp} onChange={(e) => setEditYearsExp(e.target.value)} style={selectStyle}>
                <option value="">Select years...</option>
                {YEARS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            {profile?.is_employer && (
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontWeight: 700, display: "block", marginBottom: 5, color: t.text }}>Company Website</label>
                <input value={editCompanyWebsite} onChange={(e) => setEditCompanyWebsite(e.target.value)} placeholder="https://yourcompany.com" style={inputStyle} />
              </div>
            )}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontWeight: 700, display: "block", marginBottom: 5, color: t.text }}>Bio</label>
              <textarea value={editBio} onChange={(e) => setEditBio(e.target.value)} placeholder="Tell people about yourself..." rows={4} style={{ ...inputStyle, resize: "vertical", fontSize: 14, fontFamily: "inherit" }} />
            </div>
          </div>
          <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
            <button onClick={handleSaveProfile} disabled={savingProfile} style={{ background: "#111", color: "white", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 700, cursor: savingProfile ? "not-allowed" : "pointer", opacity: savingProfile ? 0.7 : 1, display: "flex", alignItems: "center", gap: 6 }}>
              {savingProfile && <span className="btn-spinner" />}
              Save Changes
            </button>
            <button onClick={() => setEditing(false)} style={{ background: t.surface, border: `1px solid ${t.inputBorder}`, color: t.text, borderRadius: 10, padding: "10px 20px", fontWeight: 700, cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Employer Dashboard */}
      {profile?.is_employer && (
        <div style={{ marginTop: 24, ...card }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: t.text }}>Your Job Postings</div>
            <a href="/post-job" style={{ background: "#7c3aed", color: "white", borderRadius: 10, padding: "7px 16px", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>+ Post Job</a>
          </div>
          {employerJobs.length === 0 ? (
            <div style={{ color: t.textMuted }}>No jobs posted yet. <a href="/post-job" style={{ color: "#1d4ed8" }}>Post your first listing →</a></div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {employerJobs.map((job) => (
                <div key={job.id} style={{ border: `1px solid ${t.border}`, borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: t.bg }}>
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <div style={{ fontWeight: 800, fontSize: 15, color: t.text }}>{job.title || "Untitled"}</div>
                    {job.company_name && <div style={{ fontSize: 13, color: t.textMuted, marginTop: 2 }}>{job.company_name}</div>}
                    <div style={{ fontSize: 12, color: t.textFaint, marginTop: 2 }}>{job.created_at ? new Date(job.created_at).toLocaleDateString() : ""}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", flexShrink: 0 }}>
                    <span style={{ background: job.is_approved ? "#dcfce7" : "#fef3c7", color: job.is_approved ? "#15803d" : "#92400e", borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 700 }}>
                      {job.is_approved ? "Live" : "Pending"}
                    </span>
                    {job.saveCount > 0 && (
                      <span style={{ background: "#ede9fe", color: "#6d28d9", borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 700 }}>
                        {job.saveCount} saved
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Saved Jobs */}
      <div style={{ marginTop: 24, ...card }}>
        <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 16, color: t.text }}>Saved Jobs</div>
        {savedJobs.length === 0 ? (
          <div style={{ color: t.textMuted }}>No saved jobs yet. Save jobs from the feed to see them here.</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {savedJobs.map((job) => (
              <div key={job.id} style={{ border: `1px solid ${t.border}`, borderRadius: 12, padding: 16, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16, color: t.text }}>{job.title || "Untitled Job"}</div>
                  <div style={{ marginTop: 4, fontSize: 14, color: t.textMuted }}>{job.company_name || "Unknown Company"}</div>
                  <div style={{ marginTop: 4, fontSize: 13, color: t.textMuted }}>{[job.location, job.category].filter(Boolean).join(" • ")}</div>
                  {job.apply_url && (
                    <a href={job.apply_url} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 10, fontWeight: 700, fontSize: 14, color: t.text }}>
                      View Job
                    </a>
                  )}
                </div>
                <button type="button" onClick={() => unsaveJob(job.id)} disabled={unsavingJobId === job.id} style={{ background: "transparent", border: `1px solid ${t.border}`, color: t.textMuted, borderRadius: 8, padding: "6px 12px", fontSize: 13, fontWeight: 700, cursor: unsavingJobId === job.id ? "not-allowed" : "pointer", opacity: unsavingJobId === job.id ? 0.6 : 1, flexShrink: 0, display: "flex", alignItems: "center", gap: 5 }}>
                  {unsavingJobId === job.id && <span className="btn-spinner btn-spinner-dark" />}
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* My Units */}
      <div style={{ marginTop: 24, ...card }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: t.text }}>My Units</div>
          <a href="/units" style={{ fontSize: 13, fontWeight: 700, color: t.textMuted, textDecoration: "none" }}>Browse all →</a>
        </div>
        {myUnits.length === 0 ? (
          <div style={{ color: t.textMuted, fontSize: 14 }}>
            You haven&apos;t joined any units yet.{" "}
            <a href="/units" style={{ color: t.text, fontWeight: 700, textDecoration: "none" }}>Find or create one →</a>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {myUnits.map((u) => (
              <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", border: `1px solid ${t.border}`, borderRadius: 12, background: t.surface }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: u.cover_photo_url ? `url(${u.cover_photo_url}) center/cover` : "#1e3a5f", flexShrink: 0 }} />
                <a href={`/units/${u.slug}`} style={{ flex: 1, minWidth: 0, textDecoration: "none", color: t.text }}>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{u.name}</div>
                  <div style={{ fontSize: 12, color: t.textMuted, textTransform: "capitalize" }}>{u.type.replace(/_/g, " ")}</div>
                </a>
                {(u.my_role === "owner" || u.my_role === "admin") && (
                  <a
                    href={`/units/${u.slug}/admin`}
                    style={{ padding: "5px 12px", borderRadius: 8, background: "#1e3a5f", color: "#fff", fontSize: 12, fontWeight: 800, textDecoration: "none", flexShrink: 0 }}
                  >
                    Admin
                  </a>
                )}
                <a href={`/units/${u.slug}`} style={{ fontSize: 18, color: t.textFaint, textDecoration: "none" }}>›</a>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Saved Events */}
      <div style={{ marginTop: 24, marginBottom: 40, ...card }}>
        <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 16, color: t.text }}>Saved Events</div>
        {savedEvents.length === 0 ? (
          <div style={{ color: t.textMuted }}>No saved events yet. Save events from the Events calendar to see them here.</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {savedEvents.map((ev) => (
              <div key={ev.id} style={{ border: `1px solid ${t.border}`, borderRadius: 12, padding: 16, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16, color: t.text }}>{ev.title || "Untitled Event"}</div>
                  {ev.organization && <div style={{ marginTop: 4, fontSize: 14, color: t.textMuted }}>{ev.organization}</div>}
                  {ev.date && <div style={{ marginTop: 4, fontSize: 13, color: t.textMuted }}>{new Date(ev.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric" })}</div>}
                  {ev.description && <div style={{ marginTop: 6, fontSize: 13, color: t.textMuted, lineHeight: 1.5 }}>{ev.description}</div>}
                  {ev.signup_url && (
                    <a href={ev.signup_url} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 10, fontWeight: 700, fontSize: 14, color: t.text }}>
                      View / Sign Up →
                    </a>
                  )}
                </div>
                <button type="button" onClick={() => unsaveEvent(ev.id)} disabled={unsavingEventId === ev.id} style={{ background: "transparent", border: `1px solid ${t.border}`, color: t.textMuted, borderRadius: 8, padding: "6px 12px", fontSize: 13, fontWeight: 700, cursor: unsavingEventId === ev.id ? "not-allowed" : "pointer", opacity: unsavingEventId === ev.id ? 0.6 : 1, flexShrink: 0, display: "flex", alignItems: "center", gap: 5 }}>
                  {unsavingEventId === ev.id && <span className="btn-spinner btn-spinner-dark" />}
                  Remove
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