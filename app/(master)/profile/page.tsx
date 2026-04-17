"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/lib/supabaseClient";
import NavBar from "../../components/NavBar";
import { useTheme } from "../../lib/ThemeContext";
import ReportProblemButton from "../../components/ReportProblemButton";
import { fetchAdminPendingBreakdown, formatNavBadgeCount, sumAdminPending } from "../../lib/adminPendingCounts";
import { useMasterShell } from "../../components/master/masterShellContext";

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
  account_type: string | null;
  subscription_status: string | null;
  is_employer: boolean | null;
  employer_verified: boolean | null;
  company_website: string | null;
};

export default function MyAccountPage() {
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [adminPendingCount, setAdminPendingCount] = useState(0);
  const [authProviders, setAuthProviders] = useState<string[]>([]);
  const [linkingGoogle, setLinkingGoogle] = useState(false);
  const [linkedSuccess, setLinkedSuccess] = useState(false);

  const [employerJobs, setEmployerJobs] = useState<{ id: string; title: string | null; company_name: string | null; is_approved: boolean | null; created_at: string | null; saveCount: number }[]>([]);

  const [savedJobs, setSavedJobs] = useState<SavedJob[]>([]);
  const [unsavingJobId, setUnsavingJobId] = useState<string | null>(null);

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

  async function loadAdminPendingCount() {
    const b = await fetchAdminPendingBreakdown(supabase);
    setAdminPendingCount(sumAdminPending(b));
  }

  async function loadProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("Error loading profile:", error);
      return null;
    }

    const p = (data as Profile | null) ?? null;
    setProfile(p);
    if (p?.is_employer) loadEmployerJobs(userId);
    return p;
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
      setAuthProviders((data.user?.identities ?? []).map((i: { provider: string }) => i.provider));
      const p = await loadProfile(userId);
      if (p && !p.is_employer) await loadSavedJobs(userId);
      if (p?.is_admin) loadAdminPendingCount();
      // Show success toast if returning from a Google link
      const params = new URLSearchParams(window.location.search);
      if (params.get("linked") === "google") setLinkedSuccess(true);
      setLoading(false);
    }

    init();
  }, []);

  useEffect(() => {
    if (!profile?.is_admin) return;
    let cancelled = false;
    async function tick() {
      const b = await fetchAdminPendingBreakdown(supabase);
      if (!cancelled) setAdminPendingCount(sumAdminPending(b));
    }
    void tick();
    const onVis = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVis);
    const id = window.setInterval(() => void tick(), 120_000);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(id);
    };
  }, [profile?.is_admin]);

  const { t, isDark, toggleDark } = useTheme();
  const { isDesktopShell } = useMasterShell();

  const card: React.CSSProperties = { border: `1px solid ${t.border}`, borderRadius: 16, padding: 24, background: t.surface };

  return (
    <div style={{ width: "100%", maxWidth: 1800, margin: "0 auto", padding: "12px 20px 24px", boxSizing: "border-box" as const, background: t.bg, minHeight: "100vh", color: t.text }}>
      {!isDesktopShell && <NavBar />}

      <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <h1 style={{ fontSize: 32, fontWeight: 900, marginTop: 6, color: t.text }}>My Account</h1>
      <p style={{ fontSize: 14, color: t.textMuted, lineHeight: 1.55, marginTop: 10, marginBottom: 0 }}>
        Account settings, sign-in, billing, and saved jobs. Your profile, photo, saved events, and groups are on your profile page.
      </p>
      <nav aria-label="Legal" style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <a
          href="/privacy"
          style={{ fontSize: 12, color: t.textMuted, textDecoration: "underline", textUnderlineOffset: 2 }}
        >
          Privacy Policy
        </a>
        <span aria-hidden="true" style={{ color: t.textFaint, fontSize: 11 }}>•</span>
        <a
          href="/terms"
          style={{ fontSize: 12, color: t.textMuted, textDecoration: "underline", textUnderlineOffset: 2 }}
        >
          Terms of Service
        </a>
      </nav>
      {!loading && currentUserId && (
        <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <a
            href={`/profile/${currentUserId}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              background: t.text,
              color: t.surface,
              borderRadius: 10,
              padding: "8px 16px",
              fontWeight: 700,
              fontSize: 14,
              textDecoration: "none",
            }}
          >
            View my profile
          </a>
          {profile?.is_admin && (
            <a href="/admin" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#111", color: "white", border: "none", borderRadius: 10, padding: "8px 16px", fontWeight: 700, cursor: "pointer", textDecoration: "none", fontSize: 14 }}>
              Admin Panel
              {adminPendingCount > 0 && (
                <span style={{ background: "#fbbf24", color: "black", borderRadius: 20, minWidth: 18, height: 18, fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px", lineHeight: 1 }}>
                  {formatNavBadgeCount(adminPendingCount)}
                </span>
              )}
            </a>
          )}
        </div>
      )}

      {/* Toggles row */}
      {!loading && (
        <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
          {/* Sign-In Methods */}
          <div style={{ ...card, padding: "18px 24px" }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: t.text, marginBottom: 8 }}>Sign-In Methods</div>
            <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.5, marginBottom: 12 }}>
              Link Google and email on one account when you can. If the same address was used for separate logins (for example member vs employer), use the <strong>avatar menu</strong> at the top of the site to switch between them.
            </div>
            {linkedSuccess && (
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#166534", fontWeight: 700, marginBottom: 12 }}>
                ✓ Google account linked successfully!
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${t.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 16 }}>✉️</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: t.text }}>Email & Password</div>
                    <div style={{ fontSize: 12, color: t.textMuted }}>Sign in with your email address</div>
                  </div>
                </div>
                {authProviders.includes("email") ? (
                  <span style={{ background: "#dcfce7", color: "#166534", fontSize: 11, fontWeight: 800, padding: "2px 10px", borderRadius: 20 }}>Linked</span>
                ) : (
                  <span style={{ fontSize: 12, color: t.textFaint }}>Not linked</span>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 16 }}>G</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: t.text }}>Google</div>
                    <div style={{ fontSize: 12, color: t.textMuted }}>Sign in with your Google account</div>
                  </div>
                </div>
                {authProviders.includes("google") ? (
                  <span style={{ background: "#dcfce7", color: "#166534", fontSize: 11, fontWeight: 800, padding: "2px 10px", borderRadius: 20 }}>Linked</span>
                ) : (
                  <button
                    onClick={async () => {
                      setLinkingGoogle(true);
                      await supabase.auth.linkIdentity({
                        provider: "google",
                        options: { redirectTo: `${window.location.origin}/profile?linked=google` },
                      });
                      setLinkingGoogle(false);
                    }}
                    disabled={linkingGoogle}
                    style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.surface, color: t.text, fontWeight: 700, fontSize: 12, cursor: "pointer", opacity: linkingGoogle ? 0.6 : 1 }}
                  >
                    {linkingGoogle ? "Redirecting..." : "Link Google"}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Report Issue */}
          <div style={{ ...card, padding: "18px 24px" }}>
            <ReportProblemButton inline />
          </div>

          {/* Theme: default dark; toggle label shows the mode you switch to */}
          <div style={{ ...card, padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: t.text }}>{isDark ? "Light mode" : "Dark mode"}</div>
              <div style={{ fontSize: 13, color: t.textMuted, marginTop: 3 }}>
                {isDark
                  ? "Switch to a light theme across all pages."
                  : "Switch to the default dark theme across all pages."}
              </div>
            </div>
            <button
              onClick={toggleDark}
              style={{ width: 52, height: 28, borderRadius: 14, border: "none", cursor: "pointer", flexShrink: 0, background: isDark ? "#6366f1" : "#d1d5db", position: "relative", transition: "background 0.2s", padding: 0 }}
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              <span style={{ position: "absolute", top: 3, left: isDark ? 27 : 3, width: 22, height: 22, borderRadius: "50%", background: "white", boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transition: "left 0.2s", display: "block" }} />
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

      {/* Saved Jobs — members only; one line per job */}
      {!loading && !profile?.is_employer && (
        <div style={{ marginTop: 24, ...card }}>
          <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 16, color: t.text }}>Saved Jobs</div>
          {savedJobs.length === 0 ? (
            <div style={{ color: t.textMuted, fontSize: 14 }}>No saved jobs yet. Save listings from the jobs feed.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {savedJobs.map((job) => {
                const meta = [job.company_name, job.location, job.category].filter(Boolean).join(" · ");
                return (
                  <div
                    key={job.id}
                    style={{
                      border: `1px solid ${t.border}`,
                      borderRadius: 12,
                      padding: "12px 14px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                      background: t.bg,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0, fontSize: 14, color: t.text, lineHeight: 1.4 }}>
                      <span style={{ fontWeight: 800 }}>{job.title || "Untitled Job"}</span>
                      {meta ? <span style={{ color: t.textMuted, fontWeight: 500 }}> · {meta}</span> : null}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                      {job.apply_url && (
                        <a href={job.apply_url} target="_blank" rel="noreferrer" style={{ fontWeight: 700, fontSize: 13, color: "#2563eb", textDecoration: "none", whiteSpace: "nowrap" }}>
                          View
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => unsaveJob(job.id)}
                        disabled={unsavingJobId === job.id}
                        style={{
                          background: "transparent",
                          border: `1px solid ${t.border}`,
                          color: t.textMuted,
                          borderRadius: 8,
                          padding: "6px 12px",
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: unsavingJobId === job.id ? "not-allowed" : "pointer",
                          opacity: unsavingJobId === job.id ? 0.6 : 1,
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {unsavingJobId === job.id && <span className="btn-spinner btn-spinner-dark" />}
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div style={{ marginBottom: 40 }} />
      </div>
    </div>
  );
}