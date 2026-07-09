"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/lib/supabaseClient";
import { useTheme } from "../../lib/ThemeContext";
import ReportProblemButton from "../../components/ReportProblemButton";
import PrivacySettingsCard from "../../components/account/PrivacySettingsCard";
import BlockedUsersCard from "../../components/account/BlockedUsersCard";
import MemorialFeedPreferencesCard from "../../components/account/MemorialFeedPreferencesCard";
import NotificationPreferencesCard from "../../components/account/NotificationPreferencesCard";
import ChangePasswordSection from "../../components/account/ChangePasswordSection";
import DeleteAccountSection from "../../components/account/DeleteAccountSection";
import { fetchAdminPendingBreakdown, formatNavBadgeCount, sumAdminPending } from "../../lib/adminPendingCounts";
import { hasPublicMemberProfile } from "../../lib/pureAdminAllowlist";
import EmployerAccountCardDetails from "../../components/profile/EmployerAccountCardDetails";
import { linkOAuthIdentity } from "../../lib/auth/oauthSignIn";

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
  company_name: string | null;
  company_website: string | null;
  verification_status: string | null;
  is_pure_admin: boolean | null;
  email: string | null;
  must_change_password: boolean | null;
};

export default function MyAccountPage() {
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [authCreatedAt, setAuthCreatedAt] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [adminPendingCount, setAdminPendingCount] = useState(0);
  const [authProviders, setAuthProviders] = useState<string[]>([]);
  const [linkingGoogle, setLinkingGoogle] = useState(false);
  const [linkingApple, setLinkingApple] = useState(false);
  const [linkedSuccess, setLinkedSuccess] = useState<string | null>(null);

  const [employerJobs, setEmployerJobs] = useState<{ id: string; title: string | null; company_name: string | null; is_approved: boolean | null; created_at: string | null; saveCount: number }[]>([]);

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
      setAuthCreatedAt(data.user?.created_at ?? null);
      setAuthProviders((data.user?.identities ?? []).map((i: { provider: string }) => i.provider));
      const p = await loadProfile(userId);
      if (p?.is_admin) loadAdminPendingCount();
      const params = new URLSearchParams(window.location.search);
      const linked = params.get("linked");
      if (linked === "google" || linked === "apple") setLinkedSuccess(linked);
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
  const card: React.CSSProperties = { border: `1px solid ${t.border}`, borderRadius: 16, padding: 24, background: t.surface };

  return (
    <div style={{ width: "100%", maxWidth: 1800, margin: "0 auto", padding: "12px 20px 24px", boxSizing: "border-box" as const, background: t.bg, minHeight: "100vh", color: t.text }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <h1 style={{ fontSize: 32, fontWeight: 900, marginTop: 6, color: t.text }}>My Account</h1>
      <p style={{ fontSize: 14, color: t.textMuted, lineHeight: 1.55, marginTop: 10, marginBottom: 0 }}>
        Account settings and sign-in tools. Your profile, photo, saved events, saved jobs, and groups are on your profile page and the jobs page.
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
          {profile && hasPublicMemberProfile(profile) && (
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
          )}
          {profile?.is_admin && (
            <>
              <a href="/admin" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#111", color: "white", border: "none", borderRadius: 10, padding: "8px 16px", fontWeight: 700, cursor: "pointer", textDecoration: "none", fontSize: 14 }}>
                Admin Panel
                {adminPendingCount > 0 && (
                  <span style={{ background: "#fbbf24", color: "black", borderRadius: 20, minWidth: 18, height: 18, fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px", lineHeight: 1 }}>
                    {formatNavBadgeCount(adminPendingCount)}
                  </span>
                )}
              </a>
              <a href="/employer" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: t.surface, color: t.text, border: `1px solid ${t.border}`, borderRadius: 10, padding: "8px 16px", fontWeight: 700, cursor: "pointer", textDecoration: "none", fontSize: 14 }}>
                Employer Dashboard (QA)
              </a>
            </>
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
              Keep Email/Password, Google Auth, and Apple Auth on one account when you can. If the same address was used for separate logins (for example member vs employer), use the <strong>avatar menu</strong> at the top of the site to switch between them.
            </div>
            {linkedSuccess && (
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#166534", fontWeight: 700, marginBottom: 12 }}>
                ✓ {linkedSuccess === "apple" ? "Apple Auth" : "Google Auth"} linked successfully!
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
              <ChangePasswordSection
                hasEmailPassword={authProviders.includes("email")}
                mustChangePassword={!!profile?.must_change_password}
                onProvidersChange={setAuthProviders}
                onPasswordChanged={() => {
                  setProfile((prev) => (prev ? { ...prev, must_change_password: false } : prev));
                }}
              />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${t.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 16 }}>G</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: t.text }}>Google Auth</div>
                    <div style={{ fontSize: 12, color: t.textMuted }}>Use Google Auth to sign in</div>
                  </div>
                </div>
                {authProviders.includes("google") ? (
                  <span style={{ background: "#dcfce7", color: "#166534", fontSize: 11, fontWeight: 800, padding: "2px 10px", borderRadius: 20 }}>Linked</span>
                ) : (
                  <button
                    onClick={async () => {
                      setLinkingGoogle(true);
                      await linkOAuthIdentity(supabase, "google", "/profile?linked=google");
                      setLinkingGoogle(false);
                    }}
                    disabled={linkingGoogle}
                    style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.surface, color: t.text, fontWeight: 700, fontSize: 12, cursor: "pointer", opacity: linkingGoogle ? 0.6 : 1 }}
                  >
                    {linkingGoogle ? "Redirecting..." : "Link"}
                  </button>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ display: "inline-flex", color: t.text }} aria-hidden>
                    <AppleAuthIcon />
                  </span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: t.text }}>Apple Auth</div>
                    <div style={{ fontSize: 12, color: t.textMuted }}>Use Apple Auth to sign in</div>
                  </div>
                </div>
                {authProviders.includes("apple") ? (
                  <span style={{ background: "#dcfce7", color: "#166534", fontSize: 11, fontWeight: 800, padding: "2px 10px", borderRadius: 20 }}>Linked</span>
                ) : (
                  <button
                    onClick={async () => {
                      setLinkingApple(true);
                      await linkOAuthIdentity(supabase, "apple", "/profile?linked=apple");
                      setLinkingApple(false);
                    }}
                    disabled={linkingApple}
                    style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.surface, color: t.text, fontWeight: 700, fontSize: 12, cursor: "pointer", opacity: linkingApple ? 0.6 : 1 }}
                  >
                    {linkingApple ? "Redirecting..." : "Link"}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Privacy */}
          {currentUserId && <PrivacySettingsCard userId={currentUserId} />}
          {currentUserId && <BlockedUsersCard userId={currentUserId} />}

          {/* Close account */}
          <DeleteAccountSection isPureAdmin={profile?.is_pure_admin} />

          {/* Email notifications */}
          {currentUserId && <NotificationPreferencesCard userId={currentUserId} />}

          {/* Home feed: memorial anniversary post cards (calendars unchanged) */}
          {currentUserId && <MemorialFeedPreferencesCard userId={currentUserId} />}

          {/* Beta bug report */}
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

      {/* Employer account summary */}
      {profile?.is_employer && (
        <div style={{ marginTop: 24, ...card }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: t.text }}>Employer Account</div>
            {currentUserId && (
              <a href={`/profile/${currentUserId}`} style={{ background: t.text, color: t.surface, borderRadius: 10, padding: "7px 14px", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>
                View employer profile →
              </a>
            )}
          </div>
          <EmployerAccountCardDetails
            companyName={profile.company_name}
            firstName={profile.first_name}
            lastName={profile.last_name}
            email={profile.email}
            companyWebsite={profile.company_website}
            employerVerified={profile.employer_verified}
            verificationStatus={profile.verification_status}
            bio={profile.bio}
            showEmail
            borderColor={t.border}
            textColor={t.text}
            textMuted={t.textMuted}
            textFaint={t.textFaint}
          />
        </div>
      )}

      {/* Employer Dashboard */}
      {profile?.is_employer && (
        <div style={{ marginTop: 24, ...card }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: t.text }}>Your Job Postings</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <a href="/employer" style={{ background: t.text, color: t.surface, borderRadius: 10, padding: "7px 14px", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>Employer Dashboard →</a>
              <a href="/post-job" style={{ background: "#7c3aed", color: "white", borderRadius: 10, padding: "7px 16px", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>+ Post Job</a>
            </div>
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

      <div style={{ marginBottom: 40 }} />
      </div>
    </div>
  );
}

function AppleAuthIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M17.05 20.28c-.96.95-2.1.85-3.2.36-1.14-.5-2.18-.48-3.38 0-1.54.62-2.35.44-3.2-.36C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"
      />
    </svg>
  );
}