"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import UpgradePromptModal from "../components/UpgradePromptModal";
import { useTheme } from "../lib/ThemeContext";
import { supabase } from "../lib/lib/supabaseClient";
import { getFeatureAccess } from "../lib/featureAccess";
import { applyJobFilters, uniqueJobLocations, type JobFilterState, type JobListItem } from "../lib/jobFilters";

type ProfileRow = {
  access_tier: string | null;
  verification_status: string | null;
};

type SavedJobRow = {
  id: string;
  job_id: string;
  title: string | null;
  company_name: string | null;
  location: string | null;
  category: string | null;
  apply_url: string | null;
  created_at: string | null;
};

const DEFAULT_FILTERS: JobFilterState = {
  location: "",
  keyword: "",
};

export default function JobsPage() {
  const { t } = useTheme();
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [filters, setFilters] = useState<JobFilterState>(DEFAULT_FILTERS);
  const [isMobile, setIsMobile] = useState(false);
  const [canViewFullJobs, setCanViewFullJobs] = useState(true);
  const [canUseJobFilters, setCanUseJobFilters] = useState(true);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [savedJobs, setSavedJobs] = useState<SavedJobRow[]>([]);
  const [unsavingJobId, setUnsavingJobId] = useState<string | null>(null);
  const [savedExpanded, setSavedExpanded] = useState(false);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 900);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const loadSavedJobs = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from("saved_jobs")
      .select("id, job_id, jobs(title, company_name, location, category, apply_url, created_at)")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Saved jobs load error:", error);
      setSavedJobs([]);
      return;
    }

    type RawRow = {
      id: string;
      job_id: string;
      jobs:
        | { title: string | null; company_name: string | null; location: string | null; category: string | null; apply_url: string | null; created_at: string | null }
        | { title: string | null; company_name: string | null; location: string | null; category: string | null; apply_url: string | null; created_at: string | null }[]
        | null;
    };

    const rows = ((data ?? []) as unknown as RawRow[]).map((r) => {
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
    });
    setSavedJobs(rows);
  }, []);

  async function unsaveJob(savedJobRowId: string) {
    try {
      setUnsavingJobId(savedJobRowId);
      const removed = savedJobs.find((j) => j.id === savedJobRowId);
      await supabase.from("saved_jobs").delete().eq("id", savedJobRowId);
      setSavedJobs((prev) => prev.filter((j) => j.id !== savedJobRowId));
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("eod:saved-jobs-changed", { detail: { jobId: removed?.job_id ?? null } })
        );
      }
    } catch (err) {
      console.error("Unsave job error:", err);
    } finally {
      setUnsavingJobId(null);
    }
  }

  useEffect(() => {
    let mounted = true;

    async function init() {
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData.user?.id ?? null;
      if (!uid) {
        window.location.href = "/login";
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("access_tier, verification_status")
        .eq("user_id", uid)
        .maybeSingle();

      const p = (profile ?? null) as ProfileRow | null;
      if (!p || p.verification_status !== "verified") {
        window.location.href = "/pending";
        return;
      }

      const featureAccess = getFeatureAccess(p.access_tier);
      if (!mounted) return;
      setUserId(uid);
      setCanViewFullJobs(featureAccess.canViewFullJobs);
      setCanUseJobFilters(featureAccess.canUseJobFilters);

      const limit = featureAccess.canViewFullJobs ? 500 : 5;
      const [{ data: jobsData, error }] = await Promise.all([
        supabase
          .from("jobs")
          .select("id, created_at, title, category, location, pay_min, pay_max, clearance, description, apply_url, company_name, source_type, og_title, og_description, og_image, og_site_name")
          .eq("is_approved", true)
          .order("created_at", { ascending: false })
          .limit(limit),
        loadSavedJobs(uid),
      ]);

      if (error) {
        console.error("Jobs page load error:", error);
        if (mounted) setJobs([]);
      } else if (mounted) {
        setJobs((jobsData ?? []) as JobListItem[]);
      }
      if (mounted) setLoading(false);
    }

    void init();
    return () => {
      mounted = false;
    };
  }, [loadSavedJobs]);

  useEffect(() => {
    if (!userId) return;
    const onChanged = () => {
      void loadSavedJobs(userId);
    };
    window.addEventListener("eod:saved-jobs-changed", onChanged as EventListener);
    return () => {
      window.removeEventListener("eod:saved-jobs-changed", onChanged as EventListener);
    };
  }, [userId, loadSavedJobs]);

  const locationOptions = useMemo(() => uniqueJobLocations(jobs), [jobs]);
  const visibleJobs = useMemo(() => {
    if (!canUseJobFilters) return jobs;
    return applyJobFilters(jobs, filters);
  }, [jobs, filters, canUseJobFilters]);

  return (
    <div
      style={{
        width: "100%",
        boxSizing: "border-box",
        color: t.text,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>Jobs</h1>
          <div style={{ marginTop: 6, fontSize: 14, color: t.textMuted }}>
            {canViewFullJobs
              ? "Browse the full approved job board."
              : "Previewing the 5 most recent approved jobs."}
          </div>
        </div>
        {!canViewFullJobs && (
          <button
            type="button"
            onClick={() => setShowUpgradePrompt(true)}
            style={{ background: "#111", color: "white", border: "none", borderRadius: 10, padding: "8px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
          >
            See All Jobs
          </button>
        )}
      </div>

      {canUseJobFilters && (
        <div style={{ border: `1px solid ${t.border}`, borderRadius: 12, background: t.surface, padding: 12, marginBottom: 14 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
              gap: 10,
            }}
          >
            <input
              type="text"
              value={filters.keyword}
              onChange={(e) => setFilters((prev) => ({ ...prev, keyword: e.target.value }))}
              placeholder="Keyword/tag (e.g. UXO, TSS-E, Safety)"
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, background: t.input, color: t.text, boxSizing: "border-box" }}
            />

            <select
              value={filters.location}
              onChange={(e) => setFilters((prev) => ({ ...prev, location: e.target.value }))}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, background: t.input, color: t.text }}
            >
              <option value="">All locations</option>
              {locationOptions.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {!loading && userId && (
        <div style={{ border: `1px solid ${t.border}`, borderRadius: 12, background: t.surface, padding: 12, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 900, color: t.text }}>Saved jobs</div>
              <div style={{ fontSize: 12, color: t.textMuted, fontWeight: 600 }}>
                {savedJobs.length === 0 ? "None saved" : `${savedJobs.length} saved`}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 11, color: t.textFaint, fontWeight: 700 }}>*not visible to other users</span>
              {savedJobs.length > 3 && (
                <button
                  type="button"
                  onClick={() => setSavedExpanded((v) => !v)}
                  style={{ background: "transparent", border: `1px solid ${t.border}`, color: t.text, borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                >
                  {savedExpanded ? "Show less" : `Show all (${savedJobs.length})`}
                </button>
              )}
            </div>
          </div>

          {savedJobs.length === 0 ? (
            <div style={{ marginTop: 10, fontSize: 13, color: t.textMuted }}>
              No saved jobs yet. Tap &quot;Save&quot; on any listing below to keep it here.
            </div>
          ) : (
            <div
              style={{
                marginTop: 10,
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(260px, 1fr))",
                gap: 10,
              }}
            >
              {(savedExpanded ? savedJobs : savedJobs.slice(0, isMobile ? 3 : 6)).map((job) => {
                const meta = [job.company_name, job.location, job.category].filter(Boolean).join(" · ");
                return (
                  <div
                    key={job.id}
                    style={{ border: `1px solid ${t.border}`, borderRadius: 10, background: t.bg, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 800, color: t.text, lineHeight: 1.3 }}>
                      {job.title || "Untitled Job"}
                    </div>
                    {meta && (
                      <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.35 }}>{meta}</div>
                    )}
                    <div style={{ marginTop: 2, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <a href={`/job/${job.job_id}`} style={{ fontSize: 12, fontWeight: 700, color: "#2563eb", textDecoration: "none" }}>
                        Details
                      </a>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {job.apply_url && (
                          <a href={job.apply_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 700, color: "#2563eb", textDecoration: "none" }}>
                            Apply
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => unsaveJob(job.id)}
                          disabled={unsavingJobId === job.id}
                          style={{
                            background: "#111",
                            color: "white",
                            border: "none",
                            borderRadius: 8,
                            padding: "4px 10px",
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: unsavingJobId === job.id ? "not-allowed" : "pointer",
                            opacity: unsavingJobId === job.id ? 0.6 : 1,
                          }}
                        >
                          {unsavingJobId === job.id ? "..." : "Remove"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 14, color: t.textMuted }}>Loading jobs...</div>
      ) : visibleJobs.length === 0 ? (
        <div style={{ fontSize: 14, color: t.textMuted }}>No approved jobs found.</div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(300px, 1fr))",
            gap: 12,
          }}
        >
          {visibleJobs.map((job) => (
            <div key={job.id} style={{ border: `1px solid ${t.border}`, borderRadius: 12, overflow: "hidden", background: t.surface }}>
              {job.og_image ? (
                <img src={job.og_image} alt={job.title || "Job preview"} style={{ width: "100%", height: 150, objectFit: "cover", display: "block" }} />
              ) : null}
              <div style={{ padding: 12 }}>
                <div style={{ fontWeight: 800, fontSize: 16, lineHeight: 1.3 }}>{job.title || job.og_title || "Untitled Job"}</div>
                <div style={{ marginTop: 5, color: t.textMuted, fontSize: 14 }}>{job.company_name || job.og_site_name || "Unknown Company"}</div>
                <div style={{ marginTop: 6, color: t.textMuted, fontSize: 13 }}>
                  {(job.location || "Location not listed") + " - " + (job.category || "General")}
                </div>
                {(job.pay_min !== null || job.pay_max !== null) && (
                  <div style={{ marginTop: 6, color: t.textMuted, fontSize: 13 }}>
                    Salary: {job.pay_min ?? "?"} - {job.pay_max ?? "?"}
                  </div>
                )}
                {job.description && (
                  <div style={{ marginTop: 8, color: t.textMuted, fontSize: 13, lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {job.description}
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, gap: 8, flexWrap: "wrap" }}>
                  <a href={`/job/${job.id}`} style={{ fontSize: 13, fontWeight: 700 }}>
                    Details
                  </a>
                  {job.apply_url && (
                    <a href={job.apply_url} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 700 }}>
                      Apply
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <UpgradePromptModal open={showUpgradePrompt} onClose={() => setShowUpgradePrompt(false)} />
    </div>
  );
}
